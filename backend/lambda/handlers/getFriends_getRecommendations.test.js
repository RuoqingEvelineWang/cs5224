/**
 * getFriends.test.js
 */

import { getFriends } from "./getFriends.js";

function makeMockDocClient(sendImpl) {
  return { send: jest.fn(sendImpl) };
}

describe("getFriends", () => {
  beforeEach(() => jest.clearAllMocks());

  test("derives friendId from profile PK when profile.userId is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b", status: "ACCEPTED" }] };
      return {
        Responses: {
          [process.env.MAIN_TABLE]: [
            // No userId field — only PK
            { PK: "USER#user-b", name: "Bob", email: "bob@example.com", interests: [] },
          ],
        },
      };
    });

    const result = await getFriends("user-a", docClient);
    expect(result[0].id).toBe("user-b");
    expect(result[0].name).toBe("Bob");
  });

  test("returns only ACCEPTED friends with name, email and hobbies from profile", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        return {
          Items: [
            { SK: "FRIEND#user-b", status: "ACCEPTED" },
            { SK: "FRIEND#user-c", status: "PENDING" }, // filtered out
          ],
        };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        return {
          Responses: {
            [process.env.MAIN_TABLE]: [
              { PK: "USER#user-b", userId: "user-b", name: "Bob", email: "bob@example.com", interests: ["Badminton"] },
            ],
          },
        };
      }
    });

    const result = await getFriends("user-a", docClient);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("user-b");
    expect(result[0].name).toBe("Bob");
    expect(result[0].email).toBe("bob@example.com");
    expect(result[0].hobbies).toEqual(["Badminton"]);
  });

  test("treats missing status field as ACCEPTED", async () => {
    // Source: const status = item.status || "ACCEPTED"
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b" }] }; // no status field
      return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await getFriends("user-a", docClient);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("user-b");
  });

  test("returns empty array and skips BatchGet when there are no friends", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      return {};
    });

    const result = await getFriends("user-a", docClient);

    expect(result).toEqual([]);
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  test("sorts friends alphabetically by name", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        return {
          Items: [
            { SK: "FRIEND#user-z", status: "ACCEPTED" },
            { SK: "FRIEND#user-a2", status: "ACCEPTED" },
          ],
        };
      }
      return {
        Responses: {
          [process.env.MAIN_TABLE]: [
            { PK: "USER#user-z", userId: "user-z", name: "Zoe" },
            { PK: "USER#user-a2", userId: "user-a2", name: "Amy" },
          ],
        },
      };
    });

    const result = await getFriends("user-a", docClient);

    expect(result[0].name).toBe("Amy");
    expect(result[1].name).toBe("Zoe");
  });

  test("falls back to item.name then friendId when profile is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b", status: "ACCEPTED", name: "Bob Snapshot" }] };
      return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await getFriends("user-a", docClient);

    expect(result[0].name).toBe("Bob Snapshot");
  });

  test("deduplicates hobbies", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b", status: "ACCEPTED" }] };
      return {
        Responses: {
          [process.env.MAIN_TABLE]: [
            { PK: "USER#user-b", userId: "user-b", name: "Bob", interests: ["Badminton", "Badminton", "Yoga"] },
          ],
        },
      };
    });

    const result = await getFriends("user-a", docClient);

    expect(result[0].hobbies).toEqual(["Badminton", "Yoga"]);
  });

  test("QueryCommand uses correct PK and SK prefix", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      return {};
    });

    await getFriends("user-a", docClient);

    const query = docClient.send.mock.calls[0][0];
    expect(query.input.ExpressionAttributeValues[":pk"]).toBe("USER#user-a");
    expect(query.input.ExpressionAttributeValues[":skPrefix"]).toBe("FRIEND#");
  });

  test("derives friendId from profile PK when profile.userId is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b", status: "ACCEPTED" }] };
      return {
        Responses: {
          [process.env.MAIN_TABLE]: [
            { PK: "USER#user-b", name: "Bob", email: "bob@example.com", interests: [] },
          ],
        },
      };
    });

    const result = await getFriends("user-a", docClient);
    expect(result[0].id).toBe("user-b");
    expect(result[0].name).toBe("Bob");
  });

  test("derives friendId from SK when friendId field is absent", async () => {
    // Covers line 48: SK path in getFriendId
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b", status: "ACCEPTED" }] }; // no friendId field
      return {
        Responses: {
          [process.env.MAIN_TABLE]: [
            { PK: "USER#user-b", userId: "user-b", name: "Bob", email: "b@example.com", interests: [] },
          ],
        },
      };
    });

    const result = await getFriends("user-a", docClient);
    expect(result[0].id).toBe("user-b");
  });

  test("returns empty string id when SK does not start with FRIEND#", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return {
          Items: [
            { SK: "OTHER#user-b", status: "ACCEPTED" },
          ],
        };
      return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await getFriends("user-a", docClient);
    expect(result[0].id).toBe("");
  });
});


