export async function getRecommendations(body) {
  const { users, dateTime, venueType } = body;
  
  if (!users || users.length === 0) {
    throw new Error("Must provide at least one user with coordinates.");
  }

  // 1. Math: Calculate the Geographic Midpoint
  const midpoint = calculateMidpoint(users);

  // 2. OSM API: Fetch candidate venues
  const osmVenues = await fetchOSMVenues(midpoint, venueType, dateTime);

  // 3. Filter: Geographic Deduplication (The "Mall Problem")
  // We want 5 distinct venues that are at least 400 meters apart.
  const distinctVenues = [];
  for (const venue of osmVenues) {
    const isTooClose = distinctVenues.some(
      (keptVenue) => getDistanceMeters(venue.coordinates, keptVenue.coordinates) < 400
    );
    if (!isTooClose) {
      distinctVenues.push(venue);
    }
    if (distinctVenues.length === 5) break;
  }

  // 4. Parallel Matrix: Calculate travel times
  // We fire all distance calculations at the exact same time using Promise.all
  const scoredVenues = await Promise.all(distinctVenues.map(async (venue) => {
    
    // For this venue, get travel times for ALL users simultaneously
    const travelTimes = await Promise.all(users.map(user => 
      getTravelTime(user.coordinates, venue.coordinates, user.transportType)
    ));

    // 5. Rank: Calculate Variance and Score
    const metrics = calculateFairnessMetrics(travelTimes);
    
    return {
      venueId: venue.id,
      name: venue.name,
      address: venue.address,
      rating: venue.rating,
      coordinates: venue.coordinates,
      metrics: metrics // Includes average, max, and total score
    };
  }));

  // Sort by lowest score (Best combination of low average + low variance)
  scoredVenues.sort((a, b) => a.metrics.score - b.metrics.score);

  return scoredVenues;
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

function calculateMidpoint(users) {
  let totalLat = 0, totalLng = 0;
  users.forEach(u => {
    totalLat += u.coordinates.lat;
    totalLng += u.coordinates.lng;
  });
  return {
    lat: totalLat / users.length,
    lng: totalLng / users.length
  };
}

// The Haversine Formula: calculates straight-line distance between two earth coordinates
function getDistanceMeters(coord1, coord2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = Math.PI / 180;
  const lat1 = coord1.lat * toRad, lat2 = coord2.lat * toRad;
  const dLat = (coord2.lat - coord1.lat) * toRad;
  const dLng = (coord2.lng - coord1.lng) * toRad;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateFairnessMetrics(timesInMinutes) {
  const sum = timesInMinutes.reduce((a, b) => a + b, 0);
  const mean = sum / timesInMinutes.length;
  
  const variance = timesInMinutes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / timesInMinutes.length;
  const stdDev = Math.sqrt(variance);
  
  const maxTime = Math.max(...timesInMinutes);

  // The Algorithm: Score = Average + Standard Deviation
  // A lower score is better.
  return {
    averageTime: Math.round(mean),
    maxTime: Math.round(maxTime),
    stdDev: parseFloat(stdDev.toFixed(2)),
    score: parseFloat((mean + stdDev).toFixed(2)),
    allTimes: timesInMinutes
  };
}

// ─── EXTERNAL API ──────────────────────────────────────────────────────

const OSM_TAG_MAP = {
    'Cafe': '["amenity"="cafe"]',
    'Restaurant': '["amenity"="restaurant"]',
    'Park': '["leisure"="park"]',
    'Mall': '["shop"="mall"]',
    'Library': '["amenity"="library"]',
    'Sports Hall': '["leisure"="sports_centre"]'
};

async function fetchOSMVenues(midpoint, type, retries = 3) {
  const osmTag = OSM_TAG_MAP[type] || '["amenity"="cafe"]'; 
  const searchRadiusMeters = 2000; 

  const query = `
    [out:json][timeout:10];
    (
      node${osmTag}(around:${searchRadiusMeters},${midpoint.lat},${midpoint.lng});
      way${osmTag}(around:${searchRadiusMeters},${midpoint.lat},${midpoint.lng});
    );
    out center 15;
  `;


  console.log("here");
  console.log(process.env.ONEMAP_EMAIL);
  
  // A list of official public Overpass mirrors
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  // The Retry Loop
  for (let i = 0; i < retries; i++) {
    const endpoint = endpoints[i % endpoints.length]; // Cycle through the mirrors
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });

      const text = await res.text();

      // Overpass sometimes returns HTML error pages (like the one you saw) instead of JSON
      if (!res.ok || text.includes("<?xml") || text.includes("Error")) {
         throw new Error(`Server overloaded or returned HTML error.` + text);
      }

      const data = JSON.parse(text);
      
      return data.elements
        .filter(el => el.tags && el.tags.name) 
        .map(el => {
          const lat = el.lat || el.center?.lat;
          const lon = el.lon || el.center?.lon;
          
          return {
            id: `osm-${el.id}`,
            name: el.tags.name,
            address: el.tags['addr:street'] 
              ? `${el.tags['addr:housenumber'] || ''} ${el.tags['addr:street']}`.trim() 
              : 'Address unavailable',
            rating: null,
            coordinates: { lat, lng: lon }
          };
        });
        
    } catch (err) {
      console.warn(`⚠️ Attempt ${i + 1} failed on ${endpoint}: ${err.message}`);
      
      // If we've run out of retries, give up and return an empty array
      if (i === retries - 1) {
        console.error("❌ All Overpass mirrors failed.");
        return [];
      }
      
      // Wait 1.5 seconds before trying the next mirror (Exponential Backoff)
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}

// ─── LIVE EXTERNAL APIS ──────────────────────────────────────────────────────

let cachedOneMapToken = null;
let tokenExpiry = 0;

async function getOneMapToken() {
  // Reuse token if it hasn't expired (OneMap tokens usually last 3 days)
  if (cachedOneMapToken && Date.now() < tokenExpiry) {
    return cachedOneMapToken;
  }

  const res = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ONEMAP_EMAIL,
      password: process.env.ONEMAP_PASSWORD
    })
  });

  if (!res.ok) throw new Error("Failed to authenticate with OneMap");

  const data = await res.json();
  cachedOneMapToken = data.access_token;
  // Safely cache for 1 hour (3600000 ms) to avoid aggressive re-auth
  tokenExpiry = Date.now() + 3600000; 
  return cachedOneMapToken;
}

