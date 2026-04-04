import { DynamoDBClient, ScanCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE || "midmeet-dev-main";

const client = new DynamoDBClient({});

async function clearTable() {
  console.log(`Scanning ${TABLE_NAME}...`);

  const keys: { PK: { S: string }; SK: { S: string } }[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const response = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: "PK, SK",
      ExclusiveStartKey: lastKey,
    }));
    for (const item of response.Items || []) {
      keys.push({ PK: item.PK as { S: string }, SK: item.SK as { S: string } });
    }
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  if (keys.length === 0) {
    console.log("Table is already empty.");
    return;
  }

  // BatchWriteItem accepts up to 25 delete requests at a time
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await client.send(new BatchWriteItemCommand({
      RequestItems: {
        [TABLE_NAME]: chunk.map((key) => ({ DeleteRequest: { Key: key } })),
      },
    }));
  }

  console.log(`Deleted ${keys.length} items. Table is now empty.`);
}

clearTable().catch((err) => { console.error(err); process.exit(1); });