/**
 * getRecommendations.test.js
 *
 * Strategy:
 * - calculateMidpoint / getDistanceMeters / calculateFairnessMetrics are pure
 *   functions covered indirectly through getRecommendations output.
 * - fetchOSMVenues / getTravelTime / getOneMapToken all depend on external
 *   fetch, mocked via jest.spyOn(global, "fetch").
 * - Module-level cache variables (cachedOneMapToken / tokenExpiry) are
 *   reset between tests via jest.restoreAllMocks().
 */

import { getRecommendations } from "./getRecommendations.js";

// ─── fetch mock factories ───────────────────────────────────────────────────

/** Builds a mock OneMap token response. */
function makeTokenResponse() {
  return {
    ok: true,
    text: async () => JSON.stringify({ access_token: "mock-token-123" }),
    json: async () => ({ access_token: "mock-token-123" }),
  };
}

/** Builds a single OSM node element. */
function makeOSMNode(id, name, lat, lng) {
  return {
    id,
    tags: { name, "addr:street": "Test Street", "addr:housenumber": "1" },
    lat,
    lon: lng,
  };
}

/** Builds a mock OSM Overpass API response. */
function makeOSMResponse(nodes) {
  return {
    ok: true,
    text: async () => JSON.stringify({ elements: nodes }),
  };
}

/** Builds a mock OneMap routing response for public transport. */
function makePTRouteResponse(durationSeconds) {
  return {
    ok: true,
    json: async () => ({
      plan: { itineraries: [{ duration: durationSeconds }] },
    }),
  };
}

/** Builds a mock OneMap routing response for drive/walk/cycle. */
function makeDriveRouteResponse(durationSeconds) {
  return {
    ok: true,
    json: async () => ({
      route_summary: { total_time: durationSeconds },
    }),
  };
}

// ─── Standard test inputs ───────────────────────────────────────────────────

const TWO_USERS = [
  { id: "alice", transportType: "Public Transport", coordinates: { lat: 1.3521, lng: 103.8198 } },
  { id: "bob", transportType: "Car", coordinates: { lat: 1.3000, lng: 103.8500 } },
];

// ─── getRecommendations ─────────────────────────────────────────────────────

