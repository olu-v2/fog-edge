import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
  waitUntilFunctionUpdated,
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
import archiver from "archiver";

dotenv.config({ override: true });

const REGION = process.env.AWS_REGION || "eu-west-1";
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
const ROLE_ARN = process.env.LAMBDA_ROLE_ARN;
const PR_NUMBER = process.env.PR_NUMBER;

const lambdaClient = new LambdaClient({ region: REGION });
const apiClient = new ApiGatewayV2Client({ region: REGION });
const FUNCTION_NAME = `fogstream-dashboard-pr-${PR_NUMBER}`;

// ─── Build ───────────────────────────────────────────────

function buildDashboard(apiUrl, wsUrl) {
  console.log("Installing dashboard dependencies...");
  execSync("yarn --cwd dashboard install --frozen-lockfile", {
    stdio: "inherit",
  });

  console.log("Building Vite app...");
  execSync("yarn --cwd dashboard build", {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_API_URL: apiUrl,
      VITE_WS_URL: wsUrl,
    },
  });
  console.log("Vite build complete.");
}

// ─── Zip ────────────────────────────────────────────────

function zipDashboard() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream("dashboard.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(
        `dashboard.zip: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`,
      );
      resolve();
    });
    archive.on("error", reject);
    archive.pipe(output);

    // Include server entry point
    archive.file("dashboard/server.js", { name: "server.js" });

    // Include built Vite assets
    archive.directory("dashboard/dist/", "dist");

    // Include only production node_modules
    archive.directory("dashboard/node_modules/", "node_modules");

    // Include package.json for ESM resolution
    archive.file("dashboard/package.json", { name: "package.json" });

    archive.finalize();
  });
}

// ─── Lambda ──────────────────────────────────────────────

async function deployLambda() {
  const zipFile = fs.readFileSync("dashboard.zip");

  try {
    await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: FUNCTION_NAME,
        Runtime: "nodejs22.x",
        Role: ROLE_ARN,
        Handler: "server.handler",
        Code: { ZipFile: zipFile },
        Description: `FogStream Dashboard — PR ${PR_NUMBER}`,
        Timeout: 15,
        MemorySize: 256,
      }),
    );
    console.log(`Lambda created: ${FUNCTION_NAME}`);
  } catch (err) {
    if (err.name === "ResourceConflictException") {
      console.log(`Lambda exists, updating: ${FUNCTION_NAME}`);
      await lambdaClient.send(
        new UpdateFunctionCodeCommand({
          FunctionName: FUNCTION_NAME,
          ZipFile: zipFile,
        }),
      );

      console.log("Waiting for update to complete...");
      await waitUntilFunctionUpdated(
        { client: lambdaClient, maxWaitTime: 60 },
        { FunctionName: FUNCTION_NAME },
      );

      await lambdaClient.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: FUNCTION_NAME,
          Handler: "server.handler",
        }),
      );

      await waitUntilFunctionUpdated(
        { client: lambdaClient, maxWaitTime: 60 },
        { FunctionName: FUNCTION_NAME },
      );

      console.log(`Lambda updated: ${FUNCTION_NAME}`);
    } else {
      throw err;
    }
  }

  // Permissions
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
        new AddPermissionCommand({
          FunctionName: FUNCTION_NAME,
          ...perm,
        }),
      );
    } catch (err) {
      if (err.name !== "ResourceConflictException") throw err;
    }
  }
}

async function getQueryApiUrl() {
  const apiName = `fogstream-query-api-pr-${PR_NUMBER}`;
  const existing = await apiClient.send(new GetApisCommand({}));
  const api = existing.Items?.find((a) => a.Name === apiName);

  if (!api) {
    throw new Error(
      `Query API "${apiName}" not found. ` +
        `Make sure deploy-backend workflow ran first for PR #${PR_NUMBER}.`,
    );
  }

  console.log(`Found query API: ${api.ApiEndpoint}`);
  return api.ApiEndpoint;
}

// ─── API Gateway ─────────────────────────────────────────

async function ensureApiGateway() {
  const apiName = `fogstream-dashboard-api-pr-${PR_NUMBER}`;
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
          AllowMethods: ["GET"],
          AllowHeaders: ["*"],
        },
      }),
    );
  } else {
    console.log(`API exists: ${apiName}`);
  }

  // Integration
  const integrations = await apiClient.send(
    new GetIntegrationsCommand({ ApiId: api.ApiId }),
  );
  let integration = integrations.Items?.find((i) =>
    i.IntegrationUri?.includes(FUNCTION_NAME),
  );
  if (!integration) {
    integration = await apiClient.send(
      new CreateIntegrationCommand({
        ApiId: api.ApiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}`,
        PayloadFormatVersion: "2.0",
      }),
    );
  }

  // Routes
  const routes = await apiClient.send(
    new GetRoutesCommand({ ApiId: api.ApiId }),
  );
  const requiredRoutes = ["GET /", "GET /{proxy+}"];
  for (const routeKey of requiredRoutes) {
    if (!routes.Items?.find((r) => r.RouteKey === routeKey)) {
      await apiClient.send(
        new CreateRouteCommand({
          ApiId: api.ApiId,
          RouteKey: routeKey,
          Target: `integrations/${integration.IntegrationId}`,
        }),
      );
    }
  }

  // Stage
  const stages = await apiClient.send(
    new GetStagesCommand({ ApiId: api.ApiId }),
  );
  if (!stages.Items?.find((s) => s.StageName === "$default")) {
    await apiClient.send(
      new CreateStageCommand({
        ApiId: api.ApiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );
  }

  return api.ApiEndpoint;
}

async function getWebSocketApiUrl() {
  const apiName = `fogstream-ws-api-pr-${PR_NUMBER}`;
  const existing = await apiClient.send(new GetApisCommand({}));
  const api = existing.Items?.find((a) => a.Name === apiName);

  if (!api) {
    throw new Error(
      `WebSocket API "${apiName}" not found. ` +
        `Make sure deploy-backend workflow ran first for PR #${PR_NUMBER}.`,
    );
  }

  const wsUrl = `wss://${api.ApiId}.execute-api.${REGION}.amazonaws.com/prod`;
  console.log(`Found WebSocket API: ${wsUrl}`);
  return wsUrl;
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  const API_URL = await getQueryApiUrl();
  const WS_URL = await getWebSocketApiUrl();
  buildDashboard(API_URL, WS_URL);
  await zipDashboard();
  await deployLambda();
  const dashboardUrl = await ensureApiGateway();

  console.log("Dashboard URL:", dashboardUrl);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `dashboard_url=${dashboardUrl}\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
