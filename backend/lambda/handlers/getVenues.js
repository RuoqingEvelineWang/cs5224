import { QueryCommand, BatchGetCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const TABLE_NAME = process.env.MAIN_TABLE;
const STAGE = process.env.STAGE || 'dev';
const VENUE_CACHE_TTL_SECONDS = 86400; // 24 hours
const SEARCH_RADIUS_METERS = 3000;
const MAX_VENUES = 10;
const DEDUP_MIN_DISTANCE_METERS = 400;

const ssmClient = new SSMClient({});

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// ─── SSM-backed credentials (cached per cold start) ──────────────────────────

let _googleApiKey = null;
let _oneMapEmail = null;
let _oneMapPassword = null;

async function getGoogleApiKey() {
  if (_googleApiKey) return _googleApiKey;
  const res = await ssmClient.send(new GetParameterCommand({
    Name: `/midmeet/${STAGE}/GOOGLE_PLACES_API_KEY`,
    WithDecryption: true,
  }));
  _googleApiKey = res.Parameter.Value;
  return _googleApiKey;
}

async function getOneMapCredentials() {
  if (_oneMapEmail && _oneMapPassword) return { email: _oneMapEmail, password: _oneMapPassword };
  const [emailRes, passwordRes] = await Promise.all([
    ssmClient.send(new GetParameterCommand({ Name: `/midmeet/${STAGE}/ONEMAP_EMAIL`, WithDecryption: true })),
    ssmClient.send(new GetParameterCommand({ Name: `/midmeet/${STAGE}/ONEMAP_PASSWORD`, WithDecryption: true })),
  ]);
  _oneMapEmail = emailRes.Parameter.Value;
  _oneMapPassword = passwordRes.Parameter.Value;
  return { email: _oneMapEmail, password: _oneMapPassword };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function getVenues(userId, eventId, docClient) {
  if (!TABLE_NAME) throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");
  if (!eventId) throw new HttpError(400, "Missing event id.");

  // 1. Fetch the event to get venueType and participant list
  const eventRes = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": `EVENT#${eventId}` },
  }));

  const items = eventRes.Items || [];
  if (items.length === 0) throw new HttpError(404, "Event not found.");

  const eventMeta = items.find(i => i.SK === 'METADATA');
  if (!eventMeta) throw new HttpError(404, "Event metadata not found.");

  const members = items.filter(i => i.SK.startsWith('USER#'));
  const isMember = members.some(m => m.SK === `USER#${userId}`) || eventMeta.creatorId === userId;
  if (!isMember) throw new HttpError(403, "Access denied.");

  if (eventMeta.status !== 'SCHEDULING') {
    throw new HttpError(409, `Venues can only be fetched when the event is in SCHEDULING status (current: ${eventMeta.status}).`);
  }

  // 2. Check DynamoDB venue cache
  const cached = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `VENUE_CACHE#${eventId}`, SK: 'DATA' },
  }));
  if (cached.Item?.venues) {
    return cached.Item.venues;
  }

  // 3. Fetch participant profiles to get lat/lng and transportType
  const participantUserIds = members.map(m => m.SK.replace('USER#', ''));
  const uniqueUserIds = [...new Set([eventMeta.creatorId, ...participantUserIds])];

  const profileKeys = uniqueUserIds.map(id => ({ PK: `USER#${id}`, SK: 'PROFILE' }));
  const profileBatch = await docClient.send(new BatchGetCommand({
    RequestItems: { [TABLE_NAME]: { Keys: profileKeys } },
  }));

  const profiles = profileBatch.Responses?.[TABLE_NAME] || [];

  // Only include participants who have a location set
  const users = profiles
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({
      userId: p.userId,
      name: p.name || p.email || 'Unknown',
      coordinates: { lat: p.lat, lng: p.lng },
      transportType: p.transportType || 'Public Transport',
    }));

  if (users.length === 0) {
    throw new HttpError(422, "No participants have set their location. Ask participants to update their profile with a postal code.");
  }

  // 4. Calculate geographic midpoint
  const midpoint = calculateMidpoint(users);

  // 5. Fetch candidate venues from Google Places
  const apiKey = await getGoogleApiKey();
  const rawVenues = await fetchGooglePlaces(midpoint, eventMeta.venueType, apiKey);

  // 6. Geographic deduplication — keep venues at least 400m apart
  const distinctVenues = [];
  for (const venue of rawVenues) {
    const tooClose = distinctVenues.some(
      kept => getDistanceMeters(venue.coordinates, kept.coordinates) < DEDUP_MIN_DISTANCE_METERS
    );
    if (!tooClose) distinctVenues.push(venue);
    if (distinctVenues.length === MAX_VENUES) break;
  }

  if (distinctVenues.length === 0) {
    return [];
  }

  // 7. For each venue, get real per-participant travel times via OneMap
  const scoredVenues = await Promise.all(distinctVenues.map(async (venue) => {
    const travelResults = await Promise.all(users.map(async (user) => {
      const minutes = await getTravelTime(user.coordinates, venue.coordinates, user.transportType);
      return { userId: user.userId, name: user.name, estimatedMinutes: Math.round(minutes) };
    }));

    const travelMinutes = travelResults.map(r => r.estimatedMinutes);
    const metrics = calculateFairnessMetrics(travelMinutes);
    const distanceFromMidpointKm = getDistanceMeters(midpoint, venue.coordinates) / 1000;

    return {
      venueId: venue.id,
      name: venue.name,
      address: venue.address,
      rating: venue.rating,
      distanceKm: parseFloat(distanceFromMidpointKm.toFixed(2)),
      estimatedMinutes: metrics.averageTime,
      fairnessScore: metrics.score,
      participantTravel: travelResults,
    };
  }));

  // 8. Sort by fairness score ascending (lower = fairer + closer)
  scoredVenues.sort((a, b) => a.fairnessScore - b.fairnessScore);

  // 9. Write to DynamoDB cache with TTL
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `VENUE_CACHE#${eventId}`,
      SK: 'DATA',
      venues: scoredVenues,
      ttl: Math.floor(Date.now() / 1000) + VENUE_CACHE_TTL_SECONDS,
    },
  }));

  return scoredVenues;
}

