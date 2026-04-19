/**
 * friendHandlers.test.js
 *
 * Coverage targets:
 *   sendFriendRequest, acceptFriendRequest, declineFriendRequest,
 *   listFriendsByUserId, listFriendSuggestions
 *
 * Notes:
 * - docClient is injected as a parameter; send() is mocked directly.
 * - TransactWriteCommand failures are simulated by throwing an Error
 *   with the appropriate name property.
 * - Pagination in listFriendSuggestions is controlled via LastEvaluatedKey.
 */

import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  listFriendsByUserId,
  listFriendSuggestions,
} from "./friendHandlers.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockDocClient(sendImpl) {
  return { send: jest.fn(sendImpl) };
}

/** Simulates a DynamoDB TransactionCanceledException. */
function makeTransactionCanceledError() {
  const err = new Error("Transaction canceled");
  err.name = "TransactionCanceledException";
  return err;
}

// ─── sendFriendRequest ───────────────────────────────────────────────────────

describe("sendFriendRequest", () => {
  beforeEach(() => jest.clearAllMocks());

  test("creates bidirectional PENDING records and returns success message", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      return {};
    });

    const result = await sendFriendRequest(
      "user-a",
      { targetUserId: "user-b" },
      docClient
    );

    expect(result).toEqual({ message: "Friend request sent." });
  });

  test("uses profile.name as snapshot name when profiles exist", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") {
        const key = cmd.input.Key;
        if (key.SK === "PROFILE" && key.PK === "USER#user-a")
          return { Item: { name: "Alice Profile" } };
        if (key.SK === "PROFILE" && key.PK === "USER#user-b")
          return { Item: { name: "Bob Profile" } };
        return {}; // no existing relationship
      }
      return {};
    });

    await sendFriendRequest(
      "user-a",
      { targetUserId: "user-b", requesterName: "Alice Fallback", targetName: "Bob Fallback" },
      docClient
    );

    const transactCall = docClient.send.mock.calls.find(
      (c) => c[0].constructor.name === "TransactWriteCommand"
    );
    const items = transactCall[0].input.TransactItems;
    expect(items[0].Put.Item.name).toBe("Bob Profile");
    expect(items[1].Put.Item.name).toBe("Alice Profile");
  });

  test("falls back to body snapshot name when profiles are missing", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      return {};
    });

    await sendFriendRequest(
      "user-a",
      { targetUserId: "user-b", requesterName: "Alice Fallback", targetName: "Bob Fallback" },
      docClient
    );

    const transactCall = docClient.send.mock.calls.find(
      (c) => c[0].constructor.name === "TransactWriteCommand"
    );
    const items = transactCall[0].input.TransactItems;
    expect(items[0].Put.Item.name).toBe("Bob Fallback");
    expect(items[1].Put.Item.name).toBe("Alice Fallback");
  });

  test("sets requestedBy to the sender's userId on both records", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      return {};
    });

    await sendFriendRequest("user-a", { targetUserId: "user-b" }, docClient);

    const transactCall = docClient.send.mock.calls.find(
      (c) => c[0].constructor.name === "TransactWriteCommand"
    );
    const items = transactCall[0].input.TransactItems;
    expect(items[0].Put.Item.requestedBy).toBe("user-a");
    expect(items[1].Put.Item.requestedBy).toBe("user-a");
  });

  test("throws 400 when targetUserId is empty", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await expect(
      sendFriendRequest("user-a", { targetUserId: "" }, docClient)
    ).rejects.toMatchObject({ statusCode: 400, message: "targetUserId is required." });
  });

  test("throws 400 when sending a request to oneself", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await expect(
      sendFriendRequest("user-a", { targetUserId: "user-a" }, docClient)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "You cannot send a friend request to yourself.",
    });
  });

  test("throws 409 when users are already friends (ACCEPTED)", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { status: "ACCEPTED", requestedBy: "user-b" } };
      return {};
    });

    await expect(
      sendFriendRequest("user-a", { targetUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 409, message: "You are already friends with this user." });
  });

  test("throws 409 when an outgoing PENDING request already exists", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { status: "PENDING", requestedBy: "user-a" } };
      return {};
    });

    await expect(
      sendFriendRequest("user-a", { targetUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 409, message: "Friend request already sent." });
  });

  test("throws 409 and suggests accepting when an incoming PENDING request exists", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { status: "PENDING", requestedBy: "user-b" } };
      return {};
    });

    await expect(
      sendFriendRequest("user-a", { targetUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Incoming request exists. Please accept it instead.",
    });
  });

  test("maps TransactionCanceledException to 409", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      throw makeTransactionCanceledError();
    });

    await expect(
      sendFriendRequest("user-a", { targetUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 409, message: "Friend request already exists." });
  });

  test("propagates unexpected DynamoDB errors", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      throw new Error("Network failure");
    });

    await expect(
      sendFriendRequest("user-a", { targetUserId: "user-b" }, docClient)
    ).rejects.toThrow("Network failure");
  });
});

