import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';


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


    // Cognito
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true }
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool
    });

    // Lambda
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda'),
      environment: {
        MAIN_TABLE: mainTable.tableName,
        MAIN_TABLE_GSI1: 'GSI1',
        MAIN_TABLE_GSI2: 'GSI2',
      }
    });

    mainTable.grantReadWriteData(apiLambda);

    // API Gateway
    const api = new apigateway.RestApi(this, 'EventsApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(apiLambda);

    api.root.addResource('events').addMethod('GET', lambdaIntegration, {
      authorizer: new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
        cognitoUserPools: [userPool]
      })
    });

    // Output the Table Name for reference
    new cdk.CfnOutput(this, 'MainTableName', {
      value: mainTable.tableName,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url
    });
  }
}