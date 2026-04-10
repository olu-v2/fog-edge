import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient();

const TABLE = process.env.TABLE_NAME;
const CONN_TABLE = process.env.WS_CONNECTIONS_TABLE;
const SNS_ARN = process.env.SNS_TOPIC_ARN;
const WS_ENDPOINT = process.env.WS_ENDPOINT;

// ── Hard thresholds (cloud-side safety net, mirrors fog node) ───────────────
const ALERT_THRESHOLDS = {
  air_temperature: { min: 10, max: 38, unit: "°C" },
  humidity: { min: 30, max: 90, unit: "% RH" },
  co2: { min: 400, max: 1400, unit: "ppm" },
  par_light: { min: 0, max: 2500, unit: "µmol/m²/s" },
  soil_moisture: { min: 20, max: 85, unit: "% VWC" },
};

// ── Determine if a reading needs an alert and why ───────────────────────────
function shouldAlert(reading) {
  if (reading.anomaly) return "ANOMALY";

  const rule = ALERT_THRESHOLDS[reading.type];
  if (!rule || reading.mean === undefined) return null;

  const val = parseFloat(reading.mean);
  if (val < rule.min) return "BELOW_MIN";
  if (val > rule.max) return "ABOVE_MAX";

  return null;
}

// ── Human-readable SNS message ──────────────────────────────────────────────
function formatAlertMessage({ fogId, reading, reason }) {
  const rule = ALERT_THRESHOLDS[reading.type];
  const emoji = reason === "ANOMALY" ? "⚠️" : "🚨";
  const zone = reading.locations?.join(", ") ?? "unknown zone";
  const label = reading.type.replace(/_/g, " ").toUpperCase();

  return [
    `${emoji} Greenhouse Alert — ${label}`,
    ``,
    `Fog Node  : ${fogId}`,
    `Zone      : ${zone}`,
    `Sensor(s) : ${reading.sensor_ids?.join(", ") ?? "unknown"}`,
    `Value     : ${reading.mean} ${rule?.unit ?? ""}`,
    `Range     : ${rule?.min}–${rule?.max} ${rule?.unit ?? ""}`,
    `Reason    : ${reason}`,
    `Time      : ${new Date(reading.timestamp * 1000).toISOString()}`,
    ``,
    `Raw mean  : ${reading.raw_mean ?? reading.mean} ${rule?.unit ?? ""}`,
    `Window    : ${reading.count} readings`,
  ].join("\n");
}

// ── Lambda handler ──────────────────────────────────────────────────────────
export const handler = async (event) => {
  const wsClient = new ApiGatewayManagementApiClient({ endpoint: WS_ENDPOINT });

  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const fogId = body.fog_node_id ?? "unknown";

    for (const reading of body.aggregated ?? []) {
      // ── 1. Write to DynamoDB ─────────────────────────────────────────────
      await dynamo.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            pk: `${fogId}#${reading.type}`,
            timestamp: Math.floor(reading.timestamp),
            type: reading.type,
            fog_node: fogId,
            mean: reading.mean?.toString() ?? "",
            raw_mean: reading.raw_mean?.toString() ?? "", // ← new
            min: reading.min?.toString() ?? "",
            max: reading.max?.toString() ?? "",
            count: reading.count ?? 1,
            latest: JSON.stringify(reading.latest ?? {}),
            sensor_ids: reading.sensor_ids ?? [],
            locations: reading.locations?.length // ← new
              ? reading.locations
              : ["unknown"],
            anomaly: reading.anomaly ?? false,
            ingested_at: Math.floor(Date.now() / 1000),
            ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          },
        }),
      );

      // ── 2. SNS alert (anomaly OR threshold breach) ───────────────────────
      const reason = shouldAlert(reading);
      if (reason && SNS_ARN) {
        await sns
          .send(
            new PublishCommand({
              TopicArn: SNS_ARN,
              Subject: `[Greenhouse] ${reason} — ${reading.type} @ ${reading.locations?.join(", ") ?? "unknown"}`,
              Message: formatAlertMessage({ fogId, reading, reason }), // ← human-readable
            }),
          )
          .catch((err) =>
            // Never let SNS failure block the rest of processing
            console.error("[INGEST] SNS publish failed:", err.message),
          );
      }

      // ── 3. WebSocket push to dashboard clients ───────────────────────────
      if (WS_ENDPOINT) {
        const connections = await dynamo.send(
          new ScanCommand({
            TableName: CONN_TABLE,
          }),
        );

        const pushes = (connections.Items ?? []).map(
          async ({ connectionId }) => {
            try {
              await wsClient.send(
                new PostToConnectionCommand({
                  ConnectionId: connectionId,
                  Data: JSON.stringify({ type: "reading", payload: reading }),
                }),
              );
            } catch (err) {
              if (err.statusCode === 410) {
                // Stale connection — clean it up
                await dynamo.send(
                  new DeleteCommand({
                    TableName: CONN_TABLE,
                    Key: { connectionId },
                  }),
                );
              }
            }
          },
        );

        await Promise.allSettled(pushes);
      }
    }
  }

  return { statusCode: 200, body: "OK" };
};
