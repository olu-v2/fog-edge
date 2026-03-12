import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

export const handler = async (event) => {
  const writes = [];

  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const fogId = body.fog_node_id ?? "unknown";

    for (const reading of body.aggregated ?? []) {
      writes.push(
        dynamo.send(
          new PutCommand({
            TableName: TABLE,
            Item: {
              pk: `${fogId}#${reading.type}`,
              timestamp: Math.floor(reading.timestamp),
              type: reading.type,
              fog_node: fogId,
              mean: reading.mean?.toString() ?? "",
              min: reading.min?.toString() ?? "",
              max: reading.max?.toString() ?? "",
              count: reading.count ?? 1,
              latest: JSON.stringify(reading.latest ?? {}),
              sensor_ids: reading.sensor_ids ?? [],
              ingested_at: Math.floor(Date.now() / 1000),
            },
          }),
        ),
      );
    }
  }

  await Promise.all(writes);
  return { statusCode: 200, body: "OK" };
};