// ─── Google Places Nearby Search ──────────────────────────────────────────────

const VENUE_TYPE_MAP = {
  'Cafe':        'cafe',
  'Restaurant':  'restaurant',
  'Park':        'park',
  'Mall':        'shopping_mall',
  'Library':     'library',
  'Sports Hall': 'gym',
};

async function fetchGooglePlaces(midpoint, venueType, apiKey) {
  const includedType = VENUE_TYPE_MAP[venueType] || 'restaurant';

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      // Pro SKU: id, displayName, formattedAddress, location
      // Enterprise SKU: rating (included for display value)
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating',
    },
    body: JSON.stringify({
      includedTypes: [includedType],
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: midpoint.lat, longitude: midpoint.lng },
          radius: SEARCH_RADIUS_METERS,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(502, `Google Places API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.places || []).map(place => ({
    id: place.id,
    name: place.displayName?.text || 'Unknown Venue',
    address: place.formattedAddress || 'Address unavailable',
    rating: place.rating ?? null,
    coordinates: {
      lat: place.location?.latitude,
      lng: place.location?.longitude,
    },
  })).filter(v => v.coordinates.lat != null && v.coordinates.lng != null);
}

// ─── OneMap Routing (travel time per participant) ─────────────────────────────
// Reused from getRecommendations.js — free Singapore Land Authority public API.

let cachedOneMapToken = null;
let tokenExpiry = 0;

async function getOneMapToken() {
  if (cachedOneMapToken && Date.now() < tokenExpiry) return cachedOneMapToken;

  const { email, password } = await getOneMapCredentials();
  const res = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error("Failed to authenticate with OneMap");

  const data = await res.json();
  cachedOneMapToken = data.access_token;
  tokenExpiry = Date.now() + 3600000; // cache for 1 hour
  return cachedOneMapToken;
}

const TRANSPORT_MODE_MAP = {
  'Public Transport': 'pt',
  'Car':              'drive',
  'Walking':          'walk',
  'Cycling':          'cycle',
};

async function getTravelTime(origin, destination, transportType) {
  const token = await getOneMapToken();
  const routeType = TRANSPORT_MODE_MAP[transportType] || 'pt';

  // PT routing requires date + time parameters; other modes do not.
  let url = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${origin.lat},${origin.lng}&end=${destination.lat},${destination.lng}&routeType=${routeType}`;
  if (routeType === 'pt') {
    // OneMap PT routing requires date in MM-DD-YYYY and time in HH:MM:SS (SGT = UTC+8)
    const now = new Date(Date.now() + 8 * 3600 * 1000); // shift to SGT
    const iso = now.toISOString(); // e.g. "2026-04-11T11:47:49.000Z"
    const [year, month, day] = iso.slice(0, 10).split('-');
    const date = `${month}-${day}-${year}`; // MM-DD-YYYY
    const time = iso.slice(11, 19);         // HH:MM:SS
    url += `&date=${date}&time=${time}&mode=transit&maxWalkDistance=1000&numItineraries=1`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`OneMap ${res.status} | ${url} | ${body.replace(/\s+/g, ' ')}`);
    return 99;
  }

  const data = await res.json();

  if (routeType === 'pt') {
    return data.plan?.itineraries?.[0]?.duration != null
      ? data.plan.itineraries[0].duration / 60
      : 99;
  }

  return data.route_summary?.total_time != null
    ? data.route_summary.total_time / 60
    : 99;
}

// ─── Shared Utilities ─────────────────────────────────────────────────────────

function calculateMidpoint(users) {
  const totalLat = users.reduce((sum, u) => sum + u.coordinates.lat, 0);
  const totalLng = users.reduce((sum, u) => sum + u.coordinates.lng, 0);
  return { lat: totalLat / users.length, lng: totalLng / users.length };
}

function getDistanceMeters(coord1, coord2) {
  const R = 6371e3;
  const toRad = Math.PI / 180;
  const dLat = (coord2.lat - coord1.lat) * toRad;
  const dLng = (coord2.lng - coord1.lng) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(coord1.lat * toRad) * Math.cos(coord2.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateFairnessMetrics(timesInMinutes) {
  const mean = timesInMinutes.reduce((a, b) => a + b, 0) / timesInMinutes.length;
  const variance = timesInMinutes.reduce((acc, v) => acc + (v - mean) ** 2, 0) / timesInMinutes.length;
  const stdDev = Math.sqrt(variance);
  return {
    averageTime: Math.round(mean),
    maxTime: Math.round(Math.max(...timesInMinutes)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    score: parseFloat((mean + stdDev).toFixed(2)),
  };
}
