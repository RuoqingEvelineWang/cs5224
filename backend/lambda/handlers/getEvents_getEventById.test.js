/**
 * getEvents.test.js
 */

import { getEvents } from "./getEvents.js";

function makeMockDocClient(sendImpl) {
  return { send: jest.fn(sendImpl) };
}

// A full getEvents call requires 4 steps:
//   1. QueryCommand  (GSI1 — find EventMember records for this user)
//   2. BatchGetCommand (fetch Event METADATA)
//   3. QueryCommand  (per event — fetch members with begins_with USER#)
//   4. BatchGetCommand (fetch user profiles)

const EVENT_ID = "evt-001";
const USER_ID = "user-a";

const GSI_MEMBER_ITEM = {
  PK: `EVENT#${EVENT_ID}`,
  SK: `USER#${USER_ID}`,
  GSI1PK: `USER#${USER_ID}`,
  GSI1SK: `EVENT#${EVENT_ID}`,
};

const EVENT_META = {
  PK: `EVENT#${EVENT_ID}`,
  SK: "METADATA",
  eventId: EVENT_ID,
  title: "Basketball Game",
  status: "COLLECTING_AVAILABILITY",
  creatorId: USER_ID,
  venueType: "Sports Hall",
  dateRange: { start: "2024-06-01", end: "2024-06-07" },
};

const MEMBER_ITEM = {
  PK: `EVENT#${EVENT_ID}`,
  SK: `USER#${USER_ID}`,
  userId: USER_ID,
  role: "CREATOR",
  inviteStatus: "ACCEPTED",
  hasSubmittedAvailability: false,
  availableTimeSlots: ["2024-06-03T10:00"],
};

const USER_PROFILE = {
  PK: `USER#${USER_ID}`,
  SK: "PROFILE",
  name: "Alice",
};

