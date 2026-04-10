import mqtt from "mqtt";
import {
  AirTemperatureSensor,
  HumiditySensor,
  CO2Sensor,
  PARLightSensor,
  SoilMoistureSensor,
} from "./sensors.js";

const BROKER_URL = "mqtt://localhost:1883";
const TOPIC = "fog/ingest";

const client = mqtt.connect(BROKER_URL);

client.on("connect", () => {
  console.log("[SENSORS] Connected to fog broker");

  const sensors = [
    // ── Zone A ──────────────────────────────────────────────────────────────
    new AirTemperatureSensor("temp-a-01", 1.0, {
      location: "Zone A",
      firmware: "1.2.0",
    }),
    new HumiditySensor("hum-a-01", 0.5, {
      location: "Zone A",
      firmware: "1.1.3",
    }),
    new CO2Sensor("co2-a-01", 0.2, { location: "Zone A", firmware: "1.0.8" }),
    new PARLightSensor("par-a-01", 0.5, {
      location: "Zone A",
      firmware: "1.3.1",
    }),
    new SoilMoistureSensor("soil-a-01", 0.1, {
      location: "Zone A",
      firmware: "1.0.5",
    }),

    // ── Zone B ──────────────────────────────────────────────────────────────
    new AirTemperatureSensor("temp-b-01", 1.0, {
      location: "Zone B",
      firmware: "1.2.0",
    }),
    new HumiditySensor("hum-b-01", 0.5, {
      location: "Zone B",
      firmware: "1.1.3",
    }),
    new CO2Sensor("co2-b-01", 0.2, { location: "Zone B", firmware: "1.0.8" }),
    new PARLightSensor("par-b-01", 0.5, {
      location: "Zone B",
      firmware: "1.3.1",
    }),
    new SoilMoistureSensor("soil-b-01", 0.1, {
      location: "Zone B",
      firmware: "1.0.5",
    }),

    // ── Zone C ──────────────────────────────────────────────────────────────
    new AirTemperatureSensor("temp-c-01", 1.0, {
      location: "Zone C",
      firmware: "1.2.0",
    }),
    new HumiditySensor("hum-c-01", 0.5, {
      location: "Zone C",
      firmware: "1.1.3",
    }),
    new CO2Sensor("co2-c-01", 0.2, { location: "Zone C", firmware: "1.0.8" }),
    new PARLightSensor("par-c-01", 0.5, {
      location: "Zone C",
      firmware: "1.3.1",
    }),
    new SoilMoistureSensor("soil-c-01", 0.1, {
      location: "Zone C",
      firmware: "1.0.5",
    }),
  ];

  const dispatch = (payload) => {
    client.publish(TOPIC, JSON.stringify(payload), { qos: 1 });
    console.log(
      `[SENSOR] Published: ${payload.type} | ${payload.sensor_id} | location: ${payload.location}`,
    );
  };

  sensors.forEach((s) => s.start(dispatch));

  process.on("SIGINT", () => {
    sensors.forEach((s) => s.stop());
    client.end();
    process.exit();
  });
});

client.on("error", (err) => console.error("[SENSORS] MQTT error:", err));
