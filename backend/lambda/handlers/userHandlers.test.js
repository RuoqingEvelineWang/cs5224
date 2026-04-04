/**
 * userHandlers.test.js
 *
 * Coverage targets: getMyProfile, upsertMyProfile, geocodePostalCode
 *
 * Notes:
 * - docClient is injected as a parameter; a plain mock object is passed in directly,
 *   so no AWS SDK module mocking is required.
 * - fetch (OneMap) is mocked via jest.spyOn(global, "fetch").
 * - beforeEach in every describe block clears all mocks to prevent cross-test pollution.
 */

import { getMyProfile, upsertMyProfile, geocodePostalCode } from "./userHandlers.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a mock docClient that records every send() call. */
function makeMockDocClient(sendImpl) {
  return { send: jest.fn(sendImpl) };
}

/** Simulates a DynamoDB GetCommand response that contains an Item. */
function makeGetResult(item) {
  return { Item: item };
}

/** Simulates a DynamoDB GetCommand response with no Item (item not found). */
function makeEmptyGetResult() {
  return {};
}

// Full profile fixture matching the shape returned by toUserResponse.
const SAMPLE_PROFILE_ITEM = {
  PK: "USER#user-a",
  SK: "PROFILE",
  userId: "user-a",
  name: "Alice",
  email: "alice@example.com",
  postalCode: "238801",
  address: "313 Orchard Road, Singapore 238801",
  lat: 1.3007,
  lng: 103.8368,
  transportType: "MRT",
  interests: ["Badminton", "Cycling"],
};

// Expected output of toUserResponse() given the fixture above.
const EXPECTED_PROFILE_RESPONSE = {
  userId: "user-a",
  name: "Alice",
  email: "alice@example.com",
  postalCode: "238801",
  address: "313 Orchard Road, Singapore 238801",
  lat: 1.3007,
  lng: 103.8368,
  transportType: "MRT",
  interests: ["Badminton", "Cycling"],
};

// ─── Environment variables ───────────────────────────────────────────────────
// TABLE_NAME is read at module-load time, so it must be set before any import.
// Add the following to the Jest config in package.json:
//   "setupFiles": ["<rootDir>/jest.setup.js"]
// jest.setup.js content: process.env.MAIN_TABLE = "test-table"

// ─── getMyProfile ────────────────────────────────────────────────────────────

describe("getMyProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns a fully normalised profile when the item exists", async () => {
    const docClient = makeMockDocClient(async () => makeGetResult(SAMPLE_PROFILE_ITEM));

    const result = await getMyProfile("user-a", docClient);

    expect(result).toEqual(EXPECTED_PROFILE_RESPONSE);
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  test("sends GetCommand with correct PK=USER#userId and SK=PROFILE", async () => {
    const docClient = makeMockDocClient(async () => makeGetResult(SAMPLE_PROFILE_ITEM));

    await getMyProfile("user-a", docClient);

    const sentCommand = docClient.send.mock.calls[0][0];
    expect(sentCommand.input.Key).toEqual({ PK: "USER#user-a", SK: "PROFILE" });
    expect(sentCommand.input.TableName).toBe(process.env.MAIN_TABLE);
  });

  test("throws 404 when profile does not exist", async () => {
    const docClient = makeMockDocClient(async () => makeEmptyGetResult());

    await expect(getMyProfile("user-a", docClient)).rejects.toMatchObject({
      statusCode: 404,
      message: "Profile not found.",
    });
  });

  test("trims leading and trailing whitespace from name, email and address", async () => {
    const docClient = makeMockDocClient(async () =>
      makeGetResult({
        ...SAMPLE_PROFILE_ITEM,
        name: "  Bob  ",
        email: "  bob@example.com  ",
        address: "  Bishan  ",
      })
    );

    const result = await getMyProfile("user-a", docClient);

    expect(result.name).toBe("Bob");
    expect(result.email).toBe("bob@example.com");
    expect(result.address).toBe("Bishan");
  });

  test("falls back to approxArea when address field is absent", async () => {
    const docClient = makeMockDocClient(async () =>
      makeGetResult({
        ...SAMPLE_PROFILE_ITEM,
        address: undefined,
        approxArea: "Tampines",
      })
    );

    const result = await getMyProfile("user-a", docClient);

    expect(result.address).toBe("Tampines");
  });

  test("deduplicates interests", async () => {
    const docClient = makeMockDocClient(async () =>
      makeGetResult({
        ...SAMPLE_PROFILE_ITEM,
        interests: ["Badminton", "Badminton", "Cycling"],
      })
    );

    const result = await getMyProfile("user-a", docClient);

    expect(result.interests).toEqual(["Badminton", "Cycling"]);
  });

  test("returns an empty array when interests is not an array", async () => {
    const docClient = makeMockDocClient(async () =>
      makeGetResult({ ...SAMPLE_PROFILE_ITEM, interests: null })
    );

    const result = await getMyProfile("user-a", docClient);

    expect(result.interests).toEqual([]);
  });

  test("passes through null lat/lng as null", async () => {
    const docClient = makeMockDocClient(async () =>
      makeGetResult({ ...SAMPLE_PROFILE_ITEM, lat: null, lng: null })
    );

    const result = await getMyProfile("user-a", docClient);

    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
  });
});

