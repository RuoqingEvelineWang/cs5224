import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as fs from 'fs';
import * as path from 'path';

const TABLE_NAME = process.env.MAIN_TABLE || 'midmeet-dev-main';
const AWS_REGION = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'ap-southeast-1';
// Set DEMO_USER_ID env var to replace the placeholder in test-data.json with your Cognito user ID.
// Example: DEMO_USER_ID=abc-123 MAIN_TABLE=midmeet-dev-main npm run seed
const DEMO_USER_ID = process.env.DEMO_USER_ID || '';

const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function seedData() {
  console.log(`Seeding data into ${TABLE_NAME} in ${AWS_REGION}...`);

  const dataPath = path.join(__dirname, 'test-data.json');
  let rawJson = fs.readFileSync(dataPath, 'utf-8');

  if (DEMO_USER_ID) {
    console.log(`Replacing DEMO_USER_ID with: ${DEMO_USER_ID}`);
    rawJson = rawJson.split('DEMO_USER_ID').join(DEMO_USER_ID);
  } else {
    console.warn('WARNING: DEMO_USER_ID env var not set. Items with DEMO_USER_ID will be seeded as-is (likely broken).');
  }

  const items = JSON.parse(rawJson);

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
