import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  ApiGatewayV2Client,
  GetApisCommand,
} from "@aws-sdk/client-apigatewayv2";

dotenv.config({ override: true });

const REGION = process.env.AWS_REGION || "us-east-1";
const PR_NUMBER = process.env.PR_NUMBER;
const BASE_BUCKET = process.env.S3_BUCKET;

// Each PR gets its own bucket prefix: fogstream-dashboard-pr-42
const BUCKET = `${BASE_BUCKET}-pr-${PR_NUMBER}`;

const s3 = new S3Client({ region: REGION });
const apiClient = new ApiGatewayV2Client({ region: REGION });

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getQueryApiUrl() {
  const apiName = `fogstream-query-api-pr-${PR_NUMBER}`;
  const existing = await apiClient.send(new GetApisCommand({}));
  const api = existing.Items?.find((a) => a.Name === apiName);

  if (!api)
    throw new Error(`Query API not found: ${apiName}. Deploy backend first.`);

  console.log(`Found Query API: ${api.ApiEndpoint}`);
  return api.ApiEndpoint;
}

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`S3 bucket exists: ${BUCKET}`);
  } catch {
    console.log(`Creating S3 bucket: ${BUCKET}`);
    await s3.send(
      new CreateBucketCommand({
        Bucket: BUCKET,
      }),
    );
    console.log("S3 bucket created.");
  }
}

async function enableStaticHosting() {
  await s3.send(
    new PutBucketWebsiteCommand({
      Bucket: BUCKET,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: "index.html" },
        ErrorDocument: { Key: "index.html" },
      },
    }),
  );
  console.log("Static website hosting enabled.");
}

async function setPublicPolicy() {
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${BUCKET}/*`,
          },
        ],
      }),
    }),
  );
  console.log("Public read policy applied.");
}

async function uploadDashboard(apiUrl) {
  const dashboardDir = path.resolve("backend/dashboard");
  const files = fs.readdirSync(dashboardDir);

  for (const file of files) {
    const filePath = path.join(dashboardDir, file);
    let content = fs.readFileSync(filePath, "utf8");

    // Inject API Gateway URL at upload time
    if (file === "index.html") {
      content = content.replace(
        /https:\/\/<API_ID>\.execute-api\.[^"]+/g,
        apiUrl,
      );
      console.log(`API URL injected into ${file}`);
    }

    const contentType = file.endsWith(".html")
      ? "text/html"
      : file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "application/octet-stream";

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: file,
        Body: content,
        ContentType: contentType,
        CacheControl: "max-age=300",
      }),
    );
    console.log(`Uploaded: ${file}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const API_URL = await getQueryApiUrl();
  await ensureBucket();
  await enableStaticHosting();
  await setPublicPolicy();
  await uploadDashboard(API_URL);

  const dashboardUrl = `http://${BUCKET}.s3-website-${REGION}.amazonaws.com`;
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
