const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const NOT_FOUND = 404;
const FORBIDDEN = 403;
const SERVER_ERROR = 500;
const BAD_REQUEST = 400;
const MAX_PROCESSED_OBJECTS = process.env.MAX_PROCESSED_OBJECTS;
const clientParams = { region: process.env.AWS_S3_DEFAULT_REGION };
const s3 = new S3Client(clientParams);

exports.handler = async (event, context, callback) => {
  /* get an s3 pre-signed url from the event request path using s3 client
    * the s3 bucket name is from the first path in the request path
     the code check the existance of the object before making the request to s3 and return Not found if object isn't found */
  //  verify if the request methods are GET or POST and call specific functions in either way, otherwise return a bad request response
  switch (event.httpMethod) {
    case "GET":
      return await performGetOperation(event);
      break;
    case "POST":
      return await performPostOperation(event);
    default:
      return {
        statusCode: BAD_REQUEST,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "Bad Request, we only accept GET or POST request",
        }),
      };
  }

  async function performGetOperation(event) {
    let res = checkRequired(event.pathParameters, ["bucketName", "objectKey"]);
    if (!res.exist) return sendErrorResponse(res.statusCode, res.reason);
    let { bucketName, objectKey } = res;
    objectKey = transform(objectKey);
    const params = {
      Bucket: bucketName,
      Key: objectKey,
      expiresIn: process.env.CACHE_TTL * 60,
    };
    res = await verifyObjectExistance(s3, params);

    if (!res.exist) return sendErrorResponse(res.statusCode, res.reason);

    preSignedUrl = await getTemporaryAccess(s3, params);

    sendResponse(callback, preSignedUrl);
  }
  async function performPostOperation(event) {
    let res = checkRequired(event.pathParameters, ["bucketName"]);
    if (!res.exist) return sendErrorResponse(res.statusCode, res.reason);
    const { bucketName } = res;

    res = checkRequired(JSON.parse(event.body), ["objects"]);
    if (!res.exist) return sendErrorResponse(res.statusCode, res.reason);
    const { objects } = res;
    if (Array.isArray(objects) && objects.length > MAX_PROCESSED_OBJECTS)
      return sendErrorResponse(
        BAD_REQUEST,
        `Sorry, but we can only process ${MAX_PROCESSED_OBJECTS} objects at a time`
      );

    const processed = {};

    for (var object of objects) {
      res = await verifyObjectExistance(s3, {
        Bucket: bucketName,
        Key: object,
      });
      if (!res.exist) {
        // if we found an object with forbidden or server error status code, it means we don't have access to the bucket or an error occur
        // and an immediate response should be send to the clientƒ
        if ([SERVER_ERROR, FORBIDDEN].includes(res.statusCode))
          return sendErrorResponse(res.statusCode, res.reason);
        processed[object] = res.reason;
      } else {
        res = await getTemporaryAccess(s3, {
          Bucket: bucketName,
          Key: object,
          expiresIn: process.env.CACHE_TTL * 60,
        });
        if (res.error) return sendErrorResponse(res.statusCode, res.reason);
        processed[object] = res;
      }
    }

    sendResponse(callback, processed);
  }
};

function sendErrorResponse(statusCode, message) {
  return {
    statusCode: statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message }),
  };
}
function sendResponse(callback, data) {
  callback(null, {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data,
    }),
  });
}

function checkRequired(holder, required) {
  const values = {};
  // check if @required attributes exist
  for (var req of required) {
    console.debug("begin: cheking required attributes: ", required);
    console.debug("begin: cheking required attribute: ", req);
    if (!holder) return { exist: false, ...mapRequiredMessage(req) };
    if (!holder[req]) return { exist: false, ...mapRequiredMessage(req) };
    values[req] = holder[req];
  }
  console.debug("end: cheking required with success.");
  return { exist: true, ...values };
}
async function verifyObjectExistance(client, params) {
  console.debug("begin: executing verifyObjectExistance ....", params);
  const command = new HeadObjectCommand(params);
  try {
    response = await client.send(command);
    console.debug("end: executing verifyObjectExistance, response:", response);
    return { exist: true };
  } catch (error) {
    console.error("end: executing verifyObjectExistance with errors:", error);
    return { exist: false, ...mapErrorMessage(error.name) };
  }
}

async function getTemporaryAccess(client, params) {
  console.debug("begin: executing getTemporaryAccess ....");
  // get the presigned url from s3 client
  try {
    const command = new GetObjectCommand(params);
    const response = await getSignedUrl(client, command, params);
    console.debug("end: executing getTemporaryAccess, response: ", response);
    return response;
  } catch (error) {
    console.debug("end: executing getTemporaryAccess, with errors : ", error);
    return { error: true, ...mapErrorMessage("error.name") };
  }
}

function mapErrorMessage(errorName) {
  switch (errorName) {
    case "NotFound":
      return {
        statusCode: 404,
        reason:
          "Unfortunately, we couldn't find your object. please verify the key",
      };
    case "403":
      return {
        statusCode: 403,
        reason:
          "Hey, We don't have access to this bucket/object, ask your favorite Operation Team to give us access",
      };
    case "301":
      return {
        statusCode: 301,
        reason:
          "Hey, The bucket you're looking for was moved to another region. please contact your favorite Operation Team",
      };
    case "400":
      return {
        statusCode: 400,
        reason:
          "Hey, The bucket you're looking for doesn't exist. please contact your favorite Operation Team",
      };
    default:
      return {
        statusCode: 500,
        reason: "Unknown Error, contact your favorite Operation Team",
      };
  }
}
function mapRequiredMessage(required) {
  switch (required) {
    case "bucketName":
      return {
        statusCode: 400,
        reason: "Hey Buddy, we need the bucket name",
      };
    case "objectKey":
      return {
        statusCode: 400,
        reason: "Hey Buddy, we need the object key",
      };
    case "objects":
      return {
        statusCode: 400,
        reason:
          "Hey Buddy, we need some objects to process. we couldn't find them in the body of your request",
      };
    default:
      return {
        statusCode: 500,
        reason: "We don't have clue, contact your favorite Operation Team",
      };
  }
}

function transform(value) {
  if (value) {
    return value.replace("%20", " ").replace("+", " "); // transform object or bucket with spaces in their names
  }
  return "";
}