describe("getRecommendations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // jest.restoreAllMocks();
  });

  test("returns 99 for travel time when PT itineraries array is empty", async () => {
    const nodes = [makeOSMNode(1, "Cafe A", 1.326, 103.819)];

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      if (String(url).includes("getToken")) return makeTokenResponse();
      // PT response with empty itineraries
      return { ok: true, json: async () => ({ plan: { itineraries: [] } }) };
    });

    const ptUser = [{
      id: "alice", transportType: "Public Transport",
      coordinates: { lat: 1.326, lng: 103.819 }
    }];
    const result = await getRecommendations({ users: ptUser, venueType: "Cafe" });

    expect(result[0].metrics.allTimes).toContain(99);
  });

  test("throws when users array is empty", async () => {
    await expect(
      getRecommendations({ users: [], venueType: "Cafe" })
    ).rejects.toThrow("Must provide at least one user with coordinates.");
  });

  test("throws when users field is missing", async () => {
    await expect(
      getRecommendations({ venueType: "Cafe" })
    ).rejects.toThrow("Must provide at least one user with coordinates.");
  });

  test("returns venues sorted by score ascending when OSM returns results", async () => {
    const nodes = [
      makeOSMNode(1, "Cafe Alpha", 1.326, 103.819),
      makeOSMNode(2, "Cafe Beta", 1.327, 103.820),
    ];

    let fetchCount = 0;
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      fetchCount++;
      // Call 1: OSM
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      // Call 2: OneMap token
      if (String(url).includes("getToken")) return makeTokenResponse();
      // Remaining: routing (PT = 600s = 10 min, Car = 300s = 5 min)
      if (String(url).includes("routingType=pt") || String(url).includes("routeType=pt"))
        return makePTRouteResponse(600);
      return makeDriveRouteResponse(300);
    });

    const result = await getRecommendations({ users: TWO_USERS, venueType: "Cafe" });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Verify ascending score order
    for (let i = 1; i < result.length; i++) {
      expect(result[i].metrics.score).toBeGreaterThanOrEqual(result[i - 1].metrics.score);
    }
  });

  test("returns empty array when all OSM mirrors fail", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      text: async () => "Server Error",
    });

    const result = await getRecommendations({ users: TWO_USERS, venueType: "Cafe" });

    expect(result).toEqual([]);
  });

  test("returns empty array when OSM returns no elements", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass"))
        return { ok: true, text: async () => JSON.stringify({ elements: [] }) };
      return makeTokenResponse();
    });

    const result = await getRecommendations({ users: TWO_USERS, venueType: "Cafe" });

    expect(result).toEqual([]);
  });

  test("filters out OSM nodes that have no name tag", async () => {
    const nodes = [
      { id: 99, tags: {}, lat: 1.326, lon: 103.819 }, // no name tag
    ];
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      return makeTokenResponse();
    });

    const result = await getRecommendations({ users: TWO_USERS, venueType: "Cafe" });

    expect(result).toEqual([]);
  });

  test("deduplicates venues within 400 m, keeping only one", async () => {
    // Both nodes are within 400 m of each other
    const nodes = [
      makeOSMNode(1, "Cafe A", 1.3260, 103.8190),
      makeOSMNode(2, "Cafe B", 1.3261, 103.8191), // within 400 m
    ];

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      if (String(url).includes("getToken")) return makeTokenResponse();
      return makePTRouteResponse(600);
    });

    const result = await getRecommendations({ users: [TWO_USERS[0]], venueType: "Cafe" });

    expect(result).toHaveLength(1);
  });

  test("defaults to cafe OSM tag for unknown venueType", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass"))
        return { ok: true, text: async () => JSON.stringify({ elements: [] }) };
      return makeTokenResponse();
    });

    // should not throw
    await expect(
      getRecommendations({ users: TWO_USERS, venueType: "UnknownType" })
    ).resolves.toEqual([]);
  });

  test("penalises travel time as 99 when OneMap routing fails", async () => {
    const nodes = [makeOSMNode(1, "Cafe A", 1.326, 103.819)];

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      if (String(url).includes("getToken")) return makeTokenResponse();
      return { ok: false, json: async () => ({}) }; // routing failure
    });

    const result = await getRecommendations({ users: [TWO_USERS[0]], venueType: "Cafe" });

    expect(result[0].metrics.allTimes).toContain(99);
  });

  test("metrics object contains averageTime, maxTime, stdDev, score and allTimes", async () => {
    const nodes = [makeOSMNode(1, "Cafe A", 1.326, 103.819)];

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      if (String(url).includes("getToken")) return makeTokenResponse();
      return makePTRouteResponse(600); // 10 min
    });

    const result = await getRecommendations({ users: [TWO_USERS[0]], venueType: "Cafe" });

    const m = result[0].metrics;
    expect(m).toHaveProperty("averageTime");
    expect(m).toHaveProperty("maxTime");
    expect(m).toHaveProperty("stdDev");
    expect(m).toHaveProperty("score");
    expect(m).toHaveProperty("allTimes");
  });

  test("uses drive routeType for Car transport (not PT parsing path)", async () => {
    const nodes = [makeOSMNode(1, "Cafe A", 1.326, 103.819)];
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      if (String(url).includes("getToken")) return makeTokenResponse();
      // Car -> drive
      if (String(url).includes("routeType=drive")) return makeDriveRouteResponse(300);
      return makePTRouteResponse(600);
    });

    const carUser = [{ id: "alice", transportType: "Car", coordinates: { lat: 1.326, lng: 103.819 } }];
    const result = await getRecommendations({ users: carUser, venueType: "Cafe" });

    const routeCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes("routeType=drive"));
    expect(routeCall).toBeDefined();
    expect(result[0].metrics.allTimes[0]).toBe(5); // 300s / 60
  });

  test("retries on XML error response and returns empty array after all retries fail", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "<?xml version='1.0'?><error>Rate limited</error>",
    });

    const result = await getRecommendations({ users: TWO_USERS, venueType: "Cafe" });

    expect(result).toEqual([]);
  });

  test("defaults travel time to 99 when PT response has empty itineraries", async () => {
    const nodes = [makeOSMNode(1, "Cafe A", 1.326, 103.819)];

    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("overpass")) return makeOSMResponse(nodes);
      if (String(url).includes("getToken")) return makeTokenResponse();
      return { ok: true, json: async () => ({ plan: { itineraries: [] } }) };
    });

    const result = await getRecommendations({
      users: [{
        id: "alice", transportType: "Public Transport",
        coordinates: { lat: 1.326, lng: 103.819 }
      }],
      venueType: "Cafe",
    });

    expect(result[0].metrics.allTimes).toContain(99);
  });
});