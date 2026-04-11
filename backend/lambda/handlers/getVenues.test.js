/**
 * getVenues.test.js
 *
 * Coverage targets: getVenues
 *
 * Strategy:
 * - SSMClient is mocked at the module level — getVenues imports it at the top level,
 *   so jest.mock() must run before any import of getVenues.
 * - DynamoDB docClient is injected as a parameter.
 * - Google Places API and OneMap routing use jest.spyOn(global, "fetch").
 */

// Mock SSMClient before importing getVenues
jest.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Parameter: { Value: "mock-value" } }),
  })),
  GetParameterCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { getVenues } from "./getVenues.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockDocClient(sendImpl) {
  return { send: jest.fn(sendImpl) };
}

const EVENT_ID = "evt-001";
const USER_ID = "user-a";
const CREATOR_ID = "creator-1";

function makeEventItems({ status = "SCHEDULING", venueType = "Cafe" } = {}) {
  return [
    {
      PK: `EVENT#${EVENT_ID}`, SK: "METADATA",
      status, creatorId: CREATOR_ID, title: "Team Lunch", venueType
    },
    { PK: `EVENT#${EVENT_ID}`, SK: `USER#${USER_ID}`, role: "PARTICIPANT" },
  ];
}

const MOCK_PROFILES = [
  {
    PK: `USER#${USER_ID}`, userId: USER_ID, name: "Alice",
    lat: 1.3521, lng: 103.8198, transportType: "Public Transport"
  },
  {
    PK: `USER#${CREATOR_ID}`, userId: CREATOR_ID, name: "Bob",
    lat: 1.3000, lng: 103.8500, transportType: "Car"
  },
];

function makeGooglePlacesResponse(places = []) {
  return {
    ok: true,
    json: async () => ({ places }),
  };
}

function makeOneMapTokenResponse() {
  return {
    ok: true,
    json: async () => ({ access_token: "mock-token" }),
  };
}

function makeOneMapRouteResponse(durationSeconds = 600) {
  return {
    ok: true,
    json: async () => ({ route_summary: { total_time: durationSeconds } }),
  };
}

function makeGooglePlace(id, name, lat, lng) {
  return {
    id,
    displayName: { text: name },
    formattedAddress: `${name} Address`,
    location: { latitude: lat, longitude: lng },
    rating: 4.5,
  };
}

// ─── getVenues ────────────────────────────────────────────────────────────────

