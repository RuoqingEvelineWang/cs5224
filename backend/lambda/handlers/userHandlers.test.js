import assert from "node:assert/strict";
import test from "node:test";

process.env.MAIN_TABLE = "test-main";

const { getMyProfile, upsertMyProfile } = await import("./userHandlers.js");

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

test("getMyProfile returns normalized user shape", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-a",
          SK: "PROFILE",
          userId: "user-a",
          name: "Alice",
          email: "alice@example.com",
          approxArea: "Jurong East",
          transportType: "MRT",
          interests: ["Badminton", "Cycling"],
        },
      };
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  const profile = await getMyProfile("user-a", client);
  assert.deepEqual(profile, {
    userId: "user-a",
    name: "Alice",
    email: "alice@example.com",
    address: "Jurong East",
    transportType: "MRT",
    interests: ["Badminton", "Cycling"],
  });

  assert.equal(calls.length, 1);
  assert.equal(commandName(calls[0]), "GetCommand");
});

test("getMyProfile returns 404 when profile does not exist", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  await assert.rejects(
    () => getMyProfile("user-a", client),
    (error) => {
      assert.equal(error.statusCode, 404);
      assert.equal(error.message, "Profile not found.");
      return true;
    }
  );

  assert.equal(calls.length, 1);
});

test("upsertMyProfile creates profile with defaults and timestamps", async () => {
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {};
    }
    if (commandName(command) === "PutCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  const profile = await upsertMyProfile(
    "user-a",
    {
      name: "Alice",
      interests: ["Badminton", "Badminton", "Cycling"],
    },
    { email: "alice@example.com" },
    client
  );

  assert.equal(profile.userId, "user-a");
  assert.equal(profile.name, "Alice");
  assert.equal(profile.email, "alice@example.com");
  assert.equal(profile.address, "");
  assert.equal(profile.transportType, "");
  assert.deepEqual(profile.interests, ["Badminton", "Cycling"]);

  assert.equal(calls.length, 2);
  assert.equal(commandName(calls[1]), "PutCommand");
  const item = calls[1].input.Item;
  assert.equal(item.PK, "USER#user-a");
  assert.equal(item.SK, "PROFILE");
  assert.equal(item.GSI2PK, "EMAIL#alice@example.com");
  assert.equal(item.GSI2SK, "PROFILE");
  assert.ok(item.createdAt);
  assert.ok(item.updatedAt);
});

test("upsertMyProfile preserves createdAt on update", async () => {
  const existingCreatedAt = "2026-04-01T00:00:00.000Z";
  const { calls, client } = createDocClient(async (command) => {
    if (commandName(command) === "GetCommand") {
      return {
        Item: {
          PK: "USER#user-a",
          SK: "PROFILE",
          userId: "user-a",
          name: "Old Name",
          email: "alice@example.com",
          address: "Old Address",
          transportType: "Walking",
          interests: ["Yoga"],
          createdAt: existingCreatedAt,
        },
      };
    }
    if (commandName(command) === "PutCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName(command)}`);
  });

  const profile = await upsertMyProfile(
    "user-a",
    {
      name: "New Name",
      address: "Bishan",
      transportType: "Car",
      interests: ["Running"],
    },
    { email: "alice@example.com" },
    client
  );

  assert.equal(profile.name, "New Name");
  assert.equal(profile.address, "Bishan");
  assert.equal(profile.transportType, "Car");
  assert.deepEqual(profile.interests, ["Running"]);

  const item = calls[1].input.Item;
  assert.equal(item.createdAt, existingCreatedAt);
  assert.notEqual(item.updatedAt, existingCreatedAt);
});