// ─── acceptFriendRequest ─────────────────────────────────────────────────────

describe("acceptFriendRequest", () => {
  beforeEach(() => jest.clearAllMocks());

  const PENDING_INCOMING = {
    Item: { status: "PENDING", requestedBy: "user-b" },
  };

  test("updates both records to ACCEPTED and returns success message", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return PENDING_INCOMING;
      return {};
    });

    const result = await acceptFriendRequest(
      "user-a",
      { requesterUserId: "user-b" },
      docClient
    );

    expect(result).toEqual({ message: "Friend request accepted." });

    const transactCall = docClient.send.mock.calls.find(
      (c) => c[0].constructor.name === "TransactWriteCommand"
    );
    const items = transactCall[0].input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items[0].Update.ExpressionAttributeValues[":accepted"]).toBe("ACCEPTED");
    expect(items[1].Update.ExpressionAttributeValues[":accepted"]).toBe("ACCEPTED");
  });

  test("throws 400 when requesterUserId is empty", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await expect(
      acceptFriendRequest("user-a", { requesterUserId: "" }, docClient)
    ).rejects.toMatchObject({ statusCode: 400, message: "requesterUserId is required." });
  });

  test("throws 400 when requesterUserId equals own userId", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await expect(
      acceptFriendRequest("user-a", { requesterUserId: "user-a" }, docClient)
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid requesterUserId." });
  });

  test("throws 404 when the relationship does not exist", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      return {};
    });

    await expect(
      acceptFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 404, message: "Friend request not found." });
  });

  test("throws 409 when users are already friends (ACCEPTED)", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { status: "ACCEPTED", requestedBy: "user-b" } };
      return {};
    });

    await expect(
      acceptFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 409, message: "You are already friends with this user." });
  });

  test("throws 400 when the request was not sent by requesterUserId (not an incoming request)", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { status: "PENDING", requestedBy: "user-a" } };
      return {};
    });

    await expect(
      acceptFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Only incoming friend requests can be accepted.",
    });
  });

  test("maps TransactionCanceledException to 404", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return PENDING_INCOMING;
      throw makeTransactionCanceledError();
    });

    await expect(
      acceptFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 404, message: "Friend request not found." });
  });

  test("propagates unexpected DynamoDB errors during accept", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return PENDING_INCOMING;
      throw new Error("Unexpected failure");
    });

    await expect(
      acceptFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toThrow("Unexpected failure");
  });
});

// ─── declineFriendRequest ────────────────────────────────────────────────────