async function getTravelTime(origin, destination, transportType) {
  const token = await getOneMapToken();
  
  // Map your database strings to OneMap's required route types
  const transportMap = {
    'Public Transport': 'pt',
    'Car': 'drive',
    'Walking': 'walk',
    'Cycling': 'cycle'
  };
  
  // Default to 'pt' if the user's string is missing or malformed
  const routeType = transportMap[transportType] || 'pt';
  
  // OneMap format: start=lat,lng & end=lat,lng
  const url = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${origin.lat},${origin.lng}&end=${destination.lat},${destination.lng}&routeType=${routeType}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    // If routing fails (e.g. coordinates are impossible to connect), penalize heavily
    return 99; 
  }

  const data = await res.json();
  let durationMinutes = 99;

  // Parse duration based on OneMap's response shape for different modes
  if (routeType === 'pt') {
    if (data.plan && data.plan.itineraries && data.plan.itineraries.length > 0) {
       // PT duration is nested in the first itinerary
       durationMinutes = data.plan.itineraries[0].duration / 60;
    }
  } else {
    // drive, walk, and cycle all share the route_summary structure
    if (data.route_summary && data.route_summary.total_time) {
       durationMinutes = data.route_summary.total_time / 60;
    } else if (data.error) {
       // Sometimes OneMap returns 200 OK but includes an error message in the JSON
       // if the two points are too close or un-routable.
       console.error(`OneMap routing error for ${routeType}:`, data.error);
    }
  }

  return durationMinutes;
}