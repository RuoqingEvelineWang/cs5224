/**
 * leaveEvent_getNotifications_getTimeRecommendations.test.js
 *
 * Coverage targets: leaveEvent, getNotifications (createNotification,
 * getNotifications, markNotificationsRead, deleteNotification),
 * getTimeRecommendations
 */

import { leaveEvent } from "./leaveEvent.js";
import {
    createNotification,
    getNotifications,
    markNotificationsRead,
    deleteNotification,
} from "./getNotifications.js";
import { getTimeRecommendations } from "./getTimeRecommendations.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockDocClient(sendImpl) {
    return { send: jest.fn(sendImpl) };
}

const EVENT_ID = "evt-001";
const CREATOR_ID = "creator-1";
const USER_ID = "user-b";

function makeConditionalCheckError() {
    const err = new Error("ConditionalCheckFailed");
    err.name = "ConditionalCheckFailedException";
    return err;
}

// ─── leaveEvent ───────────────────────────────────────────────────────────────

describe("leaveEvent", () => {
    beforeEach(() => jest.clearAllMocks());

    function makeItems({ status = "COLLECTING_AVAILABILITY", myRole = "PARTICIPANT",
        myMemberStatus = undefined, extraMembers = [] } = {}) {
        return [
            { PK: `EVENT#${EVENT_ID}`, SK: "METADATA", status, creatorId: CREATOR_ID, title: "Team Lunch" },
            {
                PK: `EVENT#${EVENT_ID}`, SK: `USER#${CREATOR_ID}`, role: "CREATOR",
                hasSubmittedAvailability: true, memberStatus: undefined, inviteStatus: "ACCEPTED"
            },
            {
                PK: `EVENT#${EVENT_ID}`, SK: `USER#${USER_ID}`, role: myRole,
                hasSubmittedAvailability: false, memberStatus: myMemberStatus, inviteStatus: "PENDING"
            },
            ...extraMembers,
        ];
    }

    // ── COLLECTING_AVAILABILITY ──

    test("soft-removes member and returns action=left during COLLECTING_AVAILABILITY", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead) return { Items: makeItems() };
                // Fresh re-read: remaining member has not submitted
                return { Items: [{ SK: `USER#${CREATOR_ID}`, hasSubmittedAvailability: false, memberStatus: undefined }] };
            }
            return {};
        });

        const result = await leaveEvent(USER_ID, EVENT_ID, docClient);
        expect(result).toEqual({ eventId: EVENT_ID, userId: USER_ID, action: "left" });
    });

    test("advances event to SCHEDULING when all remaining members have submitted after leave", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead) return { Items: makeItems() };
                // After leave: only creator remains, and they have submitted
                return { Items: [{ SK: `USER#${CREATOR_ID}`, hasSubmittedAvailability: true, memberStatus: undefined }] };
            }
            return {};
        });

        // createNotification is a real function here but docClient.send handles PutCommand
        const result = await leaveEvent(USER_ID, EVENT_ID, docClient);
        expect(result.action).toBe("left");

        const updateCalls = docClient.send.mock.calls
            .filter(c => c[0].constructor.name === "UpdateCommand")
            .map(c => c[0].input);
        const metaUpdate = updateCalls.find(u => u.Key?.SK === "METADATA");
        expect(metaUpdate.ExpressionAttributeValues[":scheduling"]).toBe("SCHEDULING");
    });

    test("handles ConditionalCheckFailedException silently when status advance races", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead) return { Items: makeItems() };
                return { Items: [{ SK: `USER#${CREATOR_ID}`, hasSubmittedAvailability: true, memberStatus: undefined }] };
            }
            if (cmd.constructor.name === "UpdateCommand" && cmd.input.Key?.SK === "METADATA")
                throw makeConditionalCheckError();
            return {};
        });

        const result = await leaveEvent(USER_ID, EVENT_ID, docClient);
        expect(result.action).toBe("left");
    });

    // ── AWAITING_CONFIRMATION ──

    test("sets inviteStatus=DECLINED during AWAITING_CONFIRMATION and returns action=declined", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead)
                    return { Items: makeItems({ status: "AWAITING_CONFIRMATION" }) };
                // All participants responded
                return {
                    Items: [
                        { SK: `USER#${CREATOR_ID}`, role: "CREATOR", inviteStatus: "ACCEPTED" },
                        { SK: `USER#${USER_ID}`, role: "PARTICIPANT", inviteStatus: "DECLINED" },
                    ],
                };
            }
            return {};
        });

        const result = await leaveEvent(USER_ID, EVENT_ID, docClient);
        expect(result.action).toBe("declined");
    });

    test("advances to FINALIZED when all non-creator members have responded during AWAITING_CONFIRMATION", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead)
                    return { Items: makeItems({ status: "AWAITING_CONFIRMATION" }) };
                return {
                    Items: [
                        { SK: `USER#${CREATOR_ID}`, role: "CREATOR", inviteStatus: "ACCEPTED" },
                        { SK: `USER#${USER_ID}`, role: "PARTICIPANT", inviteStatus: "DECLINED" },
                    ],
                };
            }
            return {};
        });

        await leaveEvent(USER_ID, EVENT_ID, docClient);

        const updateCalls = docClient.send.mock.calls
            .filter(c => c[0].constructor.name === "UpdateCommand")
            .map(c => c[0].input);
        const metaUpdate = updateCalls.find(u => u.Key?.SK === "METADATA");
        expect(metaUpdate?.ExpressionAttributeValues[":finalized"]).toBe("FINALIZED");
    });

    test("handles ConditionalCheckFailedException during AWAITING_CONFIRMATION finalize", async () => {
        let updateCount = 0;
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand") {
                if (!cmd.input.ConsistentRead)
                    return { Items: makeItems({ status: "AWAITING_CONFIRMATION" }) };
                return {
                    Items: [
                        { SK: `USER#${CREATOR_ID}`, role: "CREATOR", inviteStatus: "ACCEPTED" },
                        { SK: `USER#${USER_ID}`, role: "PARTICIPANT", inviteStatus: "DECLINED" },
                    ],
                };
            }
            if (cmd.constructor.name === "UpdateCommand") {
                updateCount++;
                if (cmd.input.Key?.SK === "METADATA") throw makeConditionalCheckError();
                return {};
            }
            return {};
        });

        const result = await leaveEvent(USER_ID, EVENT_ID, docClient);
        expect(result.action).toBe("declined");
    });

    // ── FINALIZED ──

    test("sets inviteStatus=DECLINED when status is FINALIZED", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeItems({ status: "FINALIZED" }) };
            return {};
        });

        const result = await leaveEvent(USER_ID, EVENT_ID, docClient);
        expect(result.action).toBe("declined");
    });

    // ── Error cases ──

    test("throws 404 when event does not exist", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: [] }));
        await expect(leaveEvent(USER_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    test("throws 403 when user is not a member", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeItems().filter(i => i.SK !== `USER#${USER_ID}`) };
        });
        await expect(leaveEvent(USER_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 403, message: "You are not a member of this event." });
    });

    test("throws 403 when the creator tries to leave", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return {
                    Items: makeItems({ myRole: "CREATOR" }).map(i =>
                        i.SK === `USER#${USER_ID}` ? { ...i, role: "CREATOR" } : i
                    )
                };
        });
        await expect(leaveEvent(USER_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 403, message: "The event creator cannot leave the event." });
    });

    test("throws 409 when event status is invalid for leaving", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: makeItems({ status: "UNKNOWN_STATUS" }) };
        });
        await expect(leaveEvent(USER_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 409 });
    });


    test("throws 404 when METADATA item is missing", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.constructor.name === "QueryCommand")
                return { Items: [{ SK: `USER#${USER_ID}` }] }; // no METADATA
        });
        await expect(leaveEvent(USER_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 404, message: "Event metadata not found." });
    });
});

