/**
 * createEvent.test.js
 */

import { createEvent } from "./createEvent.js";

function makeMockDocClient(sendImpl) {
  return { send: jest.fn(sendImpl) };
}

describe("createEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  const BASE_BODY = {
    title: "Basketball Game",
    description: "Let's play!",
    venueType: "Sports Hall",
    dateRange: { start: "2024-06-01", end: "2024-06-07" },
    participantIds: ["user-b", "user-c"],
  };

  test("returns eventId, title and initial status", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    const result = await createEvent("user-a", BASE_BODY, docClient);

    expect(result.eventId).toMatch(/^evt-/);
    expect(result.title).toBe("Basketball Game");
    expect(result.status).toBe("COLLECTING_AVAILABILITY");
  });

  test("BatchWrite includes METADATA, Creator and all Invitee records", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await createEvent("user-a", BASE_BODY, docClient);

    const batchCall = docClient.send.mock.calls[0][0];
    const tableItems = batchCall.input.RequestItems[process.env.MAIN_TABLE];

    // 1 METADATA + 1 creator + 2 invitees = 4
    expect(tableItems).toHaveLength(4);
  });

  test("METADATA record contains all required fields", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await createEvent("user-a", BASE_BODY, docClient);

    const items = docClient.send.mock.calls[0][0].input.RequestItems[process.env.MAIN_TABLE];
    const meta = items.find((i) => i.PutRequest.Item.SK === "METADATA")?.PutRequest.Item;

    expect(meta).toBeDefined();
    expect(meta.Type).toBe("EventInfo");
    expect(meta.creatorId).toBe("user-a");
    expect(meta.status).toBe("COLLECTING_AVAILABILITY");
    expect(meta.title).toBe("Basketball Game");
    expect(meta.venueType).toBe("Sports Hall");
    expect(meta.createdAt).toBeTruthy();
  });

  test("Creator record has role=CREATOR and inviteStatus=ACCEPTED", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await createEvent("user-a", BASE_BODY, docClient);

    const items = docClient.send.mock.calls[0][0].input.RequestItems[process.env.MAIN_TABLE];
    const creator = items
      .map((i) => i.PutRequest.Item)
      .find((i) => i.SK === `USER#user-a`);

    expect(creator.role).toBe("CREATOR");
    expect(creator.inviteStatus).toBe("ACCEPTED");
    expect(creator.GSI1PK).toBe("USER#user-a");
  });

  test("Invitee record has role=PARTICIPANT and inviteStatus=PENDING", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await createEvent("user-a", BASE_BODY, docClient);

    const items = docClient.send.mock.calls[0][0].input.RequestItems[process.env.MAIN_TABLE];
    const invitee = items
      .map((i) => i.PutRequest.Item)
      .find((i) => i.SK === "USER#user-b");

    expect(invitee.role).toBe("PARTICIPANT");
    expect(invitee.inviteStatus).toBe("PENDING");
    expect(invitee.GSI1PK).toBe("USER#user-b");
  });

  test("writes only METADATA and Creator records when participantIds is empty", async () => {
    const docClient = makeMockDocClient(async () => ({}));

    await createEvent("user-a", { ...BASE_BODY, participantIds: [] }, docClient);

    const items = docClient.send.mock.calls[0][0].input.RequestItems[process.env.MAIN_TABLE];
    expect(items).toHaveLength(2);
  });

  test("does not throw and writes 2 records when participantIds is absent", async () => {
    const docClient = makeMockDocClient(async () => ({}));
    const { participantIds, ...bodyWithout } = BASE_BODY;

    await createEvent("user-a", bodyWithout, docClient);

    const items = docClient.send.mock.calls[0][0].input.RequestItems[process.env.MAIN_TABLE];
    expect(items).toHaveLength(2);
  });

  test("defaults description to an empty string when absent", async () => {
    const docClient = makeMockDocClient(async () => ({}));
    const { description, ...bodyWithout } = BASE_BODY;

    await createEvent("user-a", bodyWithout, docClient);

    const items = docClient.send.mock.calls[0][0].input.RequestItems[process.env.MAIN_TABLE];
    const meta = items.find((i) => i.PutRequest.Item.SK === "METADATA")?.PutRequest.Item;
    expect(meta.description).toBe("");
  });

  test("propagates DynamoDB errors", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("Batch write failed");
    });

    await expect(createEvent("user-a", BASE_BODY, docClient)).rejects.toThrow(
      "Batch write failed"
    );
  });
});