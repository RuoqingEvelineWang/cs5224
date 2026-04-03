import assert from "node:assert/strict";
import test from "node:test";

process.env.MAIN_TABLE = "test-main";

const {
  sendFriendRequest,
  declineFriendRequest,
  listFriendSuggestions,
} = await import("./friendHandlers.js");

function createDocClient(handler) {
  const calls = [];
  return {
    calls,
    client: {
      async send(command) {
        calls.push(command);
        return handler(command);
      },
    },
  };
}

function commandName(command) {
  return command?.constructor?.name || "";
}

test("sendFriendRequest creates bidirectional pending records and snapshots payload names when profiles are missing", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {};
    }
    if (commandName(command) === "TransactWriteCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  const response = await sendFriendRequest(
    "user-a",
    {
      targetUserId: "user-b",
      requesterName: "Alice Fallback",
      targetName: "Bob Fallback",
    },
    client
  );
  assert.equal(response.message, "Friend request sent.");

  assert.equal(calls.length, 4);
  assert.equal(commandName(calls[0]), "GetCommand");
  assert.deepEqual(calls[0].input.Key, {
    PK: "USER#user-a",
    SK: "FRIEND#user-b",
  });

  assert.equal(commandName(calls[1]), "GetCommand");
  assert.deepEqual(calls[1].input.Key, {
    PK: "USER#user-a",
    SK: "PROFILE",
  });
  assert.equal(commandName(calls[2]), "GetCommand");
  assert.deepEqual(calls[2].input.Key, {
    PK: "USER#user-b",
    SK: "PROFILE",
  });

  assert.equal(commandName(calls[3]), "TransactWriteCommand");
  const transactItems = calls[3].input.TransactItems;
  assert.equal(transactItems.length, 2);

  assert.equal(transactItems[0].Put.Item.PK, "USER#user-a");
  assert.equal(transactItems[0].Put.Item.SK, "FRIEND#user-b");
  assert.equal(transactItems[0].Put.Item.status, "PENDING");
  assert.equal(transactItems[0].Put.Item.requestedBy, "user-a");
  assert.equal(transactItems[0].Put.Item.name, "Bob Fallback");

  assert.equal(transactItems[1].Put.Item.PK, "USER#user-b");
  assert.equal(transactItems[1].Put.Item.SK, "FRIEND#user-a");
  assert.equal(transactItems[1].Put.Item.status, "PENDING");
  assert.equal(transactItems[1].Put.Item.requestedBy, "user-a");
  assert.equal(transactItems[1].Put.Item.name, "Alice Fallback");
});

test("sendFriendRequest prefers profile names over payload snapshots", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      const key = command.input.Key;
      if (key.SK === "PROFILE" && key.PK === "USER#user-a") {
        return { Item: { PK: key.PK, SK: key.SK, name: "Alice Profile" } };
      }
      if (key.SK === "PROFILE" && key.PK === "USER#user-b") {
        return { Item: { PK: key.PK, SK: key.SK, name: "Bob Profile" } };
      }
      return {};
    }
    if (commandName(command) === "TransactWriteCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  await sendFriendRequest(
    "user-a",
    {
      targetUserId: "user-b",
      requesterName: "Alice Payload",
      targetName: "Bob Payload",
    },
    client
  );

  const transactItems = calls[3].input.TransactItems;
  assert.equal(transactItems[0].Put.Item.name, "Bob Profile");
  assert.equal(transactItems[1].Put.Item.name, "Alice Profile");
});

test("sendFriendRequest returns 409 when request already sent by requester", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-a",
          SK: "FRIEND#user-b",
          status: "PENDING",
          requestedBy: "user-a",
        },
      };
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  await assert.rejects(
    () => sendFriendRequest("user-a", { targetUserId: "user-b" }, client),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.message, "Friend request already sent.");
      return true;
    }
  );

  assert.equal(calls.length, 1);
});

test("sendFriendRequest returns 409 when users are already friends", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-a",
          SK: "FRIEND#user-b",
          status: "ACCEPTED",
          requestedBy: "user-b",
        },
      };
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  await assert.rejects(
    () => sendFriendRequest("user-a", { targetUserId: "user-b" }, client),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.message, "You are already friends with this user.");
      return true;
    }
  );

  assert.equal(calls.length, 1);
});

test("sendFriendRequest returns 409 when incoming pending request already exists", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-a",
          SK: "FRIEND#user-b",
          status: "PENDING",
          requestedBy: "user-b",
        },
      };
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  await assert.rejects(
    () => sendFriendRequest("user-a", { targetUserId: "user-b" }, client),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.message, "Incoming request exists. Please accept it instead.");
      return true;
    }
  );

  assert.equal(calls.length, 1);
});

test("declineFriendRequest deletes both pending records for an incoming request", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-b",
          SK: "FRIEND#user-a",
          status: "PENDING",
          requestedBy: "user-a",
        },
      };
    }
    if (commandName(command) === "TransactWriteCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  const response = await declineFriendRequest("user-b", { requesterUserId: "user-a" }, client);
  assert.equal(response.message, "Friend request declined.");

  assert.equal(calls.length, 2);
  assert.equal(commandName(calls[1]), "TransactWriteCommand");
  const transactItems = calls[1].input.TransactItems;
  assert.equal(transactItems.length, 2);
  assert.deepEqual(transactItems[0].Delete.Key, {
    PK: "USER#user-b",
    SK: "FRIEND#user-a",
  });
  assert.deepEqual(transactItems[1].Delete.Key, {
    PK: "USER#user-a",
    SK: "FRIEND#user-b",
  });
});

test("declineFriendRequest returns 400 when request is not incoming", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-b",
          SK: "FRIEND#user-a",
          status: "PENDING",
          requestedBy: "user-b",
        },
      };
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  await assert.rejects(
    () => declineFriendRequest("user-b", { requesterUserId: "user-a" }, client),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.message, "Only incoming friend requests can be declined.");
      return true;
    }
  );

  assert.equal(calls.length, 1);
});

test("declineFriendRequest returns 409 when relationship is not pending", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-b",
          SK: "FRIEND#user-a",
          status: "ACCEPTED",
          requestedBy: "user-a",
        },
      };
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  await assert.rejects(
    () => declineFriendRequest("user-b", { requesterUserId: "user-a" }, client),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.message, "Friend relationship is not in a pending state.");
      return true;
    }
  );

  assert.equal(calls.length, 1);
});

test("listFriendSuggestions returns empty list when current user profile is missing", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  const response = await listFriendSuggestions("user-a", client);
  assert.deepEqual(response, {
    userId: "user-a",
    suggestions: [],
  });

  assert.equal(calls.length, 1);
  assert.equal(commandName(calls[0]), "GetCommand");
});