// ─── getNotifications ─────────────────────────────────────────────────────────

describe("createNotification", () => {
    beforeEach(() => jest.clearAllMocks());

    test("writes a Notification item with correct shape to DynamoDB", async () => {
        const docClient = makeMockDocClient(async () => ({}));

        await createNotification(docClient, {
            recipientUserId: "user-a",
            notifType: "FRIEND_REQUEST",
            notificationId: "FRIEND_REQUEST#user-b",
            message: "user-b sent you a friend request.",
            payload: { senderId: "user-b" },
        });

        const putCmd = docClient.send.mock.calls[0][0];
        const item = putCmd.input.Item;

        expect(item.PK).toBe("USER#user-a");
        expect(item.SK).toBe("NOTIF#FRIEND_REQUEST#user-b");
        expect(item.notifType).toBe("FRIEND_REQUEST");
        expect(item.isRead).toBe(false);
        expect(item.isDeleted).toBe(false);
        expect(item.createdAt).toBeTruthy();
    });
});

describe("getNotifications (handler)", () => {
    beforeEach(() => jest.clearAllMocks());

    test("returns notifications sorted newest-first, excluding deleted items", async () => {
        const docClient = makeMockDocClient(async () => ({
            Items: [
                {
                    notificationId: "n1", notifType: "FRIEND_REQUEST", message: "msg1",
                    isRead: false, isDeleted: false, payload: {}, createdAt: "2026-01-02T00:00:00.000Z"
                },
                {
                    notificationId: "n2", notifType: "ALL_SUBMITTED", message: "msg2",
                    isRead: true, isDeleted: true, payload: {}, createdAt: "2026-01-03T00:00:00.000Z"
                },
                {
                    notificationId: "n3", notifType: "ALL_SUBMITTED", message: "msg3",
                    isRead: false, isDeleted: false, payload: {}, createdAt: "2026-01-01T00:00:00.000Z"
                },
            ],
        }));

        const result = await getNotifications("user-a", docClient);

        expect(result).toHaveLength(2); // n2 excluded (isDeleted)
        expect(result[0].notificationId).toBe("n1"); // newest first
        expect(result[1].notificationId).toBe("n3");
    });

    test("returns empty array when there are no notifications", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: [] }));
        const result = await getNotifications("user-a", docClient);
        expect(result).toEqual([]);
    });

    test("defaults isRead to false and payload to {} when absent", async () => {
        const docClient = makeMockDocClient(async () => ({
            Items: [{
                notificationId: "n1", notifType: "FRIEND_REQUEST",
                message: "msg", isDeleted: false, createdAt: "2026-01-01T00:00:00.000Z"
            }],
        }));

        const result = await getNotifications("user-a", docClient);
        expect(result[0].isRead).toBe(false);
        expect(result[0].payload).toEqual({});
        expect(result[0].readAt).toBeNull();
    });
});

