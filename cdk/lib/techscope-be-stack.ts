import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha'
import * as integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import * as path from 'path'

export class TechscopeBeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // DynamoDB テーブル
    const newsTable = new dynamodb.Table(this, 'NewsTable', {
      tableName: 'NewsTable',
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
        TABLE_NAME: newsTable.tableName,
      },
    })

    newsTable.grantReadWriteData(backendLambda)

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
