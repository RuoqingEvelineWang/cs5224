import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as fs from 'fs';
import * as path from 'path';

const TABLE_NAME = process.env.MAIN_TABLE || 'midmeet-dev-main';

const client = new DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(client);

async function seedData() {
  console.log(`Seeding data into ${TABLE_NAME}...`);
  
  const dataPath = path.join(__dirname, 'test-data.json');
  const items = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);

    const requestArgs = {
      RequestItems: {
        [TABLE_NAME]: chunk.map((item: Record<string, any>) => ({
          PutRequest: {
            Item: item
          }
        }))
      }
    };

    try {
      await docClient.send(new BatchWriteCommand(requestArgs));
      console.log(`Successfully inserted items ${i + 1} to ${i + chunk.length}`);
    } catch (error) {
      console.error("Error inserting batch:", error);
    }
  }
  
  console.log("Seeding complete!");
}

seedData();