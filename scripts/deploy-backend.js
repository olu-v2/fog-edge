import dotenv from "dotenv";
import fs from "fs";
import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
  waitUntilFunctionUpdated,
  CreateEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  GetApisCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetStagesCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

dotenv.config({ override: true });

const REGION = process.env.AWS_REGION || "us-east-1";
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
const ROLE_ARN = process.env.LAMBDA_ROLE_ARN;
const PR_ID = process.env.LAMBDA_FUNCTION_NAME; // e.g. pr-42
const TABLE_NAME = process.env.DYNAMO_TABLE || "SensorReadings";
const QUEUE_NAME = "sensor-ingest-queue";

const lambdaClient = new LambdaClient({ region: REGION });
const apiClient = new ApiGatewayV2Client({ region: REGION });
const sqsClient = new SQSClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });

// ─── Infrastructure ──────────────────────────────────────────────────────────

async function ensureDynamoTable() {
  try {
    await dynamoClient.send(
      new DescribeTableCommand({ TableName: TABLE_NAME }),
    );
    console.log(`DynamoDB table exists: ${TABLE_NAME}`);
  } catch {
    console.log(`Creating DynamoDB table: ${TABLE_NAME}`);
    await dynamoClient.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "timestamp", AttributeType: "N" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "timestamp", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    console.log("DynamoDB table created.");
  }
}

async function ensureSQSQueue() {
  try {
    const res = await sqsClient.send(
      new GetQueueUrlCommand({ QueueName: QUEUE_NAME }),
    );
    console.log(`SQS queue exists: ${res.QueueUrl}`);
    return res.QueueUrl;
  } catch {
    console.log(`Creating SQS queue: ${QUEUE_NAME}`);
    const res = await sqsClient.send(
      new CreateQueueCommand({
        QueueName: QUEUE_NAME,
        Attributes: { VisibilityTimeout: "60" },
      }),
    );
    console.log(`SQS queue created: ${res.QueueUrl}`);
    return res.QueueUrl;
  }
}

// ─── Lambda ──────────────────────────────────────────────────────────────────

async function deployLambda({ functionName, zipPath, handler, envVars }) {
  const zipFile = fs.readFileSync(zipPath);

  try {
    await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Role: ROLE_ARN,
        Handler: handler,
        Code: { ZipFile: zipFile },
        Description: `FogStream ${functionName} — PR preview`,
        Timeout: 30,
        MemorySize: 256,
        Environment: { Variables: envVars },
      }),
    );
    console.log(`Lambda created: ${functionName}`);
  } catch (err) {
    if (err.name === "ResourceConflictException") {
      console.log(`Lambda exists, updating code: ${functionName}`);
      await lambdaClient.send(
        new UpdateFunctionCodeCommand({
          FunctionName: functionName,
          ZipFile: zipFile,
        }),
      );
      console.log(`Waiting for ${functionName} to finish updating...`);
      await waitUntilFunctionUpdated(
        { client: lambdaClient, maxWaitTime: 60 },
        { FunctionName: functionName },
      );
      await lambdaClient.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Environment: { Variables: envVars },
        }),
      );
      await waitUntilFunctionUpdated(
        { client: lambdaClient, maxWaitTime: 60 },
        { FunctionName: functionName },
      );
      console.log(`Lambda code + config updated: ${functionName}`);
    } else {
      throw err;
    }
  }

  const permissions = [
    {
      Action: "lambda:InvokeFunction",
      Principal: "*",
      StatementId: "PublicInvoke",
    },
    {
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      StatementId: "ApiGatewayInvoke",
    },
  ];
  for (const perm of permissions) {
    try {
      await lambdaClient.send(
        new AddPermissionCommand({ FunctionName: functionName, ...perm }),
      );
      console.log(`Permission added: ${perm.StatementId}`);
    } catch (err) {
      if (err.name === "ResourceConflictException") {
        console.log(`Permission already exists: ${perm.StatementId}`);
      } else {
        throw err;
      }
    }
  }
}

// ─── API Gateway ─────────────────────────────────────────────────────────────