describe("markNotificationsRead", () => {
    beforeEach(() => jest.clearAllMocks());

    test("marks all provided notification IDs as read and returns markedCount", async () => {
        const docClient = makeMockDocClient(async () => ({}));

        const result = await markNotificationsRead("user-a", ["n1", "n2"], docClient);

        expect(result).toEqual({ success: true, markedCount: 2 });
        expect(docClient.send).toHaveBeenCalledTimes(2);
    });

    test("skips ConditionalCheckFailedException (notification not found) without failing", async () => {
        const docClient = makeMockDocClient(async (cmd) => {
            if (cmd.input.Key?.SK === "NOTIF#n-missing") throw makeConditionalCheckError();
            return {};
        });

        const result = await markNotificationsRead("user-a", ["n1", "n-missing"], docClient);
        expect(result.markedCount).toBe(1);
    });

    test("throws 400 when notificationIds is empty", async () => {
        await expect(markNotificationsRead("user-a", [], makeMockDocClient(() => { })))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    test("throws 400 when notificationIds is not an array", async () => {
        await expect(markNotificationsRead("user-a", "n1", makeMockDocClient(() => { })))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    test("propagates unexpected DynamoDB errors", async () => {
        const docClient = makeMockDocClient(async () => { throw new Error("DynamoDB error"); });
        await expect(markNotificationsRead("user-a", ["n1"], docClient))
            .rejects.toThrow("DynamoDB error");
    });
});

describe("deleteNotification", () => {
    beforeEach(() => jest.clearAllMocks());

    test("soft-deletes a notification and returns success", async () => {
        const docClient = makeMockDocClient(async () => ({}));

        const result = await deleteNotification("user-a", "FRIEND_REQUEST#user-b", docClient);

        expect(result).toEqual({ success: true });
        const updateCmd = docClient.send.mock.calls[0][0];
        expect(updateCmd.input.ExpressionAttributeValues[":true"]).toBe(true);
    });

    test("throws 400 when notificationId is missing", async () => {
        await expect(deleteNotification("user-a", "", makeMockDocClient(() => { })))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    test("throws 404 when notification does not exist (ConditionalCheckFailed)", async () => {
        const docClient = makeMockDocClient(async () => { throw makeConditionalCheckError(); });
        await expect(deleteNotification("user-a", "n1", docClient))
            .rejects.toMatchObject({ statusCode: 404, message: "Notification not found." });
    });

    test("propagates unexpected DynamoDB errors", async () => {
        const docClient = makeMockDocClient(async () => { throw new Error("Unexpected"); });
        await expect(deleteNotification("user-a", "n1", docClient))
            .rejects.toThrow("Unexpected");
    });
});

// ─── getTimeRecommendations ───────────────────────────────────────────────────

describe("getTimeRecommendations", () => {
    beforeEach(() => jest.clearAllMocks());

    function makeItems({ status = "SCHEDULING", creatorId = CREATOR_ID, members = [] } = {}) {
        return [
            { PK: `EVENT#${EVENT_ID}`, SK: "METADATA", status, creatorId, title: "Team Lunch" },
            ...members,
        ];
    }

    test("returns top 5 slots where >= 50% of members are available, sorted by count desc", async () => {
        const members = [
            { SK: `USER#user-a`, memberStatus: undefined, availableTimeSlots: ["2026-06-01-09", "2026-06-01-14", "2026-06-01-10"] },
            { SK: `USER#user-b`, memberStatus: undefined, availableTimeSlots: ["2026-06-01-09", "2026-06-01-14"] },
            { SK: `USER#user-c`, memberStatus: undefined, availableTimeSlots: ["2026-06-01-09"] },
        ];
        const docClient = makeMockDocClient(async () => ({
            Items: makeItems({ members }),
        }));

        const result = await getTimeRecommendations(CREATOR_ID, EVENT_ID, docClient);

        expect(result.eventId).toBe(EVENT_ID);
        expect(result.totalMembers).toBe(3);
        // "2026-06-01-09" has count=3 (100%), "2026-06-01-14" has count=2 (66.7%)
        expect(result.recommendations[0].slot).toBe("2026-06-01-09");
        expect(result.recommendations[0].count).toBe(3);
        expect(result.recommendations[0].percentage).toBe(100);
        expect(result.recommendations.length).toBeLessThanOrEqual(5);
    });

    test("excludes slots below 50% threshold", async () => {
        const members = [
            { SK: `USER#user-a`, memberStatus: undefined, availableTimeSlots: ["slot-1"] },
            { SK: `USER#user-b`, memberStatus: undefined, availableTimeSlots: [] },
            { SK: `USER#user-c`, memberStatus: undefined, availableTimeSlots: [] },
        ];
        // slot-1: count=1, threshold=1.5 (3*0.5) → excluded
        const docClient = makeMockDocClient(async () => ({ Items: makeItems({ members }) }));

        const result = await getTimeRecommendations(CREATOR_ID, EVENT_ID, docClient);
        expect(result.recommendations).toHaveLength(0);
    });

    test("returns empty recommendations when no members have submitted slots", async () => {
        const members = [
            { SK: `USER#user-a`, memberStatus: undefined, availableTimeSlots: [] },
        ];
        const docClient = makeMockDocClient(async () => ({ Items: makeItems({ members }) }));

        const result = await getTimeRecommendations(CREATOR_ID, EVENT_ID, docClient);
        expect(result.recommendations).toEqual([]);
    });

    test("returns empty recommendations when there are no active members", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: makeItems() }));

        const result = await getTimeRecommendations(CREATOR_ID, EVENT_ID, docClient);
        expect(result).toEqual({ eventId: EVENT_ID, totalMembers: 0, recommendations: [] });
    });

    test("excludes LEFT members from totalMembers and slot aggregation", async () => {
        const members = [
            { SK: `USER#user-a`, memberStatus: undefined, availableTimeSlots: ["slot-1"] },
            { SK: `USER#user-b`, memberStatus: "LEFT", availableTimeSlots: ["slot-1"] },
        ];
        const docClient = makeMockDocClient(async () => ({ Items: makeItems({ members }) }));

        const result = await getTimeRecommendations(CREATOR_ID, EVENT_ID, docClient);
        expect(result.totalMembers).toBe(1);
        // slot-1: count=1, threshold=0.5 → included
        expect(result.recommendations[0].slot).toBe("slot-1");
        expect(result.recommendations[0].percentage).toBe(100);
    });

    test("throws 404 when event does not exist", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: [] }));
        await expect(getTimeRecommendations(CREATOR_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    test("throws 403 when caller is not the creator", async () => {
        const docClient = makeMockDocClient(async () => ({ Items: makeItems() }));
        await expect(getTimeRecommendations("non-creator", EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 403, message: "Only the event creator can view time recommendations." });
    });

    test("throws 409 when event is not in SCHEDULING status", async () => {
        const docClient = makeMockDocClient(async () => ({
            Items: makeItems({ status: "COLLECTING_AVAILABILITY" }),
        }));
        await expect(getTimeRecommendations(CREATOR_ID, EVENT_ID, docClient))
            .rejects.toMatchObject({ statusCode: 409 });
    });
});