describe("getVenues", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  test("throws 404 when METADATA item is missing from event", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ PK: `EVENT#${EVENT_ID}`, SK: `USER#${USER_ID}` }] }; // no METADATA
      return {};
    });
    await expect(getVenues(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 404, message: "Event metadata not found." });
  });

  test("returns cached venues when DynamoDB cache hit exists", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called on cache hit");
    });

    const cachedVenues = [{ venueId: "v1", name: "Cached Cafe" }];
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand")
        return { Item: { venues: cachedVenues } };
      return {};
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result).toEqual(cachedVenues);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  test("fetches venues from Google Places, scores by fairness, and caches result", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand")
        return {}; // cache miss
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {}; // PutCommand (cache write)
    });

    const places = [
      // makeGooglePlace("place-1", "Cafe Alpha", 1.326, 103.819),
      // makeGooglePlace("place-2", "Cafe Beta", 1.330, 103.825),
      makeGooglePlace("place-1", "Cafe Alpha", 1.326, 103.819),
      {
        id: "place-2",
        // no displayName, no formattedAddress, no rating
        location: { latitude: 1.330, longitude: 103.830 },
      },
    ];

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com")) return makeGooglePlacesResponse(places);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      return makeOneMapRouteResponse(300);
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("venueId");
    expect(result[0]).toHaveProperty("fairnessScore");
    expect(result[0]).toHaveProperty("participantTravel");
    // Sorted by fairnessScore ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i].fairnessScore).toBeGreaterThanOrEqual(result[i - 1].fairnessScore);
    }
  });

  test("handles missing Responses key in profile BatchGet", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand") return { Responses: {} }; // TABLE_NAME key absent → profiles = []
      return {};
    });
    await expect(getVenues(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 422 }); // no profiles with location → 422
  });

  test("falls back to email then Unknown when profile name is absent, and defaults transportType", async () => {
    const profilesNoName = [
      { PK: `USER#${USER_ID}`, userId: USER_ID, lat: 1.3521, lng: 103.8198 }, // no name, no transportType
    ];
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: profilesNoName } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com"))
        return makeGooglePlacesResponse([makeGooglePlace("p1", "Cafe A", 1.326, 103.819)]);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      return makeOneMapRouteResponse(300);
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result[0].participantTravel[0].name).toBe("Unknown");
  });

  test("deduplicates venues within 400m keeping only one", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {};
    });

    // Two places within 400m of each other
    const places = [
      makeGooglePlace("p1", "Cafe A", 1.3260, 103.8190),
      makeGooglePlace("p2", "Cafe B", 1.3261, 103.8191), // < 400m from p1
    ];

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com")) return makeGooglePlacesResponse(places);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      return makeOneMapRouteResponse(300);
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result).toHaveLength(1);
  });

  test("returns empty array when Google Places returns no results", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("places.googleapis.com"))
        return makeGooglePlacesResponse([]);
      return makeOneMapTokenResponse();
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result).toEqual([]);
  });

  test("throws 502 when Google Places API returns an error", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("places.googleapis.com"))
        return { ok: false, status: 403, text: async () => "Forbidden" };
      return makeOneMapTokenResponse();
    });

    await expect(getVenues(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 502 });
  });

  test("penalises travel time as 99 when OneMap routing fails", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com"))
        return makeGooglePlacesResponse([makeGooglePlace("p1", "Cafe A", 1.326, 103.819)]);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      return { ok: false, status: 500, text: async () => "Error" };
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    const allTimes = result[0].participantTravel.map(p => p.estimatedMinutes);
    expect(allTimes.every(t => t === 99)).toBe(true);
  });

  test("throws 422 when no participants have set their location", async () => {
    const profilesNoLocation = [
      { PK: `USER#${USER_ID}`, userId: USER_ID, name: "Alice" }, // no lat/lng
    ];
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: profilesNoLocation } };
      return {};
    });

    await expect(getVenues(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test("throws 404 when event does not exist", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      return {};
    });
    await expect(getVenues(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test("throws 403 when user is not a member or creator", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      return {};
    });
    await expect(getVenues("stranger", EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test("throws 409 when event status is not SCHEDULING", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems({ status: "COLLECTING_AVAILABILITY" }) };
      return {};
    });
    await expect(getVenues(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test("stops deduplication after reaching MAX_VENUES (10)", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {};
    });

    // 11 venues spread far apart (each ~0.1 degrees apart, well over 400m)
    const places = Array.from({ length: 11 }, (_, i) =>
      makeGooglePlace(`p${i}`, `Cafe ${i}`, 1.30 + i * 0.1, 103.80)
    );

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com")) return makeGooglePlacesResponse(places);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      return makeOneMapRouteResponse(300);
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  test("defaults to restaurant type when venueType is unrecognised", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems({ venueType: "UnknownType" }) };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("places.googleapis.com"))
        return makeGooglePlacesResponse([]);
      return makeOneMapTokenResponse();
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result).toEqual([]);
  });

  test("throws when OneMap token request fails", async () => {
    jest.setSystemTime(Date.now() + 2 * 3600 * 1000); // advance time to ensure token expiry if caching logic is present
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: MOCK_PROFILES } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com"))
        return makeGooglePlacesResponse([makeGooglePlace("p1", "Cafe A", 1.326, 103.819)]);
      if (u.includes("getToken")) return { ok: false };
      return makeOneMapRouteResponse(300);
    });

    await expect(getVenues(USER_ID, EVENT_ID, docClient))
      .rejects.toThrow("Failed to authenticate with OneMap");
  });

  test("uses PT routing with date and time params for Public Transport users", async () => {
    const ptProfiles = [
      {
        PK: `USER#${USER_ID}`, userId: USER_ID, name: "Alice",
        lat: 1.3521, lng: 103.8198, transportType: "Public Transport"
      },
    ];
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: ptProfiles } };
      return {};
    });

    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com"))
        return makeGooglePlacesResponse([makeGooglePlace("p1", "Cafe A", 1.326, 103.819)]);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      // PT response
      return { ok: true, json: async () => ({ plan: { itineraries: [{ duration: 600 }] } }) };
    });

    await getVenues(USER_ID, EVENT_ID, docClient);

    const routeCall = fetchSpy.mock.calls.find(c => String(c[0]).includes("routeType=pt"));
    expect(routeCall).toBeDefined();
    expect(String(routeCall[0])).toContain("date=");
    expect(String(routeCall[0])).toContain("time=");
  });

  test("returns 99 for PT travel time when itineraries array is empty", async () => {
    const ptProfiles = [
      {
        PK: `USER#${USER_ID}`, userId: USER_ID, name: "Alice",
        lat: 1.3521, lng: 103.8198, transportType: "Public Transport"
      },
    ];
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: ptProfiles } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com"))
        return makeGooglePlacesResponse([makeGooglePlace("p1", "Cafe A", 1.326, 103.819)]);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      return { ok: true, json: async () => ({ plan: { itineraries: [] } }) };
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result[0].participantTravel[0].estimatedMinutes).toBe(99);
  });

  test("returns 99 for drive travel time when route_summary is absent", async () => {
    const carProfiles = [
      {
        PK: `USER#${USER_ID}`, userId: USER_ID, name: "Bob",
        lat: 1.3521, lng: 103.8198, transportType: "Car"
      },
    ];
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
      if (cmd.constructor.name === "GetCommand") return {};
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: carProfiles } };
      return {};
    });

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("places.googleapis.com"))
        return makeGooglePlacesResponse([makeGooglePlace("p1", "Cafe A", 1.326, 103.819)]);
      if (u.includes("getToken")) return makeOneMapTokenResponse();
      return { ok: true, json: async () => ({}) }; // no route_summary
    });

    const result = await getVenues(USER_ID, EVENT_ID, docClient);
    expect(result[0].participantTravel[0].estimatedMinutes).toBe(99);
  });
});