async function ensureApiGateway({ apiName, functionName }) {
  const existing = await apiClient.send(new GetApisCommand({}));
  let api = existing.Items?.find((a) => a.Name === apiName);

  if (!api) {
    console.log(`Creating HTTP API: ${apiName}`);
    api = await apiClient.send(
      new CreateApiCommand({
        Name: apiName,
        ProtocolType: "HTTP",
        CorsConfiguration: {
          AllowOrigins: ["*"],
          AllowMethods: ["GET", "POST", "PUT", "OPTIONS", "DELETE", "PATCH"],
          AllowHeaders: ["*"],
        },
      }),
    );
  } else {
    console.log(`API already exists: ${apiName}`);
  }

  const integrations = await apiClient.send(
    new GetIntegrationsCommand({ ApiId: api.ApiId }),
  );
  let integration = integrations.Items?.find((i) =>
    i.IntegrationUri?.includes(functionName),
  );

  if (!integration) {
    console.log("Creating Lambda integration...");
    integration = await apiClient.send(
      new CreateIntegrationCommand({
        ApiId: api.ApiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${functionName}`,
        PayloadFormatVersion: "2.0",
      }),
    );
  } else {
    console.log("Integration already exists.");
  }

  const routes = await apiClient.send(
    new GetRoutesCommand({ ApiId: api.ApiId }),
  );
  const requiredRoutes = ["ANY /", "ANY /{proxy+}"];
  for (const routeKey of requiredRoutes) {
    const exists = routes.Items?.find((r) => r.RouteKey === routeKey);
    if (!exists) {
      console.log(`Creating route: ${routeKey}`);
      await apiClient.send(
        new CreateRouteCommand({
          ApiId: api.ApiId,
          RouteKey: routeKey,
          Target: `integrations/${integration.IntegrationId}`,
        }),
      );
    } else {
      console.log(`Route exists: ${routeKey}`);
    }
  }

  const stages = await apiClient.send(
    new GetStagesCommand({ ApiId: api.ApiId }),
  );
  const stage = stages.Items?.find((s) => s.StageName === "$default");
  if (!stage) {
    console.log("Creating stage: $default");
    await apiClient.send(
      new CreateStageCommand({
        ApiId: api.ApiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );
  } else {
    console.log("Stage already exists.");
  }

  return api.ApiEndpoint;
}

// ─── SQS → Lambda Event Source Mapping ──────────────────
async function ensureSQSEventMapping(functionName, queueUrl) {
  const queueArn = queueUrl
    .replace("https://sqs.", "arn:aws:sqs:")
    .replace(".amazonaws.com/", ":")
    .replace("/", ":");

  const existing = await lambdaClient.send(
    new ListEventSourceMappingsCommand({
      FunctionName: functionName,
      EventSourceArn: queueArn,
    }),
  );

  if (existing.EventSourceMappings?.length > 0) {
    console.log(`SQS trigger already exists for ${functionName}`);
    return;
  }

  await lambdaClient.send(
    new CreateEventSourceMappingCommand({
      FunctionName: functionName,
      EventSourceArn: queueArn,
      BatchSize: 10,
      Enabled: true,
    }),
  );
  console.log(`SQS trigger created: ${queueArn} → ${functionName}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await ensureDynamoTable();
  const sqsQueueUrl = await ensureSQSQueue();

  const ingestName = `fogstream-ingest-${PR_ID}`;
  await deployLambda({
    functionName: ingestName,
    zipPath: "./ingest.zip",
    handler: "ingest.handler",
    envVars: { TABLE_NAME, SQS_QUEUE_URL: sqsQueueUrl },
  });
  await ensureSQSEventMapping(ingestName, sqsQueueUrl);
  const ingestUrl = await ensureApiGateway({
    apiName: `fogstream-ingest-api-${PR_ID}`,
    functionName: ingestName,
  });
  console.log("Ingest API URL:", ingestUrl);

  const queryName = `fogstream-query-${PR_ID}`;
  await deployLambda({
    functionName: queryName,
    zipPath: "./query.zip",
    handler: "query.handler",
    envVars: { TABLE_NAME },
  });
  const queryUrl = await ensureApiGateway({
    apiName: `fogstream-query-api-${PR_ID}`,
    functionName: queryName,
  });
  console.log("Query API URL:", queryUrl);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `ingest_url=${ingestUrl}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `query_url=${queryUrl}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
