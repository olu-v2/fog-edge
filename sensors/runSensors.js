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
    new AirTemperatureSensor("temp-gh-01", 1.0, {
      location: "Zone A",
      firmware: "1.2.0",
    }),
    new HumiditySensor("hum-gh-01", 0.5, {
      location: "Zone A",
      firmware: "1.1.3",
    }),
    new CO2Sensor("co2-gh-01", 0.2, { location: "Zone B", firmware: "1.0.8" }),
    new PARLightSensor("par-gh-01", 0.5, {
      location: "Zone B",
      firmware: "1.3.1",
    }),
    new SoilMoistureSensor("soil-gh-01", 0.1, {
      location: "Zone C",
      firmware: "1.0.5",
      dropoutRate: 0.05,
      spikeRate: 0.02,
    }),
  ];

  const dispatch = (payload) => {
    client.publish(TOPIC, JSON.stringify(payload), { qos: 1 });
    console.log(`[SENSOR] Published: ${payload.type} | ${payload.sensor_id}`);
  };

  sensors.forEach((s) => s.start(dispatch));

  process.on("SIGINT", () => {
    sensors.forEach((s) => s.stop());
    client.end();
    process.exit();
  });
});

client.on("error", (err) => console.error("[SENSORS] MQTT error:", err));
