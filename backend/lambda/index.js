import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getEvents } from "./handlers/getEvents.js";
import { getEventById } from "./handlers/getEventById.js";
import { getFriends } from "./handlers/getFriends.js";
import { createEvent } from "./handlers/createEvent.js";
import { getMyProfile, upsertMyProfile, geocodePostalCode } from "./handlers/userHandlers.js";
import { submitAvailability } from "./handlers/submitAvailability.js";
import { getTimeRecommendations } from "./handlers/getTimeRecommendations.js";
import { leaveEvent } from "./handlers/leaveEvent.js";
import { finalizeEvent } from "./handlers/finalizeEvent.js";
import { confirmAttendance } from "./handlers/confirmAttendance.js";
import { declineAttendance } from "./handlers/declineAttendance.js";
import { unfinalizeEvent } from "./handlers/unfinalizeEvent.js";
import { getVenues } from "./handlers/getVenues.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  listFriendsByUserId,
  listFriendSuggestions,
} from "./handlers/friendHandlers.js";
import { getNotifications, markNotificationsRead, deleteNotification } from "./handlers/getNotifications.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const handler = async (event) => {
  const method = getHttpMethod(event);
  const resource = event?.resource || "";
  const path = event?.path || event?.rawPath || "";

  if (method === "OPTIONS") {
    return respond(200, { message: "OK" });
  }

  const userId = getAuthUserId(event);
  if (!userId) {
    return respond(401, { message: "Unauthorized" });
  }

  try {
    if (isRoute(method, resource, path, "GET", "/users/me")) {
      const data = await getMyProfile(userId, docClient);
      return respond(200, data);
    }

    if (isRoute(method, resource, path, "PUT", "/users/me")) {
      const body = parseJsonBody(event);
      const claims = getAuthClaims(event);
      const data = await upsertMyProfile(userId, body, claims, docClient);
      return respond(200, data);
    }

    if (method === "GET" && (resource === "/geocode/{postalCode}" || /^\/geocode\/[^/]+$/.test(path))) {
      const postalCode = event?.pathParameters?.postalCode || path.split("/").pop();
      if (!postalCode || !/^\d{6}$/.test(postalCode)) {
        throw new HttpError(400, "Please provide a valid 6-digit postal code.");
      }
      const data = await geocodePostalCode(postalCode);
      return respond(200, data);
    }

    if (isRoute(method, resource, path, "GET", "/events")) {
      const data = await getEvents(userId, docClient);
      return respond(200, { data, error: null });
    }

    if (isRoute(method, resource, path, "GET", "/events/{id}")) {
      const eventId = event?.pathParameters?.id;
      if (!eventId) {
        throw new HttpError(400, "Missing event id.");
      }

      const data = await getEventById(userId, eventId, docClient);
      if (!data) {
        return respond(404, { data: null, error: "Event not found or access denied" });
      }

      return respond(200, { data, error: null });
    }

    if (isRoute(method, resource, path, "POST", "/events")) {
      const body = parseJsonBody(event);
      const data = await createEvent(userId, body, docClient);
      return respond(201, { data, error: null });
    }

    if (method === "POST" && (resource === "/events/{id}/availability" || /^\/events\/[^/]+\/availability$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const body = parseJsonBody(event);
      const data = await submitAvailability(userId, eventId, body, docClient);
      return respond(200, { data, error: null });
    }

    if (method === "GET" && (resource === "/events/{id}/time-recommendations" || /^\/events\/[^/]+\/time-recommendations$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const data = await getTimeRecommendations(userId, eventId, docClient);
      return respond(200, { data, error: null });
    }

    if (method === "POST" && (resource === "/events/{id}/leave" || /^\/events\/[^/]+\/leave$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const data = await leaveEvent(userId, eventId, docClient);
    if (method === "POST" && (resource === "/events/{id}/finalize" || /^\/events\/[^/]+\/finalize$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const body = parseJsonBody(event);
      const data = await finalizeEvent(userId, eventId, body, docClient);
      return respond(200, { data, error: null });
    }

    if (method === "POST" && (resource === "/events/{id}/confirm" || /^\/events\/[^/]+\/confirm$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const data = await confirmAttendance(userId, eventId, docClient);
      return respond(200, { data, error: null });
    }

    if (method === "POST" && (resource === "/events/{id}/decline" || /^\/events\/[^/]+\/decline$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const data = await declineAttendance(userId, eventId, docClient);
      return respond(200, { data, error: null });
    }

    if (method === "POST" && (resource === "/events/{id}/unfinalize" || /^\/events\/[^/]+\/unfinalize$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const data = await unfinalizeEvent(userId, eventId, docClient);
      return respond(200, { data, error: null });
    }

    if (method === "GET" && (resource === "/events/{id}/venues" || /^\/events\/[^/]+\/venues$/.test(path))) {
      const eventId = event?.pathParameters?.id || path.split("/")[2];
      if (!eventId) throw new HttpError(400, "Missing event id.");
      const data = await getVenues(userId, eventId, docClient);
      return respond(200, { data, error: null });
    }

    if (isRoute(method, resource, path, "GET", "/friends")) {
      const data = await getFriends(userId, docClient);
      return respond(200, { data, error: null });
    }

    if (isRoute(method, resource, path, "POST", "/friends/request")) {
      const body = parseJsonBody(event);
      const data = await sendFriendRequest(userId, body, docClient);
      return respond(200, data);
    }

    if (isRoute(method, resource, path, "PUT", "/friends/accept")) {
      const body = parseJsonBody(event);
      const data = await acceptFriendRequest(userId, body, docClient);
      return respond(200, data);
    }

    if (isRoute(method, resource, path, "PUT", "/friends/decline")) {
      const body = parseJsonBody(event);
      const data = await declineFriendRequest(userId, body, docClient);
      return respond(200, data);
    }

    if (isFriendSuggestionsRoute(method, resource, path)) {
      const requestedUserId = getPathUserId(event, 2);
      assertSelfAccess(requestedUserId, userId);

      const data = await listFriendSuggestions(requestedUserId, docClient);
      return respond(200, data);
    }

    if (isFriendListByUserRoute(method, resource, path)) {
      const requestedUserId = getPathUserId(event, 1);
      assertSelfAccess(requestedUserId, userId);

      const data = await listFriendsByUserId(requestedUserId, docClient);
      return respond(200, data);
    }

    if (isRoute(method, resource, path, "GET", "/notifications")) {
      const data = await getNotifications(userId, docClient);
      return respond(200, { data, error: null });
    }

    if (isRoute(method, resource, path, "PUT", "/notifications/read")) {
      const body = parseJsonBody(event);
      const data = await markNotificationsRead(userId, body.notificationIds, docClient);
      return respond(200, data);
    }

    if (method === "PUT" && (resource === "/notifications/{notificationId}" || /^\/notifications\/[^/]+$/.test(path))) {
      const notificationId = event?.pathParameters?.notificationId || path.split("/").pop();
      const data = await deleteNotification(userId, notificationId, docClient);
      return respond(200, data);
    }

    return respond(404, { message: "Route not found" });
  } catch (error) {
    if (error?.statusCode && error?.message) {
      return respond(error.statusCode, { message: error.message });
    }

    console.error("Internal Error:", error);
    return respond(500, {
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

function getHttpMethod(event) {
  return event?.httpMethod || event?.requestContext?.http?.method || "";
}

function getAuthUserId(event) {
  const claims = getAuthClaims(event);
  return claims?.sub || null;
}

function getAuthClaims(event) {
  return (
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims ||
    {}
  );
}

function isRoute(method, resource, path, expectedMethod, expectedResource) {
  if (method !== expectedMethod) return false;
  return resource === expectedResource || path === expectedResource;
}

function isFriendListByUserRoute(method, resource, path) {
  if (method !== "GET") return false;
  if (resource === "/friends/{userId}") return true;

  if (!/^\/friends\/[^/]+$/.test(path)) return false;
  const candidate = path.split("/")[2];
  return candidate !== "request" && candidate !== "accept" && candidate !== "suggestions";
}

function isFriendSuggestionsRoute(method, resource, path) {
  if (method !== "GET") return false;
  return resource === "/friends/suggestions/{userId}" || /^\/friends\/suggestions\/[^/]+$/.test(path);
}

function parseJsonBody(event) {
  if (!event?.body) return {};

  try {
    return JSON.parse(event.body);
  } catch (_error) {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function getPathUserId(event, index) {
  if (event?.pathParameters?.userId) {
    return event.pathParameters.userId;
  }

  const path = event?.path || event?.rawPath || "";
  const parts = path.split("/").filter(Boolean);
  return parts[index] || "";
}

function assertSelfAccess(requestedUserId, authUserId) {
  if (!requestedUserId) {
    throw new HttpError(400, "Missing userId in path.");
  }

  if (requestedUserId !== authUserId) {
    throw new HttpError(403, "You can only access your own friendship data.");
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(body),
  };
}