// ─── upsertMyProfile ─────────────────────────────────────────────────────────

describe("upsertMyProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  test("falls back to existing approxArea as address when existing.address is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return makeGetResult({ ...SAMPLE_PROFILE_ITEM, address: undefined, approxArea: "Bishan" });
      return {};
    });

    const result = await upsertMyProfile("user-a", {}, {}, docClient);
    expect(result.address).toBe("Bishan");
  });

  test("creates a new profile with both createdAt and updatedAt set", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return makeEmptyGetResult();
      return {};
    });

    const result = await upsertMyProfile(
      "user-a",
      { name: "Alice", interests: ["Badminton"] },
      { email: "alice@example.com" },
      docClient
    );

    expect(result.userId).toBe("user-a");
    expect(result.name).toBe("Alice");

    const putItem = docClient.send.mock.calls[1][0].input.Item;
    expect(putItem.createdAt).toBeTruthy();
    expect(putItem.updatedAt).toBeTruthy();
  });

  test("preserves the original createdAt and updates updatedAt on update", async () => {
    const existingCreatedAt = "2024-01-01T00:00:00.000Z";
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return makeGetResult({ ...SAMPLE_PROFILE_ITEM, createdAt: existingCreatedAt });
      return {};
    });

    await upsertMyProfile("user-a", { name: "Alice V2" }, {}, docClient);

    const putItem = docClient.send.mock.calls[1][0].input.Item;
    expect(putItem.createdAt).toBe(existingCreatedAt);
    expect(putItem.updatedAt).not.toBe(existingCreatedAt);
  });

  test("body fields take precedence over existing, which takes precedence over claims", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return makeGetResult({ ...SAMPLE_PROFILE_ITEM, name: "OldName", transportType: "Bus" });
      return {};
    });

    const result = await upsertMyProfile(
      "user-a",
      { name: "NewName" },
      { name: "ClaimsName" },
      docClient
    );

    expect(result.name).toBe("NewName");
    expect(result.transportType).toBe("Bus");
  });

  test("writes GSI2PK and GSI2SK when email is present", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return makeEmptyGetResult();
      return {};
    });

    await upsertMyProfile(
      "user-a",
      {},
      { email: "alice@example.com" },
      docClient
    );

    const putItem = docClient.send.mock.calls[1][0].input.Item;
    expect(putItem.GSI2PK).toBe("EMAIL#alice@example.com");
    expect(putItem.GSI2SK).toBe("PROFILE");
  });

  test("omits GSI2 fields when email is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return makeEmptyGetResult();
      return {};
    });

    await upsertMyProfile("user-a", {}, {}, docClient);

    const putItem = docClient.send.mock.calls[1][0].input.Item;
    expect(putItem.GSI2PK).toBeUndefined();
    expect(putItem.GSI2SK).toBeUndefined();
  });

  test("lowercases email before writing", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return makeEmptyGetResult();
      return {};
    });

    const result = await upsertMyProfile(
      "user-a",
      { email: "ALICE@EXAMPLE.COM" },
      {},
      docClient
    );

    expect(result.email).toBe("alice@example.com");
  });

  test("does not call geocode (no fetch) when postalCode is unchanged", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return makeGetResult({ ...SAMPLE_PROFILE_ITEM, postalCode: "238801" });
      return {};
    });

    await upsertMyProfile("user-a", { postalCode: "238801" }, {}, docClient);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("calls geocode and writes lat/lng/address when a new postalCode is provided", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            BLK_NO: "313",
            ROAD_NAME: "Orchard Road",
            BUILDING: "NIL",
            POSTAL: "238801",
            LATITUDE: "1.3007",
            LONGITUDE: "103.8368",
          },
        ],
      }),
    });

    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return makeGetResult({ ...SAMPLE_PROFILE_ITEM, postalCode: "000000" });
      return {};
    });

    const result = await upsertMyProfile(
      "user-a",
      { postalCode: "238801" },
      {},
      docClient
    );

    expect(result.lat).toBe(1.3007);
    expect(result.lng).toBe(103.8368);
    expect(result.address).toContain("313");
    fetchSpy.mockRestore();
  });

  test("deduplicates interests and preserves insertion order", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return makeEmptyGetResult();
      return {};
    });

    const result = await upsertMyProfile(
      "user-a",
      { interests: ["Cycling", "Badminton", "Cycling"] },
      {},
      docClient
    );

    expect(result.interests).toEqual(["Cycling", "Badminton"]);
  });

  test("writes correct PK, SK and Type to DynamoDB", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return makeEmptyGetResult();
      return {};
    });

    await upsertMyProfile("user-a", {}, {}, docClient);

    const putItem = docClient.send.mock.calls[1][0].input.Item;
    expect(putItem.PK).toBe("USER#user-a");
    expect(putItem.SK).toBe("PROFILE");
    expect(putItem.Type).toBe("UserProfile");
  });

  test("propagates unexpected DynamoDB errors", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return makeEmptyGetResult();
      throw new Error("DynamoDB connection timeout");
    });

    await expect(
      upsertMyProfile("user-a", { name: "Alice" }, {}, docClient)
    ).rejects.toThrow("DynamoDB connection timeout");
  });

  test("falls back to existing approxArea as address when existing.address is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return makeGetResult({ ...SAMPLE_PROFILE_ITEM, address: undefined, approxArea: "Bishan" });
      return {};
    });

    const result = await upsertMyProfile("user-a", {}, {}, docClient);
    expect(result.address).toBe("Bishan");
  });
});