describe("declineFriendRequest", () => {
  beforeEach(() => jest.clearAllMocks());

  const PENDING_INCOMING = {
    Item: { status: "PENDING", requestedBy: "user-b" },
  };

  test("deletes both records and returns success message", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return PENDING_INCOMING;
      return {};
    });

    const result = await declineFriendRequest(
      "user-a",
      { requesterUserId: "user-b" },
      docClient
    );

    expect(result).toEqual({ message: "Friend request declined." });

    const transactCall = docClient.send.mock.calls.find(
      (c) => c[0].constructor.name === "TransactWriteCommand"
    );
    const items = transactCall[0].input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items[0].Delete.Key).toEqual({ PK: "USER#user-a", SK: "FRIEND#user-b" });
    expect(items[1].Delete.Key).toEqual({ PK: "USER#user-b", SK: "FRIEND#user-a" });
  });

  test("throws 400 when requesterUserId is empty", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await expect(
      declineFriendRequest("user-a", { requesterUserId: "" }, docClient)
    ).rejects.toMatchObject({ statusCode: 400, message: "requesterUserId is required." });
  });

  test("throws 400 when requesterUserId equals own userId", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await expect(
      declineFriendRequest("user-a", { requesterUserId: "user-a" }, docClient)
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid requesterUserId." });
  });

  test("throws 404 when the relationship does not exist", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      return {};
    });

    await expect(
      declineFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 404, message: "Friend request not found." });
  });

  test("throws 409 when the relationship is not in PENDING state", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { status: "ACCEPTED", requestedBy: "user-b" } };
      return {};
    });

    await expect(
      declineFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Friend relationship is not in a pending state.",
    });
  });

  test("throws 400 when the request was not incoming", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { status: "PENDING", requestedBy: "user-a" } };
      return {};
    });

    await expect(
      declineFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Only incoming friend requests can be declined.",
    });
  });

  test("maps TransactionCanceledException to 404", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return PENDING_INCOMING;
      throw makeTransactionCanceledError();
    });

    await expect(
      declineFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toMatchObject({ statusCode: 404, message: "Friend request not found." });
  });

  test("propagates unexpected DynamoDB errors during decline", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return PENDING_INCOMING;
      throw new Error("Unexpected failure");
    });

    await expect(
      declineFriendRequest("user-a", { requesterUserId: "user-b" }, docClient)
    ).rejects.toThrow("Unexpected failure");
  });
});

// ─── listFriendsByUserId ──────────────────────────────────────────────────────

