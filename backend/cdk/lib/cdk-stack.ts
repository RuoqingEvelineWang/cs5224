import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Define the Stage (default to 'dev' if not provided)
    const stage = process.env.STAGE || 'dev';
    const prefix = `midmeet-${stage}`;

    // 2. Define the Single Main Table
    const mainTable = new dynamodb.Table(this, 'MidMeetMainTable', {
      tableName: `${prefix}-main`,
      partitionKey: { 
        name: 'PK', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'SK', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      // Change to RETAIN for production environments
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
    });

    // 3. GSI1: User-Centric Event Lookup 
    // Supports: "Get all events for User X"
    mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { 
        name: 'GSI1PK', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI1SK', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 4. GSI2: Email Lookup
    // Supports: "Find User by Email"
    mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { 
        name: 'GSI2PK', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI2SK', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output the Table Name for reference
    new cdk.CfnOutput(this, 'MainTableName', {
      value: mainTable.tableName,
    });
  }
}