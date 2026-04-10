import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONN_TABLE = process.env.WS_CONNECTIONS_TABLE;

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  if (routeKey === "$connect") {
    await dynamo.send(
      new PutCommand({
        TableName: CONN_TABLE,
        Item: {
          connectionId,
          connectedAt: Math.floor(Date.now() / 1000),
          ttl: Math.floor(Date.now() / 1000) + 2 * 60 * 60, // 2h auto-expire
        },
      }),
    );
    console.log(`[WS] Connected: ${connectionId}`);
  }

  if (routeKey === "$disconnect") {
    await dynamo.send(
      new DeleteCommand({
        TableName: CONN_TABLE,
        Key: { connectionId },
      }),
    );
    console.log(`[WS] Disconnected: ${connectionId}`);
  }

  return { statusCode: 200, body: "OK" };
};
