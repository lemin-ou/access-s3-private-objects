const cdk = require("aws-cdk-lib");
const { Construct } = require("constructs");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const route53 = require("aws-cdk-lib/aws-route53");
const targets = require("aws-cdk-lib/aws-route53-targets");

class AccessS3ObjectsConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id);

    /*************************** Lambda ***************************************** */
    // Lambda authorizer implementation
    const lambdaAuthorizer = new lambda.Function(this, "lambdaAuthorizer", {
      code: lambda.Code.fromAsset("lambda/authorizer"),
      handler: "index.handler",
      functionName: `${process.env.PREFIX}-api-lambda-authorizer`,
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        USERNAME: process.env.USERNAME,
        PASSWORD: process.env.PASSWORD,
      },
    });

    // Hello world Lambda function access-s3-objects by the authorizer
    const accessS3ObjectsLambda = new lambda.Function(
      this,
      "accessS3ObjectsLambda",
      {
        code: lambda.Code.fromAsset("lambda/access-s3-objects"),
        handler: "index.handler",
        functionName: `${process.env.PREFIX}-lambda`,
        timeout: cdk.Duration.seconds(500), // increase function timeout to 5 seconds
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          CACHE_TTL: process.env.CACHE_TTL,
          MAX_PROCESSED_OBJECTS: process.env.MAX_PROCESSED_OBJECTS,
          AWS_S3_DEFAULT_REGION: process.env.AWS_S3_DEFAULT_REGION,
        },
      }
    );

    const accessS3Bucket = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:GetObject"],
      resources: process.env.BUCKETS.split(", ").map(
        (bucket) => `arn:aws:s3:::${bucket}/*`
      ),
    });
    const accessS3Objects = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:ListBucket"],
      resources: process.env.BUCKETS.split(", ").map(
        (bucket) => `arn:aws:s3:::${bucket}`
      ),
    });

    accessS3ObjectsLambda.addToRolePolicy(accessS3Bucket);
    accessS3ObjectsLambda.addToRolePolicy(accessS3Objects);

    /************************************************************************** */

    /*************************** API ***************************************** */

    // API Gateway Lambda Authorizer
    const basicAuthorizer = new apigateway.TokenAuthorizer(
      this,
      "basicAuthorizer",
      {
        name: "BasicAuthorizer",
        handler: lambdaAuthorizer,
        identitySources: [apigateway.IdentitySource.header("Authorization")],
        resultsCacheTtl: cdk.Duration.seconds(300),
      }
    );
    // The API Gateway REST API
    const api = new apigateway.RestApi(this, "accessS3ObjectsLambdaAPI", {
      cloudWatchRole: true,
      restApiName: `${process.env.PREFIX}-api`,
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      domainName: {
        domainName: `${process.env.RECORD_NAME}.${process.env.DOMAIN_NAME}`,
        certificate: {
          certificateArn: `${process.env.ACM_CERTIFICATE_ARN}`,
        },
      },
    });

    // Create log group to associate with the API
    const logGroup = new logs.LogGroup(
      this,
      `${process.env.PREFIX}-${process.env.ENVIRONMENT}-log-group`
    );
    const stage = new apigateway.Stage(this, "accessS3ObjectsAPIStage", {
      deployment: new apigateway.Deployment(
        this,
        "accessS3ObjectsAPIDeployment",

        { api }
      ),
      accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
      accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      // TODO: caching maybe enabled in the future
      // methodOptions: {
      //   "/{bucketName}/{objectKey+}/GET": {
      //     cachingEnabled: true,
      //     cacheTtl: cdk.Duration.seconds(process.env.CACHE_TTL * 60),
      //   },
      //   "/{bucketName}/POST": {
      //     cachingEnabled: true,
      //     cacheTtl: cdk.Duration.seconds(process.env.CACHE_TTL * 60),
      //   },
      // },
      stageName: process.env.ENVIRONMENT,
    });

    // add this stage to the domain
    // api.domainName.addApiMapping(stage, {
    //   basePath: "dev",
    // });

    // Define and configure API Domain
    // const domainName = new apigateway.DomainName(
    //   this,
    //   "accessS3ObjectsAPIDomain",
    //   {
    //     domainName: `${process.env.RECORD_NAME}.${process.env.DOMAIN_NAME}`,
    //     certificate: {
    //       certificateArn: `${process.env.ACM_CERTIFICATE_ARN}`,
    //     },
    //     endpointType: apigateway.EndpointType.REGIONAL, // default is REGIONAL
    //     securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
    //   }
    // ).addApiMapping(stage);

    const zone = route53.HostedZone.fromLookup(this, "accessS3ObjectsAPIZone", {
      domainName: process.env.DOMAIN_NAME,
    });

    // Define Alias record for the API using Route53
    new route53.ARecord(this, "accessS3ObjectsAPIDomainAliasRecord", {
      zone: zone,
      recordName: process.env.RECORD_NAME,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
    });

    const requestModel = // We define the JSON Schema for the transformed valid response
      api.addModel("RequestModel", {
        contentType: "application/json",
        modelName: "RequestModel",
        schema: {
          schema: apigateway.JsonSchemaVersion.DRAFT4,
          title: "objectsRequest",
          type: apigateway.JsonSchemaType.OBJECT,
          required: ["objects"],
          properties: {
            objects: { type: apigateway.JsonSchemaType.ARRAY },
          },
        },
      });
    const getResponseModel = // We define the JSON Schema for the get request
      api.addModel("getResponseModel", {
        contentType: "application/json",
        modelName: "getResponseModel",
        schema: {
          schema: apigateway.JsonSchemaVersion.DRAFT4,
          title: "urlRequestModel",
          type: apigateway.JsonSchemaType.OBJECT,
          required: ["data", "statusCode"],
          properties: {
            data: { type: apigateway.JsonSchemaType.STRING },
          },
        },
      });
    const postResponseModel = // We define the JSON Schema for the post response
      api.addModel("postResponseModel", {
        contentType: "application/json",
        modelName: "postResponseModel",
        schema: {
          schema: apigateway.JsonSchemaVersion.DRAFT4,
          title: "postResponseModel",
          type: apigateway.JsonSchemaType.OBJECT,
          required: ["data"],
          properties: {
            data: { type: apigateway.JsonSchemaType.OBJECT },
          },
        },
      });
    const errorResponseModel = // We define the JSON Schema for the error response
      api.addModel("errorResponseModel", {
        contentType: "application/json",
        modelName: "errorResponseModel",
        schema: {
          schema: apigateway.JsonSchemaVersion.DRAFT4,
          title: "errorResponseModel",
          type: apigateway.JsonSchemaType.OBJECT,
          required: ["message"],
          properties: {
            message: { type: apigateway.JsonSchemaType.STRING },
          },
        },
      });
    const errorResponses = ["400", "404", "500", "301"].map((code) => ({
      statusCode: code,
      responseModels: {
        "application/json": errorResponseModel,
      },
    }));
    const postMethodResponses = [
      {
        statusCode: "200",
        responseModels: {
          "application/json": postResponseModel,
        },
      },
      ...errorResponses,
    ];
    const methodResponses = [
      {
        statusCode: "200",
        responseModels: {
          "application/json": getResponseModel,
        },
      },
      ...errorResponses,
    ];

    // add the object path resource, which will allow user to get a temporary URL of the multiple objects
    // body should includes all requested objects.
    const rootResource = api.root.addResource("{bucketName}");

    rootResource.addCorsPreflight({
      allowOrigins: apigateway.Cors.ALL_ORIGINS, // TODO: should be ["https://smartdev.ai"]
      allowMethods: ["POST"],
      // allowHeaders: ["Access-Control-Allow-Origin", "Access-Control-Allow-Origin"]
    });
    rootResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(accessS3ObjectsLambda),
      {
        requestValidatorOptions: {
          requestValidatorName: "body-validator",
          validateRequestBody: true,
          validateRequestParameters: false,
        },
        methodResponses: postMethodResponses,
        authorizer: basicAuthorizer,
        requestModels: {
          "application/json": requestModel,
        },
      }
    );

    // add the object path resource, which will allow user to get a temporary URL of the object
    const getResource = rootResource.addResource("{objectKey+}");
    getResource.addCorsPreflight({
      allowOrigins: apigateway.Cors.ALL_ORIGINS, // TODO: should be ["https://smartdev.ai"]
      allowMethods: ["GET"],
    });
    getResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(accessS3ObjectsLambda),
      {
        methodResponses: methodResponses,
        authorizer: basicAuthorizer,
      }
    );

    // Tells the browser to use Basic auth
    const gatewayResponse = new apigateway.GatewayResponse(
      this,
      "GatewayResponse",
      {
        restApi: api,
        type: apigateway.ResponseType.UNAUTHORIZED,
        responseHeaders: {
          "method.response.header.WWW-Authenticate": "'Basic'",
        },
        statusCode: "401",
        templates: {
          "application/json": '{"message":$context.error.messageString}',
        },
      }
    );
  }
}

module.exports = { AccessS3ObjectsConstruct };
