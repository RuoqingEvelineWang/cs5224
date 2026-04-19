/**
 * confirmAttendance_declineAttendance.test.js
 *
 * Coverage targets: confirmAttendance, declineAttendance
 *
 * Both handlers share identical structure — validated together to avoid duplication.
 * createNotification is mocked at the module level so no real DynamoDB writes occur.
 */

import { confirmAttendance } from "./confirmAttendance.js";
import { declineAttendance } from "./declineAttendance.js";

// Mock createNotification used inside both handlers
jest.mock("./getNotifications.js", () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
import { createNotification } from "./getNotifications.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockDocClient(sendImpl) {
  return { send: jest.fn(sendImpl) };
}

const EVENT_ID = "evt-001";
const USER_ID = "user-a";
const CREATOR_ID = "creator-1";

/** Builds a standard set of DynamoDB items for a single event. */
function makeEventItems({
  status = "AWAITING_CONFIRMATION",
  memberStatus = undefined,
  extraMembers = [],
} = {}) {
  return [
    {
      PK: `EVENT#${EVENT_ID}`,
      SK: "METADATA",
      status,
      creatorId: CREATOR_ID,
      title: "Team Lunch",
    },
    {
      PK: `EVENT#${EVENT_ID}`,
      SK: `USER#${USER_ID}`,
      role: "PARTICIPANT",
      inviteStatus: "PENDING",
      memberStatus,
    },
    ...extraMembers,
  ];
}

function makeConditionalCheckError() {
  const err = new Error("ConditionalCheckFailed");
  err.name = "ConditionalCheckFailedException";
  return err;
}

// ─── confirmAttendance ────────────────────────────────────────────────────────

describe("confirmAttendance", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns ACCEPTED status when not all members have responded yet", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        // First query: event items; second: fresh re-read with one still PENDING
        if (cmd.input.ExpressionAttributeValues[":pk"] === `EVENT#${EVENT_ID}` &&
            !cmd.input.KeyConditionExpression?.includes("begins_with")) {
          return { Items: makeEventItems() };
        }
        return {
          Items: [
            { SK: `USER#${USER_ID}`, inviteStatus: "ACCEPTED", memberStatus: undefined },
            { SK: "USER#user-b",      inviteStatus: "PENDING",  memberStatus: undefined },
          ],
        };
      }
      return {}; // UpdateCommand
    });

    const result = await confirmAttendance(USER_ID, EVENT_ID, docClient);

    expect(result.inviteStatus).toBe("ACCEPTED");
    expect(result.eventStatus).toBe("AWAITING_CONFIRMATION");
    expect(result.allResponded).toBe(false);
  });

  test("advances event to FINALIZED and notifies creator when all members have responded", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [
            { SK: `USER#${USER_ID}`, inviteStatus: "ACCEPTED", memberStatus: undefined },
            { SK: "USER#user-b",      inviteStatus: "DECLINED", memberStatus: undefined },
          ],
        };
      }
      return {};
    });

    const result = await confirmAttendance(USER_ID, EVENT_ID, docClient);

    expect(result.eventStatus).toBe("FINALIZED");
    expect(result.allResponded).toBe(true);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ notifType: "EVENT_FINALIZED", recipientUserId: CREATOR_ID })
    );
  });

  test("ignores LEFT members when checking if all have responded", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [
            { SK: `USER#${USER_ID}`, inviteStatus: "ACCEPTED", memberStatus: undefined },
            { SK: "USER#user-b",      inviteStatus: "PENDING",  memberStatus: "LEFT" },
          ],
        };
      }
      return {};
    });

    const result = await confirmAttendance(USER_ID, EVENT_ID, docClient);

    expect(result.allResponded).toBe(true);
    expect(result.eventStatus).toBe("FINALIZED");
  });

  test("handles ConditionalCheckFailedException silently (concurrent finalize)", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [{ SK: `USER#${USER_ID}`, inviteStatus: "ACCEPTED", memberStatus: undefined }],
        };
      }
      if (cmd.constructor.name === "UpdateCommand" &&
          cmd.input.Key?.SK === "METADATA") {
        throw makeConditionalCheckError();
      }
      return {};
    });

    const result = await confirmAttendance(USER_ID, EVENT_ID, docClient);
    expect(result.inviteStatus).toBe("ACCEPTED");
  });

  test("throws 404 when event does not exist", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
    });

    await expect(confirmAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 404, message: "Event not found." });
  });

  test("throws 404 when METADATA item is missing", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ PK: `EVENT#${EVENT_ID}`, SK: `USER#${USER_ID}` }] };
    });

    await expect(confirmAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 404, message: "Event metadata not found." });
  });

  test("throws 403 when user is not a member", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems().filter(i => i.SK !== `USER#${USER_ID}`) };
    });

    await expect(confirmAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 403, message: "You are not a member of this event." });
  });

  test("throws 403 when member has already left", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems({ memberStatus: "LEFT" }) };
    });

    await expect(confirmAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 403, message: "You have already left this event." });
  });

  test("throws 409 when event status is not AWAITING_CONFIRMATION", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems({ status: "SCHEDULING" }) };
    });

    await expect(confirmAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test("propagates unexpected errors from UpdateCommand", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [{ SK: `USER#${USER_ID}`, inviteStatus: "ACCEPTED", memberStatus: undefined }],
        };
      }
      if (cmd.constructor.name === "UpdateCommand" && cmd.input.Key?.SK === "METADATA")
        throw new Error("DynamoDB timeout");
      return {};
    });

    await expect(confirmAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toThrow("DynamoDB timeout");
  });
});

