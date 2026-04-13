import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const FOG = "fog-node-01";
const ALL_ZONES = ["Zone A", "Zone B", "Zone C"];

export const handler = async (event) => {
  const qp = event.queryStringParameters ?? {};
  const stype = qp.type ?? "airtemperature";
  const since = Number(qp.since ?? Math.floor(Date.now() / 1000) - 3600);
  const zone = qp.zone ?? null;
  const zones = zone ? [zone] : ALL_ZONES;

  const results = await Promise.all(
    zones.map((z) =>
      dynamo.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "pk = :pk AND #ts >= :since",
          ExpressionAttributeNames: { "#ts": "timestamp" },
          ExpressionAttributeValues: {
            ":pk": `${FOG}#${stype}#${z}`,
            ":since": since,
          },
          ScanIndexForward: true,
        }),
      ),
    ),
  );

  const readings = results
    .flatMap((r) => r.Items ?? [])
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      type: stype,
      zone: zone ?? "all",
      readings,
    }),
  };
};