describe("listFriendsByUserId", () => {
  beforeEach(() => jest.clearAllMocks());

  test("handles absent Responses key in BatchGetCommand result", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return {
          Items: [{
            SK: "FRIEND#user-b", friendId: "user-b",
            status: "ACCEPTED", requestedBy: "user-b"
          }]
        };
      // Responses exists but TABLE_NAME key is absent
      if (cmd.constructor.name === "BatchGetCommand")
        return { Responses: {} };
    });

    const result = await listFriendsByUserId("user-a", docClient);
    expect(result.friends[0].userId).toBe("user-b");
  });

  test("splits BatchGet into two calls when friend count exceeds 100", async () => {
    const manyFriendIds = Array.from({ length: 101 }, (_, i) => `user-${i}`);
    const friendItems = manyFriendIds.map((id) => ({
      SK: `FRIEND#${id}`,
      friendId: id,
      status: "ACCEPTED",
      requestedBy: id,
    }));

    let batchCallCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: friendItems };
      if (cmd.constructor.name === "BatchGetCommand") {
        batchCallCount++;
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
      }
    });

    await listFriendsByUserId("user-a", docClient);
    expect(batchCallCount).toBe(2);
  });

  test("categorises relationships into friends, outgoing and incoming correctly", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        return {
          Items: [
            { PK: "USER#user-a", SK: "FRIEND#user-b", friendId: "user-b", status: "ACCEPTED", requestedBy: "user-b" },
            { PK: "USER#user-a", SK: "FRIEND#user-c", friendId: "user-c", status: "PENDING", requestedBy: "user-a" },
            { PK: "USER#user-a", SK: "FRIEND#user-d", friendId: "user-d", status: "PENDING", requestedBy: "user-d" },
          ],
        };
      }
      if (cmd.constructor.name === "BatchGetCommand") {
        return {
          Responses: {
            [process.env.MAIN_TABLE]: [
              { PK: "USER#user-b", SK: "PROFILE", userId: "user-b", name: "Bob" },
              { PK: "USER#user-c", SK: "PROFILE", userId: "user-c", name: "Carol" },
              { PK: "USER#user-d", SK: "PROFILE", userId: "user-d", name: "Dave" },
            ],
          },
        };
      }
    });

    const result = await listFriendsByUserId("user-a", docClient);

    expect(result.friends).toHaveLength(1);
    expect(result.friends[0].userId).toBe("user-b");

    expect(result.outgoingRequests).toHaveLength(1);
    expect(result.outgoingRequests[0].userId).toBe("user-c");

    expect(result.incomingRequests).toHaveLength(1);
    expect(result.incomingRequests[0].userId).toBe("user-d");
  });

  test("returns three empty arrays when there are no relationships", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await listFriendsByUserId("user-a", docClient);

    expect(result.friends).toEqual([]);
    expect(result.incomingRequests).toEqual([]);
    expect(result.outgoingRequests).toEqual([]);
  });

  test("falls back to item.name then friendId when profile is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        return {
          Items: [
            { PK: "USER#user-a", SK: "FRIEND#user-b", friendId: "user-b", status: "ACCEPTED", requestedBy: "user-b", name: "Bob Snapshot" },
          ],
        };
      }
      // BatchGet returns empty
      return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await listFriendsByUserId("user-a", docClient);

    expect(result.friends[0].name).toBe("Bob Snapshot");
  });

  test("sorts the friends list alphabetically by name", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        return {
          Items: [
            { SK: "FRIEND#user-z", friendId: "user-z", status: "ACCEPTED", requestedBy: "user-z" },
            { SK: "FRIEND#user-a2", friendId: "user-a2", status: "ACCEPTED", requestedBy: "user-a2" },
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

    const result = await listFriendsByUserId("user-a", docClient);

    expect(result.friends[0].name).toBe("Amy");
    expect(result.friends[1].name).toBe("Zoe");
  });

  test("derives friendId from SK when friendId field is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") {
        return {
          // No friendId field — only SK present
          Items: [{ SK: "FRIEND#user-b", status: "ACCEPTED", requestedBy: "user-b" }],
        };
      }
      return { Responses: { [process.env.MAIN_TABLE]: [] } };
    });

    const result = await listFriendsByUserId("user-a", docClient);

    expect(result.friends[0].userId).toBe("user-b");
  });

  test("handles missing Responses in BatchGetCommand result gracefully", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b", friendId: "user-b", status: "ACCEPTED", requestedBy: "user-b" }] };
      return { Responses: {} }; // TABLE_NAME key absent
    });

    const result = await listFriendsByUserId("user-a", docClient);
    expect(result.friends[0].userId).toBe("user-b");
  });

  test("splits BatchGet into two calls when friend count exceeds 100", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `user-${i}`);
    const items = ids.map((id) => ({ SK: `FRIEND#${id}`, friendId: id, status: "ACCEPTED", requestedBy: id }));

    let batchCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "QueryCommand") return { Items: items };
      if (cmd.constructor.name === "BatchGetCommand") {
        batchCount++;
        return { Responses: { [process.env.MAIN_TABLE]: [] } };
      }
    });

    await listFriendsByUserId("user-a", docClient);
    expect(batchCount).toBe(2);
  });
});

// ─── listFriendSuggestions ───────────────────────────────────────────────────