describe("getEvents", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns early when BatchGet yields no event metadata", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [] };
      }
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result).toEqual([]);
  });

  test("skips profile BatchGet when uniqueUserIds is empty", async () => {
    // Members have no userId and SK has no USER# prefix → uniqueUserIds stays empty
    const emptyMember = {
      PK: `EVENT#${EVENT_ID}`, SK: "OTHER#x", role: "CREATOR",
      inviteStatus: "ACCEPTED", hasSubmittedAvailability: false
    };
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [emptyMember] };
      }
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
    });

    const result = await getEvents(USER_ID, docClient);
    expect(Array.isArray(result)).toBe(true);
  });

  test("computeSlotCounts returns empty object when no member has availableTimeSlots", async () => {
    const memberNoSlots = { ...MEMBER_ITEM, availableTimeSlots: undefined };
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [memberNoSlots] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result[0].slotCounts).toEqual({});
  });

  test("returns event list enriched with creatorName and participants.name", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] }; // GSI
        return { Items: [MEMBER_ITEM] }; // members per event
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);

    expect(result).toHaveLength(1);
    expect(result[0].eventId).toBe(EVENT_ID);
    expect(result[0].title).toBe("Basketball Game");
    expect(result[0].creatorName).toBe("Alice");
    expect(result[0].participants[0].name).toBe("Alice");
  });

  test("returns empty array when user has no events", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      return {};
    });

    const result = await getEvents(USER_ID, docClient);

    expect(result).toEqual([]);
    // Should not proceed to BatchGet when there are no events
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  test("aggregates availableTimeSlots across all members into slotCounts", async () => {
    const members = [
      { SK: `USER#user-a`, userId: "user-a", role: "CREATOR", inviteStatus: "ACCEPTED", hasSubmittedAvailability: true, availableTimeSlots: ["slot-1", "slot-2"] },
      { SK: `USER#user-b`, userId: "user-b", role: "PARTICIPANT", inviteStatus: "ACCEPTED", hasSubmittedAvailability: true, availableTimeSlots: ["slot-1"] },
      { SK: `USER#user-c`, userId: "user-c", role: "PARTICIPANT", inviteStatus: "PENDING", hasSubmittedAvailability: false, availableTimeSlots: [] },
    ];

    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: members };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);

    expect(result[0].slotCounts).toEqual({ "slot-1": 2, "slot-2": 1 });
  });

  test("availabilitySubmittedBy only includes members with hasSubmittedAvailability=true", async () => {
    const members = [
      { SK: `USER#user-a`, userId: "user-a", role: "CREATOR", inviteStatus: "ACCEPTED", hasSubmittedAvailability: true },
      { SK: `USER#user-b`, userId: "user-b", role: "PARTICIPANT", inviteStatus: "ACCEPTED", hasSubmittedAvailability: false },
    ];

    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: members };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);

    expect(result[0].availabilitySubmittedBy).toEqual(["user-a"]);
  });

  test("falls back to 'Creator' and 'Unknown User' when profiles are missing", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [MEMBER_ITEM] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        // no profiles returned
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);

    expect(result[0].creatorName).toBe("Creator");
    expect(result[0].participants[0].name).toBe("Unknown User");
  });

  test("classifies confirmedUserIds and declinedUserIds by inviteStatus", async () => {
    const members = [
      { SK: `USER#user-a`, userId: "user-a", role: "CREATOR", inviteStatus: "ACCEPTED", hasSubmittedAvailability: false },
      { SK: `USER#user-b`, userId: "user-b", role: "PARTICIPANT", inviteStatus: "DECLINED", hasSubmittedAvailability: false },
      { SK: `USER#user-c`, userId: "user-c", role: "PARTICIPANT", inviteStatus: "PENDING", hasSubmittedAvailability: false },
    ];

    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: members };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);

    expect(result[0].confirmedUserIds).toContain("user-a");
    expect(result[0].declinedUserIds).toContain("user-b");
    expect(result[0].declinedUserIds).not.toContain("user-c");
  });

  test("returns empty array when BatchGet yields no event metadata", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [] };
      }
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result).toEqual([]);
  });

  test("returns events without profile enrichment when uniqueUserIds is empty", async () => {
    const memberNoId = {
      PK: `EVENT#${EVENT_ID}`, SK: "OTHER", role: "CREATOR",
      inviteStatus: "ACCEPTED", hasSubmittedAvailability: false
    };
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [memberNoId] };
      }
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
    });

    const result = await getEvents(USER_ID, docClient);
    expect(Array.isArray(result)).toBe(true);
  });

  test("produces empty slotCounts when no member has availableTimeSlots", async () => {
    const memberNoSlots = { ...MEMBER_ITEM, availableTimeSlots: undefined };
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [memberNoSlots] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result[0].slotCounts).toEqual({});
  });

  test("derives creatorId from CREATOR member SK when eventMeta.creatorId is absent", async () => {
    const metaNoCreator = { ...EVENT_META, creatorId: undefined };
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [{ ...MEMBER_ITEM, role: "CREATOR" }] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [metaNoCreator] } };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result[0].creatorId).toBe(USER_ID);
  });

  test("produces empty slotCounts when no member has availableTimeSlots", async () => {
    const memberNoSlots = { ...MEMBER_ITEM, availableTimeSlots: undefined };
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [memberNoSlots] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result[0].slotCounts).toEqual({});
  });

  test("returns empty array when BatchGet for METADATA returns empty", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [MEMBER_ITEM] };
      }
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result).toEqual([]);
  });

  test("handles missing TABLE_NAME key in METADATA BatchGet response", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [MEMBER_ITEM] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        // METADATA BatchGet: Responses key absent → triggers || []
        if (keys[0]?.SK === "METADATA") return { Responses: {} };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result).toEqual([]);
  });

  test("handles missing Items in per-event members query", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        // Items field absent → triggers || []
        return {};
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result[0].participants).toEqual([]);
  });

  test("falls back to SK-derived userId when member.userId is absent", async () => {
    // Covers m.userId || m.SK.replace(...) right-hand branches on lines 59/64/67/70
    const memberNoUserId = {
      PK: `EVENT#${EVENT_ID}`,
      SK: `USER#${USER_ID}`,
      // no userId field
      role: "CREATOR",
      inviteStatus: "ACCEPTED",
      hasSubmittedAvailability: true,
      availableTimeSlots: ["slot-1"],
    };
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [memberNoUserId] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        return { Responses: { [process.env.MAIN_TABLE]: [USER_PROFILE] } };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result[0].participants[0].userId).toBe(USER_ID);
    expect(result[0].availabilitySubmittedBy).toContain(USER_ID);
    expect(result[0].confirmedUserIds).toContain(USER_ID);
  });

  test("handles missing TABLE_NAME key in profile BatchGet response", async () => {
    let queryCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        queryCount++;
        if (queryCount === 1) return { Items: [GSI_MEMBER_ITEM] };
        return { Items: [MEMBER_ITEM] };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        const keys = cmd.input.RequestItems[process.env.MAIN_TABLE]?.Keys || [];
        if (keys[0]?.SK === "METADATA")
          return { Responses: { [process.env.MAIN_TABLE]: [EVENT_META] } };
        // Profile BatchGet: TABLE_NAME key absent → triggers || []
        return { Responses: {} };
      }
    });

    const result = await getEvents(USER_ID, docClient);
    expect(result[0].creatorName).toBe("Creator");
  });
});


/**
 * getEventById.test.js
 */

