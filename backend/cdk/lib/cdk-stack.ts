import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 🔹 DynamoDB Tables
    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      partitionKey: { name: 'ownerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // 🔹 Cognito
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool
    });

    // 🔹 Lambda
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda'),
      environment: {
        EVENTS_TABLE: eventsTable.tableName,
        USERS_TABLE: usersTable.tableName,
      }
    });

    eventsTable.grantReadWriteData(apiLambda);
    usersTable.grantReadWriteData(apiLambda);

    // 🔹 API Gateway
    const api = new apigateway.RestApi(this, 'EventsApi');

    const lambdaIntegration = new apigateway.LambdaIntegration(apiLambda);

    api.root.addResource('events').addMethod('GET', lambdaIntegration, {
      authorizer: new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
        cognitoUserPools: [userPool]
      })
    });

    // 🔹 Outputs
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