describe("listFriendSuggestions", () => {
  beforeEach(() => jest.clearAllMocks());
  test("derives candidateUserId from PK when userId field is absent in scan result", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand") {
        return {
          Items: [
            // No userId field — only PK
            { PK: "USER#user-b", SK: "PROFILE", name: "Bob", interests: ["Badminton"] },
          ],
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);
    expect(result.suggestions[0].userId).toBe("user-b");
  });

  test("returns no suggestions when there are no common interests", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand") {
        return {
          Items: [{ PK: "USER#user-b", userId: "user-b", name: "Bob", interests: ["Swimming"] }],
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(result.suggestions).toEqual([]);
  });

  test("ranks suggestions by Jaccard score descending", async () => {
    // user-b: 1 common / 2 union = 0.5
    // user-c: 2 common / 3 union ≈ 0.667
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton", "Cycling"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand") {
        return {
          Items: [
            { PK: "USER#user-b", userId: "user-b", name: "Bob", interests: ["Badminton", "Swimming"] },
            { PK: "USER#user-c", userId: "user-c", name: "Carol", interests: ["Badminton", "Cycling", "Yoga"] },
          ],
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(result.suggestions[0].userId).toBe("user-c");
    expect(result.suggestions[0].score).toBeCloseTo(0.6667, 3);
    expect(result.suggestions[1].userId).toBe("user-b");
    expect(result.suggestions[1].score).toBeCloseTo(0.3333, 3);
  });

  test("excludes users who already have a relationship (friend or pending)", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton"] } };
      if (cmd.constructor.name === "QueryCommand")
        return { Items: [{ SK: "FRIEND#user-b", friendId: "user-b", status: "ACCEPTED" }] };
      if (cmd.constructor.name === "ScanCommand") {
        return {
          Items: [{ PK: "USER#user-b", userId: "user-b", name: "Bob", interests: ["Badminton"] }],
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(result.suggestions).toHaveLength(0);
  });

  test("excludes the requesting user from suggestions", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand") {
        return {
          // Scan result includes the requesting user itself
          Items: [{ PK: "USER#user-a", userId: "user-a", name: "Self", interests: ["Badminton"] }],
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(result.suggestions).toHaveLength(0);
  });

  test("returns empty suggestions when the user profile does not exist", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand") return {};
      return {};
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(result).toEqual({ userId: "user-a", suggestions: [] });
    // No further DynamoDB calls should be made
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  test("continues scanning until LastEvaluatedKey is absent (pagination)", async () => {
    let scanCount = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand") {
        scanCount++;
        if (scanCount === 1) {
          return {
            Items: [{ PK: "USER#user-b", userId: "user-b", name: "Bob", interests: ["Badminton"] }],
            LastEvaluatedKey: { PK: "USER#user-b" },
          };
        }
        return {
          Items: [{ PK: "USER#user-c", userId: "user-c", name: "Carol", interests: ["Badminton"] }],
          // No LastEvaluatedKey — pagination ends
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(scanCount).toBe(2);
    expect(result.suggestions).toHaveLength(2);
  });

  test("sorts by name alphabetically when Jaccard scores are equal", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand") {
        return {
          Items: [
            { PK: "USER#user-z", userId: "user-z", name: "Zoe", interests: ["Badminton"] },
            { PK: "USER#user-m", userId: "user-m", name: "Milly", interests: ["Badminton"] },
          ],
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(result.suggestions[0].name).toBe("Milly");
    expect(result.suggestions[1].name).toBe("Zoe");
  });

  test("commonInterests contains deduplicated shared interests", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton", "Cycling"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand") {
        return {
          Items: [{ PK: "USER#user-b", userId: "user-b", name: "Bob", interests: ["Badminton", "Cycling", "Yoga"] }],
        };
      }
    });

    const result = await listFriendSuggestions("user-a", docClient);

    expect(result.suggestions[0].commonInterests).toEqual(["badminton", "cycling"]);
  });

  test("derives candidateUserId from PK when userId field is absent", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd.constructor.name === "GetCommand")
        return { Item: { userId: "user-a", interests: ["Badminton"] } };
      if (cmd.constructor.name === "QueryCommand") return { Items: [] };
      if (cmd.constructor.name === "ScanCommand")
        return {
          Items: [{
            PK: "USER#user-b",
            SK: "PROFILE",
            name: "Bob",
            interests: ["Badminton"],
            // explicitly no userId field
          }],
        };
    });

    const result = await listFriendSuggestions("user-a", docClient);
    expect(result.suggestions[0].userId).toBe("user-b");
  });
});