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

export const handler = async (event) => {
  const wsClient = new ApiGatewayManagementApiClient({ endpoint: WS_ENDPOINT });
  const writes = [];

  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const fogId = body.fog_node_id ?? "unknown";

    for (const reading of body.aggregated ?? []) {
      await dynamo.send(
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
            anomaly: reading.anomaly ?? false,
            ingested_at: Math.floor(Date.now() / 1000),
            ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          },
        }),
      );

      if (reading.anomaly && SNS_ARN) {
        await sns.send(
          new PublishCommand({
            TopicArn: SNS_ARN,
            Subject: `FogStream Anomaly: ${reading.type}`,
            Message: JSON.stringify(
              {
                fog_node: fogId,
                type: reading.type,
                sensor_ids: reading.sensor_ids,
                mean: reading.mean,
                latest: reading.latest,
                timestamp: reading.timestamp,
              },
              null,
              2,
            ),
          }),
        );
      }

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
