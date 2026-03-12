import aedes from "aedes";
import net from "net";
import mqtt from "mqtt";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// ── Config ──────────────────────────────────────────────
const BROKER_PORT = 1883;
const DISPATCH_RATE = 5000; // ms
const AWS_REGION = "us-east-1";
const SQS_QUEUE_URL =
  "https://sqs.us-east-1.amazonaws.com/<ACCOUNT_ID>/sensor-ingest-queue";
const TOPIC = "fog/ingest";
// ────────────────────────────────────────────────────────

const sqs = new SQSClient({ region: AWS_REGION });
let buffer = [];

// ── Validation ──────────────────────────────────────────
const VALID_RANGES = {
  temperature: { key: "celsius", min: -40, max: 80 },
  humidity: { key: "rh", min: 0, max: 100 },
  pressure: { key: "hpa", min: 870, max: 1084 },
  co2: { key: "ppm", min: 0, max: 5000 },
  vibration: null,
};

const validate = (payload) => {
  const rule = VALID_RANGES[payload.type];
  if (rule === undefined) return false;
  if (rule === null) return true; // vibration always valid
  const val = payload.data[rule.key];
  return val >= rule.min && val <= rule.max;
};

// ── Aggregation ─────────────────────────────────────────
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

const aggregate = (readings) => {
  const grouped = readings.reduce((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  return Object.entries(grouped).map(([stype, items]) => {
    const latest = items[items.length - 1];
    const sensorIds = [...new Set(items.map((i) => i.sensor_id))];

    if (stype === "vibration") {
      return {
        type: stype,
        count: items.length,
        latest: latest.data,
        timestamp: latest.timestamp,
        sensor_ids: sensorIds,
      };
    }

    const key = Object.keys(items[0].data)[0];
    const vals = items.map((i) => i.data[key]);
    return {
      type: stype,
      count: vals.length,
      mean: +mean(vals).toFixed(3),
      min: Math.min(...vals),
      max: Math.max(...vals),
      latest: latest.data,
      timestamp: latest.timestamp,
      sensor_ids: sensorIds,
    };
  });
};

// ── Cloud Dispatcher ─────────────────────────────────────
const dispatchToCloud = async () => {
  if (buffer.length === 0) return;

  const snapshot = [...buffer];
  buffer = [];

  const valid = snapshot.filter(validate);
  const dropped = snapshot.length - valid.length;

  if (valid.length === 0) {
    console.log("[FOG] No valid readings — skipping dispatch");
    return;
  }

  const payload = {
    fog_node_id: "fog-node-01",
    window_start: snapshot[0].timestamp,
    window_end: snapshot[snapshot.length - 1].timestamp,
    dropped,
    aggregated: aggregate(valid),
  };

  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MessageBody: JSON.stringify(payload),
      }),
    );
    console.log(
      `[FOG] Dispatched ${valid.length} readings (${dropped} dropped) → SQS`,
    );
  } catch (err) {
    console.error("[FOG] SQS dispatch error:", err.message);
  }
};

// ── Embedded MQTT Broker (aedes) ─────────────────────────
const broker = aedes();
const server = net.createServer(broker.handle);

server.listen(BROKER_PORT, () => {
  console.log(`[FOG] MQTT Broker listening on port ${BROKER_PORT}`);

  // ── Fog Subscriber ───────────────────────────────────
  const subscriber = mqtt.connect(`mqtt://localhost:${BROKER_PORT}`, {
    clientId: "fog-subscriber",
  });

  subscriber.on("connect", () => {
    subscriber.subscribe(TOPIC, { qos: 1 });
    console.log(`[FOG] Subscribed to topic: ${TOPIC}`);
  });

  subscriber.on("message", (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      buffer.push(payload);
      console.log(`[FOG] Buffered: ${payload.type} from ${payload.sensor_id}`);
    } catch (e) {
      console.warn("[FOG] Failed to parse message:", e.message);
    }
  });

  // ── Dispatch timer ───────────────────────────────────
  setInterval(dispatchToCloud, DISPATCH_RATE);
});

broker.on("client", (client) =>
  console.log(`[FOG] Device connected: ${client.id}`),
);

broker.on("clientDisconnect", (client) =>
  console.log(`[FOG] Device disconnected: ${client.id}`),
);

process.on("SIGINT", () => {
  console.log("[FOG] Shutting down...");
  server.close();
  process.exit();
});
