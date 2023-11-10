#!/usr/bin/env node

const cdk = require("aws-cdk-lib");
const { AccessS3ObjectsStack } = require("../lib/stack");

const app = new cdk.App();

new AccessS3ObjectsStack(app, "AccessS3ObjectsStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
