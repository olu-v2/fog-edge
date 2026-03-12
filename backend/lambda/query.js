import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const FOG = "fog-node-01";

export const handler = async (event) => {
  const qp = event.queryStringParameters ?? {};
  const stype = qp.type ?? "temperature";
  const since = Number(qp.since ?? Math.floor(Date.now() / 1000) - 3600);

  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND #ts >= :since",
      ExpressionAttributeNames: { "#ts": "timestamp" },
      ExpressionAttributeValues: {
        ":pk": `${FOG}#${stype}`,
        ":since": since,
      },
      ScanIndexForward: true,
    }),
  );

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ type: stype, readings: result.Items ?? [] }),
  };
};
