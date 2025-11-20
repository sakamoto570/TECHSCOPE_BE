#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { TechscopeBeStack } from '../lib/techscope-be-stack'

const app = new cdk.App()
new TechscopeBeStack(app, 'TechscopeBeStack', {
  env: { region: 'ap-northeast-1' }, // 東京リージョン
})
