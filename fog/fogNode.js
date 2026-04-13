import { Aedes } from "aedes";
import net from "net";
import mqtt from "mqtt";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// ── Config ──────────────────────────────────────────────────────────────────
const broker = await Aedes.createBroker();
const BROKER_PORT = 1883;
const DISPATCH_RATE = 5000;
const AWS_REGION = "us-east-1";
const SQS_QUEUE_URL =
  "https://sqs.us-east-1.amazonaws.com/320803145537/sensor-ingest-queue";
const TOPIC_INGEST = "fog/ingest";
const TOPIC_ALERTS = "fog/alerts";

const sqs = new SQSClient({ region: AWS_REGION });
let buffer = [];

// ── EMA ─────────────────────────────────────────────────────────────────────
const EMA_ALPHA = 0.3;
const emaState = {};

function updateEMA(type, value) {
  emaState[type] =
    emaState[type] === undefined
      ? value
      : +(EMA_ALPHA * value + (1 - EMA_ALPHA) * emaState[type]).toFixed(4);
  return emaState[type];
}

// ── Z-score Anomaly Detection ────────────────────────────────────────────────
const rollingWindows = {};

function detectAnomaly(stype, value) {
  if (!rollingWindows[stype]) rollingWindows[stype] = [];
  const win = rollingWindows[stype];

  if (win.length < 10) {
    win.push(value);
    return false;
  }

  const mean = win.reduce((a, b) => a + b, 0) / win.length;
  const std = Math.sqrt(
    win.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / win.length,
  );

  win.push(value);
  if (win.length > 30) win.shift();

  return std > 0 && Math.abs(value - mean) / std > 2.0;
}
// ── Fog-level Alert Thresholds ───────────────────────────────────────────────
const ALERT_THRESHOLDS = {
  air_temperature: { min: 10, max: 38 },
  humidity: { min: 30, max: 90 },
  co2: { min: 400, max: 1400 },
  par_light: { min: 0, max: 2500 },
  soil_moisture: { min: 20, max: 85 },
};

function checkAndAlert(payload, alertPublisher) {
  const rule = ALERT_THRESHOLDS[payload.type];
  if (!rule) return;

  const key = Object.keys(payload.data)[0];
  const value = payload.data[key];

  if (value < rule.min || value > rule.max) {
    const alert = {
      sensor_id: payload.sensor_id,
      type: payload.type,
      location: payload.location ?? "unknown",
      value,
      rule,
      timestamp: payload.timestamp,
      reason: value < rule.min ? "BELOW_MIN" : "ABOVE_MAX",
    };
    alertPublisher.publish(TOPIC_ALERTS, JSON.stringify(alert), { qos: 1 });
    console.log(
      `[FOG ALERT] ${payload.type} @ ${alert.location} → ${value} (${alert.reason})`,
    );
  }
}

// ── Validation ───────────────────────────────────────────────────────────────
const VALID_RANGES = {
  air_temperature: { key: "celsius", min: 5, max: 45 },
  humidity: { key: "rh", min: 0, max: 100 },
  co2: { key: "ppm", min: 0, max: 5000 },
  par_light: { key: "umol", min: 0, max: 3000 },
  soil_moisture: { key: "vwc", min: 0, max: 100 },
};

const validate = (payload) => {
  const rule = VALID_RANGES[payload.type];
  if (rule === undefined) return false;

  if (rule.axes) {
    return rule.axes.every(({ key, min, max }) => {
      const val = payload.data[key];
      return val !== undefined && val >= min && val <= max;
    });
  }

  const val = payload.data[rule.key];
  return val !== undefined && val >= rule.min && val <= rule.max;
};

// ── Aggregation ──────────────────────────────────────────────────────────────
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

const aggregate = (readings) => {
  const grouped = readings.reduce((acc, r) => {
    const key = `${r.type}#${r.location}`;
    acc[key] = acc[key] || [];
    acc[key].push(r);
    return acc;
  }, {});

  return Object.entries(grouped).map(([stype, items]) => {
    const latest = items[items.length - 1];
    const sensorIds = [...new Set(items.map((i) => i.sensor_id))];
    const locations = [
      ...new Set(items.map((i) => i.location).filter(Boolean)),
    ];

    const key = Object.keys(items[0].data)[0];
    const vals = items.map((i) => i.data[key]);
    const rawMean = mean(vals);
    const lastVal = vals[vals.length - 1];

    return {
      type: stype,
      count: vals.length,
      mean: updateEMA(stype, rawMean),
      raw_mean: +rawMean.toFixed(3),
      min: Math.min(...vals),
      max: Math.max(...vals),
      anomaly: detectAnomaly(stype, lastVal),
      latest: latest.data,
      timestamp: latest.timestamp,
      sensor_ids: sensorIds,
      locations,
    };
  });
};

// ── Cloud Dispatcher ─────────────────────────────────────────────────────────
const dispatchToCloud = async () => {
  if (buffer.length === 0) return;

  const snapshot = [...buffer];
  buffer = [];

  const valid = snapshot.filter(validate);
  const dropped = snapshot.length - valid.length;

  if (valid.length === 0) {
    console.log("[FOG] No valid readings — skipping dispatch");
    return;
  } // ← fix 7: was missing

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

// ── Embedded MQTT Broker ─────────────────────────────────────────────────────
const server = net.createServer(broker.handle);

server.listen(BROKER_PORT, () => {
  console.log(`[FOG] MQTT Broker listening on port ${BROKER_PORT}`);

  const subscriber = mqtt.connect(`mqtt://localhost:${BROKER_PORT}`, {
    clientId: "fog-subscriber",
  });
  const alertPublisher = mqtt.connect(`mqtt://localhost:${BROKER_PORT}`, {
    clientId: "fog-alert-publisher",
  });

  subscriber.on("connect", () => {
    subscriber.subscribe(TOPIC_INGEST, { qos: 1 });
    console.log(`[FOG] Subscribed to topic: ${TOPIC_INGEST}`);
  });

  subscriber.on("message", (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      buffer.push(payload);
      checkAndAlert(payload, alertPublisher);
      console.log(
        `[FOG] Buffered: ${payload.type} from ${payload.sensor_id} (${payload.location ?? "no-zone"})`,
      );
    } catch (e) {
      console.warn("[FOG] Failed to parse message:", e.message);
    }
  });

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
