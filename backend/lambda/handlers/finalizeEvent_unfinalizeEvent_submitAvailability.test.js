/**
 * finalizeEvent_unfinalizeEvent_submitAvailability.test.js
 *
 * Coverage targets: finalizeEvent, unfinalizeEvent, submitAvailability
 */

import { finalizeEvent } from "./finalizeEvent.js";
import { unfinalizeEvent } from "./unfinalizeEvent.js";
import { submitAvailability } from "./submitAvailability.js";

jest.mock("./getNotifications.js", () => ({
    createNotification: jest.fn().mockResolvedValue(undefined),
}));
import { createNotification } from "./getNotifications.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockDocClient(sendImpl) {
    return { send: jest.fn(sendImpl) };
}

const EVENT_ID = "evt-001";
const CREATOR_ID = "creator-1";
const USER_ID = "user-b";

const VALID_BODY = {
    selectedTime: { date: "2026-06-01", startHour: 14 },
    selectedVenue: { name: "Cafe Alpha", address: "1 Test St", venueId: "v1" },
};

function makeConditionalCheckError() {
    const err = new Error("ConditionalCheckFailed");
    err.name = "ConditionalCheckFailedException";
    return err;
}

function makeEventItems({ status = "SCHEDULING", creatorId = CREATOR_ID, extraMembers = [] } = {}) {
    return [
        { PK: `EVENT#${EVENT_ID}`, SK: "METADATA", status, creatorId, title: "Team Lunch" },
        { PK: `EVENT#${EVENT_ID}`, SK: `USER#${CREATOR_ID}`, role: "CREATOR", inviteStatus: "ACCEPTED", memberStatus: undefined },
        { PK: `EVENT#${EVENT_ID}`, SK: `USER#${USER_ID}`, role: "PARTICIPANT", inviteStatus: "PENDING", memberStatus: undefined },
        ...extraMembers,
    ];
}

// ─── finalizeEvent ────────────────────────────────────────────────────────────

describe("finalizeEvent", () => {
    beforeEach(() => jest.clearAllMocks());

    test("returns AWAITING_CONFIRMATION with selectedTime and selectedVenue on success", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
            return {};
        });

        const result = await finalizeEvent(CREATOR_ID, EVENT_ID, VALID_BODY, docClient);

        expect(result.status).toBe("AWAITING_CONFIRMATION");
        expect(result.selectedTime).toEqual(VALID_BODY.selectedTime);
        expect(result.selectedVenue).toEqual(VALID_BODY.selectedVenue);
    });

    test("resets non-creator active members to PENDING and notifies them", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
            return {};
        });

        await finalizeEvent(CREATOR_ID, EVENT_ID, VALID_BODY, docClient);

        // Notification sent to the non-creator active member
        expect(createNotification).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ notifType: "ATTENDANCE_REQUEST", recipientUserId: USER_ID })
        );
    });

    test("skips LEFT members when resetting invite status", async () => {
        const items = makeEventItems({
            extraMembers: [
                {
                    PK: `EVENT#${EVENT_ID}`, SK: "USER#user-c", role: "PARTICIPANT",
                    inviteStatus: "PENDING", memberStatus: "LEFT"
                },
            ],
        });
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: items };
            return {};
        });

        await finalizeEvent(CREATOR_ID, EVENT_ID, VALID_BODY, docClient);

        // createNotification should NOT be called for the LEFT member
        const notifCalls = createNotification.mock.calls.map(c => c[1].recipientUserId);
        expect(notifCalls).not.toContain("user-c");
    });

    test("throws 400 when selectedTime is missing", async () => {
        await expect(
            finalizeEvent(CREATOR_ID, EVENT_ID, { selectedVenue: VALID_BODY.selectedVenue }, makeMockDocClient(() => { }))
        ).rejects.toMatchObject({ statusCode: 400, message: "selectedTime with date and startHour is required." });
    });

    test("throws 400 when selectedTime.startHour is null", async () => {
        await expect(
            finalizeEvent(CREATOR_ID, EVENT_ID,
                { selectedTime: { date: "2026-06-01" }, selectedVenue: VALID_BODY.selectedVenue },
                makeMockDocClient(() => { }))
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    test("throws 400 when selectedVenue is missing name", async () => {
        await expect(
            finalizeEvent(CREATOR_ID, EVENT_ID,
                { selectedTime: VALID_BODY.selectedTime, selectedVenue: { address: "1 Test St" } },
                makeMockDocClient(() => { }))
        ).rejects.toMatchObject({ statusCode: 400, message: "selectedVenue with at least a name is required." });
    });

    test("throws 404 when event does not exist", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: [] }));
        await expect(finalizeEvent(CREATOR_ID, EVENT_ID, VALID_BODY, docClient))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    test("throws 403 when caller is not the creator", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
            return {};
        });
        await expect(finalizeEvent("non-creator", EVENT_ID, VALID_BODY, docClient))
            .rejects.toMatchObject({ statusCode: 403, message: "Only the event creator can finalize." });
    });

    test("throws 409 when event status is not SCHEDULING", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeEventItems({ status: "AWAITING_CONFIRMATION" }) };
            return {};
        });
        await expect(finalizeEvent(CREATOR_ID, EVENT_ID, VALID_BODY, docClient))
            .rejects.toMatchObject({ statusCode: 409 });
    });

    test("propagates unexpected DynamoDB errors", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeEventItems() };
            throw new Error("DynamoDB timeout");
        });
        await expect(finalizeEvent(CREATOR_ID, EVENT_ID, VALID_BODY, docClient))
            .rejects.toThrow("DynamoDB timeout");
    });
});

