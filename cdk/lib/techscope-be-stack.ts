import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha'
import * as integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as path from 'path'

export class TechscopeBeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // DynamoDB テーブル
    const techscopeTable = new dynamodb.Table(this, 'TechscopeTable', {
      tableName: 'TechscopeTable',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Lambda
    const backendLambda = new lambdaNodejs.NodejsFunction(this, 'BackendLambda', {
      entry: path.join(__dirname, '../../src/lambda/lambda.ts'),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      environment: {
        TABLE_NAME: techscopeTable.tableName,
      },
    })

    techscopeTable.grantReadWriteData(backendLambda)

    // RSS取得Lambda
    const fetchRssLambda = new lambdaNodejs.NodejsFunction(this, 'FetchRssLambda', {
      entry: path.join(__dirname, '../../src/lambda/fetchRss.ts'),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      environment: {
        TABLE_NAME: techscopeTable.tableName,
      },
    })

    techscopeTable.grantReadWriteData(fetchRssLambda)

    // 毎日 9:00 に実行する EventBridge Rule
    const rule = new events.Rule(this, 'DailyNewsFetcherRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '9',
        // 日次: 他のフィールドは * で OK
      }),
    })

    // Lambda をターゲットとして紐づける
    rule.addTarget(new targets.LambdaFunction(fetchRssLambda))

    // API Gateway (HTTP API)
    const api = new apigatewayv2.HttpApi(this, 'BackendApi', {
      apiName: 'techscope-backend-api',
      corsPreflight: {
        allowHeaders: ['Content-Type'],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowOrigins: ['*'],
      },
    })

    // ルート統合
    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      backendLambda
    )

    api.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: lambdaIntegration,
    })

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url ?? 'no-url' })
  }
}
