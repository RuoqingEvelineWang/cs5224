import { QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;

export async function getFriends(userId, docClient) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":skPrefix": "FRIEND#"
    }
  }));

  const friends = res.Items || [];
  
  return friends.map(f => ({
    id: f.friendId,
    name: f.name,
    email: f.email,
    hobbies: f.hobbies || []
  }));
}