// ─── unfinalizeEvent ──────────────────────────────────────────────────────────

describe("unfinalizeEvent", () => {
    beforeEach(() => jest.clearAllMocks());

    function makeUnfinalizeItems({ status = "AWAITING_CONFIRMATION" } = {}) {
        return [
            { PK: `EVENT#${EVENT_ID}`, SK: "METADATA", status, creatorId: CREATOR_ID, title: "Team Lunch" },
            { PK: `EVENT#${EVENT_ID}`, SK: `USER#${CREATOR_ID}`, role: "CREATOR", memberStatus: undefined },
            { PK: `EVENT#${EVENT_ID}`, SK: `USER#${USER_ID}`, role: "PARTICIPANT", memberStatus: undefined },
        ];
    }

    test("reverts status to SCHEDULING and returns eventId", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeUnfinalizeItems() };
            return {};
        });

        const result = await unfinalizeEvent(CREATOR_ID, EVENT_ID, docClient);

        expect(result).toEqual({ eventId: EVENT_ID, status: "SCHEDULING" });
    });

    test("resets all active members' inviteStatus to PENDING", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeUnfinalizeItems() };
            return {};
        });

        await unfinalizeEvent(CREATOR_ID, EVENT_ID, docClient);

        const updateCalls = docClient.send.mock.calls
            .filter(c => c[0].constructor.name === "UpdateCommand")
            .map(c => c[0].input);

        const memberUpdates = updateCalls.filter(u => u.Key?.SK !== "METADATA");
        expect(memberUpdates.length).toBe(2);
        memberUpdates.forEach(u => {
            expect(u.ExpressionAttributeValues[":pending"]).toBe("PENDING");
        });
    });

    test("skips LEFT members when resetting invite status", async () => {
        const items = [
            ...makeUnfinalizeItems(),
            { PK: `EVENT#${EVENT_ID}`, SK: "USER#user-c", role: "PARTICIPANT", memberStatus: "LEFT" },
        ];
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: items };
            return {};
        });

        await unfinalizeEvent(CREATOR_ID, EVENT_ID, docClient);

        const updateCalls = docClient.send.mock.calls
            .filter(c => c[0].constructor.name === "UpdateCommand")
            .map(c => c[0].input.Key?.SK);

        expect(updateCalls).not.toContain("USER#user-c");
    });

    test("works when status is FINALIZED", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeUnfinalizeItems({ status: "FINALIZED" }) };
            return {};
        });

        const result = await unfinalizeEvent(CREATOR_ID, EVENT_ID, docClient);
        expect(result.status).toBe("SCHEDULING");
    });

    test("throws 404 when event does not exist", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: [] }));
        await expect(unfinalizeEvent(CREATOR_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    test("throws 403 when caller is not the creator", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeUnfinalizeItems() };
            return {};
        });
        await expect(unfinalizeEvent("non-creator", EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 403, message: "Only the event creator can unfinalize." });
    });

    test("throws 409 when status is not AWAITING_CONFIRMATION or FINALIZED", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeUnfinalizeItems({ status: "SCHEDULING" }) };
            return {};
        });
        await expect(unfinalizeEvent(CREATOR_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 409 });
    });
});

// ─── submitAvailability ───────────────────────────────────────────────────────