// ─── geocodePostalCode ────────────────────────────────────────────────────────

describe("geocodePostalCode", () => {
  beforeEach(() => jest.clearAllMocks());

  const ONEMAP_SUCCESS = {
    results: [
      {
        BLK_NO: "313",
        ROAD_NAME: "Orchard Road",
        BUILDING: "NIL",
        POSTAL: "238801",
        LATITUDE: "1.3007",
        LONGITUDE: "103.8368",
      },
    ],
  };

  test("returns parsed address, postalCode, lat and lng on success", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ONEMAP_SUCCESS,
    });

    const result = await geocodePostalCode("238801");

    expect(result.postalCode).toBe("238801");
    expect(result.lat).toBe(1.3007);
    expect(result.lng).toBe(103.8368);
    expect(result.address).toContain("Orchard Road");
  });

  test("excludes NIL tokens from the formatted address", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ONEMAP_SUCCESS,
    });

    const result = await geocodePostalCode("238801");

    expect(result.address).not.toContain("NIL");
    expect(result.address).toMatch(/313 Orchard Road, Singapore 238801/);
  });

  test("falls back to postal-code-only format when all address parts are NIL", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            BLK_NO: "NIL",
            ROAD_NAME: "NIL",
            BUILDING: "NIL",
            POSTAL: "238801",
            LATITUDE: "1.3007",
            LONGITUDE: "103.8368",
          },
        ],
      }),
    });

    const result = await geocodePostalCode("238801");

    expect(result.address).toBe("Singapore 238801");
  });

  test("throws 502 when OneMap returns an HTTP error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false });

    await expect(geocodePostalCode("238801")).rejects.toMatchObject({
      statusCode: 502,
      message: "OneMap geocoding service unavailable.",
    });
  });

  test("throws 400 when results array is empty", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await expect(geocodePostalCode("000000")).rejects.toMatchObject({
      statusCode: 400,
      message: "No address found for postal code 000000.",
    });
  });

  test("throws 400 when results field is missing from the response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(geocodePostalCode("000000")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test("includes the postalCode in the fetch URL", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ONEMAP_SUCCESS,
    });

    await geocodePostalCode("238801");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("searchVal=238801")
    );
  });
});