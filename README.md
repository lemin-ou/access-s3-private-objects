# API Gateway Lambda Authorizer for Basic HTTP Authentication

This pattern deploys an API Gateway REST API protected by a Lambda Authorizer supporting [Basic HTTP Authentication](https://en.wikipedia.org/wiki/Basic_access_authentication). This API handle getting a temporary access to S3 objects in different buckets.

Important: this application uses various AWS services and there are costs associated with these services after the Free Tier usage - please see the [AWS Pricing page](https://aws.amazon.com/pricing/) for details. You are responsible for any AWS costs incurred. No warranty is implied in this example.

## Requirements

- [Create an AWS account](https://portal.aws.amazon.com/gp/aws/developer/registration/index.html) if you do not already have one and log in. The IAM user that you use must have sufficient permissions to make necessary AWS service calls and manage AWS resources.
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) installed and configured
- [Git Installed](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [Node and NPM](https://nodejs.org/en/download/) installed
- [AWS Cloud Development Kit](https://docs.aws.amazon.com/cdk/latest/guide/cli.html) (AWS CDK) installed

## Deployment Instructions

1. Set the following necessary environment variables values (create .env file in the root of the project):

    `PREFIX`: prefix before all resources names created in AWS (current value: smartmssa-s3-object-access)

    `RECORD_NAME`: the API DNS record

    `DOMAIN_NAME`: the API DNS domain

    `ACM_CERTIFICATE_ARN`: the API ACM certificate ARN

    `ENVIRONMENT`: the environment (cuurent value: dev)

    `CACHE_TTL`: Lambda authorizer default authorization cache

    `BUCKETS`: buckets names where the Lambda function will have access to (this should be modified if developers need access to a new bucket), example: `BUCKETS=bucketone, buckettwo, bucketthree`

    `HOSTED_ZONE_ID`: Hosted Zone ID of the DOMAINE_NAME (specified in the variable above)

    `MAX_PROCESSED_OBJECTS`: Maximum number of objects that the Lambda can process at a time (current value: 10)

    `AWS_S3_DEFAULT_REGION`: AWS region where all buckets reside (contact Operation Team to get current value)

    `USERNAME`: username of the user who has authorization to call this API (contact Operation Team to get current value)

    `PASSWORD`: password of the user who has authorization to call this API (contact Operation Team to get current value)


2. Change the working directory to this pattern's directory

   ```bash
   cd access-s3-private-objects
   ```

3. Install dependencies

   ```bash
   npm install
   ```

4. Deploy the stack to your default AWS account and region. The output of this command should give you the HTTP API URL.
   ```bash
   cdk deploy
   ```

## How it works

Using a Lambda Authorizer the credentials provided in the Authorization header are decoded using Base64 and verified in a database (for now its only contains one user, where the password will be rotated continously)

## Testing

Run the following commands using the API endpoint.

1. Using sam

   ```bash
   curl -u username:password '<protected api endpoint>'
   ```

2. Negative testing - Check the output for a not authorized error message.
   ```bash
   curl -u username:wrongPassword '<protected api endpoint>'
   ```

## Cleanup

Run the given command to delete the resources that were created. It might take some time for the CloudFormation stack to get deleted.

```bash
cdk destroy
```

---

Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