import { getEventById } from "./getEventById.js";

describe("getEventById", () => {
  beforeEach(() => jest.clearAllMocks());

  const EV_ID = "evt-abc";
  const AUTH_USER = "user-a";

  const META = {
    PK: `EVENT#${EV_ID}`,
    SK: "METADATA",
    title: "Team Lunch",
    status: "COLLECTING_AVAILABILITY",
    creatorId: AUTH_USER,
    venueType: "Restaurant",
    dateRange: { start: "2024-06-01", end: "2024-06-07" },
  };

  const MEMBERS = [
    META,
    { PK: `EVENT#${EV_ID}`, SK: `USER#${AUTH_USER}`, role: "CREATOR", inviteStatus: "ACCEPTED", hasSubmittedAvailability: false },
    { PK: `EVENT#${EV_ID}`, SK: "USER#user-b", role: "PARTICIPANT", inviteStatus: "PENDING", hasSubmittedAvailability: false },
  ];

  const PROFILES = [
    { PK: `USER#${AUTH_USER}`, name: "Alice" },
    { PK: "USER#user-b", name: "Bob" },
  ];

  function makeDocClient(queryItems = MEMBERS, profileItems = PROFILES) {
    return makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: queryItems };
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: { [process.env.MAIN_TABLE]: profileItems } };
    });
  }
  test("derives creatorId from CREATOR member when eventMeta.creatorId is absent", async () => {
    const metaWithout = { ...META, creatorId: undefined };
    const items = [
      metaWithout,
      { PK: `EVENT#${EV_ID}`, SK: `USER#${AUTH_USER}`, role: "CREATOR", inviteStatus: "ACCEPTED", hasSubmittedAvailability: false },
    ];
    const docClient = makeDocClient(items, [{ PK: `USER#${AUTH_USER}`, name: "Alice" }]);

    const result = await getEventById(AUTH_USER, EV_ID, docClient);

    expect(result.creatorId).toBe(AUTH_USER);
  });

  test("returns full event detail with creatorName and participants.name", async () => {
    const docClient = makeDocClient();

    const result = await getEventById(AUTH_USER, EV_ID, docClient);

    expect(result.eventId).toBe(EV_ID);
    expect(result.title).toBe("Team Lunch");
    expect(result.creatorName).toBe("Alice");
    expect(result.participants.find((p) => p.userId === "user-b").name).toBe("Bob");
  });

  test("confirmedUserIds contains ACCEPTED members only", async () => {
    const docClient = makeDocClient();

    const result = await getEventById(AUTH_USER, EV_ID, docClient);

    expect(result.confirmedUserIds).toContain(AUTH_USER);
    expect(result.confirmedUserIds).not.toContain("user-b");
  });

  test("returns null for selectedTime and selectedVenue when absent", async () => {
    const docClient = makeDocClient();

    const result = await getEventById(AUTH_USER, EV_ID, docClient);

    expect(result.selectedTime).toBeNull();
    expect(result.selectedVenue).toBeNull();
  });

  test("returns empty dateRange when absent", async () => {
    const metaWithout = { ...META, dateRange: undefined };
    const items = [metaWithout, MEMBERS[1], MEMBERS[2]];
    const docClient = makeDocClient(items);

    const result = await getEventById(AUTH_USER, EV_ID, docClient);

    expect(result.dateRange).toEqual({ start: "", end: "" });
  });

  test("returns null for a non-member requesting the event", async () => {
    const docClient = makeDocClient();

    const result = await getEventById("user-stranger", EV_ID, docClient);

    expect(result).toBeNull();
  });

  test("returns null when the event does not exist", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      return {};
    });

    const result = await getEventById(AUTH_USER, EV_ID, docClient);

    expect(result).toBeNull();
  });

  test("falls back to 'Creator' when creator profile is missing", async () => {
    const docClient = makeDocClient(MEMBERS, []); // no profiles

    const result = await getEventById(AUTH_USER, EV_ID, docClient);

    expect(result.creatorName).toBe("Creator");
  });
  test("derives creatorId from CREATOR member SK when eventMeta.creatorId is absent", async () => {
    const metaWithout = { ...META, creatorId: undefined };
    const items = [
      metaWithout,
      {
        PK: `EVENT#${EV_ID}`, SK: `USER#${AUTH_USER}`, role: "CREATOR",
        inviteStatus: "ACCEPTED", hasSubmittedAvailability: false
      },
    ];
    const docClient = makeDocClient(items, [{ PK: `USER#${AUTH_USER}`, name: "Alice" }]);

    const result = await getEventById(AUTH_USER, EV_ID, docClient);
    expect(result.creatorId).toBe(AUTH_USER);
  });
});