import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';


export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Prefer `cdk -c stage=...`, while still allowing env-based overrides in CI.
    const stageContext = this.node.tryGetContext('stage');
    const stage =
      (typeof stageContext === 'string' && stageContext.trim()) ||
      process.env.STAGE ||
      'dev';
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
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
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
      code: lambda.Code.fromAsset('../lambda', {
        exclude: ['node_modules'],
      }),
      environment: {
        MAIN_TABLE: mainTable.tableName,
        MAIN_TABLE_GSI1: 'GSI1',
        MAIN_TABLE_GSI2: 'GSI2',
        ONEMAP_EMAIL: process.env.ONEMAP_EMAIL || '',
        ONEMAP_PASSWORD: process.env.ONEMAP_PASSWORD || '',
      }
    });

    mainTable.grantReadWriteData(apiLambda);

    // API Gateway setup
    const api = new apigateway.RestApi(this, 'EventsApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });
    const lambdaIntegration = new apigateway.LambdaIntegration(apiLambda);
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool]
    });
    const protectedMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // GET /events
    const eventsResource = api.root.addResource('events');
    eventsResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);

    // GET /events/{id}
    const singleEventResource = eventsResource.addResource('{id}');
    singleEventResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);

    // POST /events
    eventsResource.addMethod('POST', lambdaIntegration, protectedMethodOptions);

    // POST /events/{id}/availability
    const availabilityResource = singleEventResource.addResource('availability');
    availabilityResource.addMethod('POST', lambdaIntegration, protectedMethodOptions);

    // GET /events/{id}/time-recommendations
    const timeRecommendationsResource = singleEventResource.addResource('time-recommendations');
    timeRecommendationsResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);

    // POST /events/{id}/leave
    const leaveResource = singleEventResource.addResource('leave');
    leaveResource.addMethod('POST', lambdaIntegration, protectedMethodOptions);

    // Geocode route
    const geocodeResource = api.root.addResource('geocode');
    const geocodeByPostalResource = geocodeResource.addResource('{postalCode}');
    geocodeByPostalResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);

    // Users routes
    const usersResource = api.root.addResource('users');
    const usersMeResource = usersResource.addResource('me');
    usersMeResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);
    usersMeResource.addMethod('PUT', lambdaIntegration, protectedMethodOptions);

    // Friends routes
    const friendsResource = api.root.addResource('friends');
    friendsResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);

    const friendRequestResource = friendsResource.addResource('request');
    friendRequestResource.addMethod('POST', lambdaIntegration, protectedMethodOptions);

    const friendAcceptResource = friendsResource.addResource('accept');
    friendAcceptResource.addMethod('PUT', lambdaIntegration, protectedMethodOptions);

    const friendDeclineResource = friendsResource.addResource('decline');
    friendDeclineResource.addMethod('PUT', lambdaIntegration, protectedMethodOptions);

    const friendByUserResource = friendsResource.addResource('{userId}');
    friendByUserResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);

    const friendSuggestionsResource = friendsResource.addResource('suggestions').addResource('{userId}');
    friendSuggestionsResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);

    // Notifications routes
    const notificationsResource = api.root.addResource('notifications');
    notificationsResource.addMethod('GET', lambdaIntegration, protectedMethodOptions);
    const notificationsReadResource = notificationsResource.addResource('read');
    notificationsReadResource.addMethod('PUT', lambdaIntegration, protectedMethodOptions);
    const singleNotificationResource = notificationsResource.addResource('{notificationId}');
    singleNotificationResource.addMethod('PUT', lambdaIntegration, protectedMethodOptions);

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