describe("submitAvailability", () => {
    beforeEach(() => jest.clearAllMocks());

    const VALID_SLOTS = ["2026-06-01-09", "2026-06-01-14"];

    function makeSubmitItems({ status = "COLLECTING_AVAILABILITY" } = {}) {
        return [
            { PK: `EVENT#${EVENT_ID}`, SK: "METADATA", status, creatorId: CREATOR_ID, title: "Team Lunch" },
            {
                PK: `EVENT#${EVENT_ID}`, SK: `USER#${USER_ID}`, role: "PARTICIPANT",
                hasSubmittedAvailability: false, memberStatus: undefined
            },
        ];
    }

    test("returns correct shape when not all members have submitted", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead)
                    return { Items: makeSubmitItems() };
                // Fresh re-read: still one member pending
                return {
                    Items: [
                        { SK: `USER#${USER_ID}`, hasSubmittedAvailability: true, memberStatus: undefined },
                        { SK: "USER#user-c", hasSubmittedAvailability: false, memberStatus: undefined },
                    ],
                };
            }
            return {};
        });

        const result = await submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: VALID_SLOTS }, docClient);

        expect(result.hasSubmittedAvailability).toBe(true);
        expect(result.availableTimeSlots).toEqual(VALID_SLOTS);
        expect(result.allSubmitted).toBe(false);
        expect(result.eventStatus).toBe("COLLECTING_AVAILABILITY");
    });

    test("advances event to SCHEDULING and notifies creator when all members have submitted", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead) return { Items: makeSubmitItems() };
                return {
                    Items: [
                        { SK: `USER#${USER_ID}`, hasSubmittedAvailability: true, memberStatus: undefined },
                    ],
                };
            }
            return {};
        });

        const result = await submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: VALID_SLOTS }, docClient);

        expect(result.allSubmitted).toBe(true);
        expect(result.eventStatus).toBe("SCHEDULING");
        expect(createNotification).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ notifType: "ALL_SUBMITTED", recipientUserId: CREATOR_ID })
        );
    });

    test("handles ConditionalCheckFailedException silently when another request advances status first", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead) return { Items: makeSubmitItems() };
                return {
                    Items: [{ SK: `USER#${USER_ID}`, hasSubmittedAvailability: true, memberStatus: undefined }],
                };
            }
            if (cmd.constructor.name === "UpdateCommand" && cmd.input.Key?.SK === "METADATA")
                throw makeConditionalCheckError();
            return {};
        });

        const result = await submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: VALID_SLOTS }, docClient);
        expect(result.hasSubmittedAvailability).toBe(true);
        // Notification should NOT be sent since this request lost the race
        expect(createNotification).not.toHaveBeenCalled();
    });

    test("throws 400 when availableTimeSlots is empty", async () => {
        await expect(
            submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: [] }, makeMockDocClient(() => { }))
        ).rejects.toMatchObject({ statusCode: 400, message: "availableTimeSlots must be a non-empty array." });
    });

    test("throws 400 when availableTimeSlots is not an array", async () => {
        await expect(
            submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: "invalid" }, makeMockDocClient(() => { }))
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    test("throws 400 when a slot has invalid format", async () => {
        await expect(
            submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: ["2026-06-01"] }, makeMockDocClient(() => { }))
        ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("Invalid slot format") });
    });

    test("throws 404 when event does not exist", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: [] }));
        await expect(submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: VALID_SLOTS }, docClient))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    test("throws 403 when user is not an active member", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeSubmitItems().filter(i => i.SK !== `USER#${USER_ID}`) };
        });
        await expect(submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: VALID_SLOTS }, docClient))
            .rejects.toMatchObject({ statusCode: 403 });
    });

    test("throws 409 when event is not in COLLECTING_AVAILABILITY status", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeSubmitItems({ status: "SCHEDULING" }) };
        });
        await expect(submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: VALID_SLOTS }, docClient))
            .rejects.toMatchObject({ statusCode: 409 });
    });

    test("propagates unexpected DynamoDB errors", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") return { Items: makeSubmitItems() };
            throw new Error("Network failure");
        });
        await expect(submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: VALID_SLOTS }, docClient))
            .rejects.toThrow("Network failure");
    });

    test("throws 404 when METADATA item is missing", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: [{ SK: `USER#${USER_ID}`, memberStatus: undefined }] }; // no METADATA
        });
        await expect(
            submitAvailability(USER_ID, EVENT_ID, { availableTimeSlots: ["2026-06-01-09"] }, docClient)
        ).rejects.toMatchObject({ statusCode: 404, message: "Event metadata not found." });
    });

    test("throws 404 when METADATA item is missing", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: [{ SK: `USER#${CREATOR_ID}` }] }; // no METADATA
        });
        await expect(unfinalizeEvent(CREATOR_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 404, message: "Event metadata not found." });
    });
});