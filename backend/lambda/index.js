import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const USERS_TABLE = "Users";
const EVENTS_TABLE = "Events";

export const handler = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims.sub;
  const route = event.rawPath;

  if (route === "/events" && event.requestContext.http.method === "GET") {
    const result = await ddb.send(new QueryCommand({
      TableName: EVENTS_TABLE,
      KeyConditionExpression: "ownerId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId
      }
    }));

    return response(result.Items);
  }

  if (route === "/friends" && event.requestContext.http.method === "GET") {
    const result = await ddb.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId }
    }));

    return response(result.Item?.friends || []);
  }

  if (route === "/createEvent" && event.requestContext.http.method === "POST") {
    const body = JSON.parse(event.body);

    await ddb.send(new PutCommand({
      TableName: EVENTS_TABLE,
      Item: {
        ownerId: userId,
        eventId: uuidv4(),
        participants: body.participants,
        createdAt: new Date().toISOString()
      }
    }));

    return response({ message: "Event created!" });
  }

  return response({ message: "Not Found" }, 404);
};

const response = (body, statusCode = 200) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});