// ─── declineAttendance ────────────────────────────────────────────────────────

describe("declineAttendance", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns DECLINED status when not all members have responded yet", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [
            { SK: `USER#${USER_ID}`, inviteStatus: "DECLINED", memberStatus: undefined },
            { SK: "USER#user-b",      inviteStatus: "PENDING",  memberStatus: undefined },
          ],
        };
      }
      return {};
    });

    const result = await declineAttendance(USER_ID, EVENT_ID, docClient);

    expect(result.inviteStatus).toBe("DECLINED");
    expect(result.eventStatus).toBe("AWAITING_CONFIRMATION");
    expect(result.allResponded).toBe(false);
  });

  test("advances event to FINALIZED and notifies creator when all members have responded", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [
            { SK: `USER#${USER_ID}`, inviteStatus: "DECLINED", memberStatus: undefined },
            { SK: "USER#user-b",      inviteStatus: "ACCEPTED", memberStatus: undefined },
          ],
        };
      }
      return {};
    });

    const result = await declineAttendance(USER_ID, EVENT_ID, docClient);

    expect(result.eventStatus).toBe("FINALIZED");
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ notifType: "EVENT_FINALIZED" })
    );
  });

  test("ignores LEFT members when checking if all have responded", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [
            { SK: `USER#${USER_ID}`, inviteStatus: "DECLINED", memberStatus: undefined },
            { SK: "USER#user-b",      inviteStatus: "PENDING",  memberStatus: "LEFT" },
          ],
        };
      }
      return {};
    });

    const result = await declineAttendance(USER_ID, EVENT_ID, docClient);
    expect(result.allResponded).toBe(true);
  });

  test("handles ConditionalCheckFailedException silently", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [{ SK: `USER#${USER_ID}`, inviteStatus: "DECLINED", memberStatus: undefined }],
        };
      }
      if (cmd.constructor.name === "UpdateCommand" && cmd.input.Key?.SK === "METADATA")
        throw makeConditionalCheckError();
      return {};
    });

    const result = await declineAttendance(USER_ID, EVENT_ID, docClient);
    expect(result.inviteStatus).toBe("DECLINED");
  });

  test("throws 404 when event does not exist", async () => {
    const docClient = makeMockDocClient(async () => ({ Items: [] }));
    await expect(declineAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test("throws 403 when user is not a member", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems().filter(i => i.SK !== `USER#${USER_ID}`) };
    });
    await expect(declineAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 403, message: "You are not a member of this event." });
  });

  test("throws 403 when member has already left", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems({ memberStatus: "LEFT" }) };
    });
    await expect(declineAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 403, message: "You have already left this event." });
  });

  test("throws 409 when event is not in AWAITING_CONFIRMATION status", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: makeEventItems({ status: "FINALIZED" }) };
    });
    await expect(declineAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test("propagates unexpected errors", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        if (!cmd.input.KeyConditionExpression?.includes("begins_with"))
          return { Items: makeEventItems() };
        return {
          Items: [{ SK: `USER#${USER_ID}`, inviteStatus: "DECLINED", memberStatus: undefined }],
        };
      }
      if (cmd.constructor.name === "UpdateCommand" && cmd.input.Key?.SK === "METADATA")
        throw new Error("Unexpected failure");
      return {};
    });

    await expect(declineAttendance(USER_ID, EVENT_ID, docClient))
      .rejects.toThrow("Unexpected failure");
  });
});