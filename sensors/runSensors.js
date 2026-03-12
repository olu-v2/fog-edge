import mqtt from "mqtt";
import {
  TemperatureSensor,
  HumiditySensor,
  PressureSensor,
  CO2Sensor,
  VibrationSensor,
} from "./sensors.js";

const BROKER_URL = "mqtt://localhost:1883";
const TOPIC = "fog/ingest";

const client = mqtt.connect(BROKER_URL);

client.on("connect", () => {
  console.log("[SENSORS] Connected to fog broker");

  const sensors = [
    new TemperatureSensor("temp-01", 1.0),
    new HumiditySensor("hum-01", 0.5),
    new PressureSensor("pres-01", 0.2),
    new CO2Sensor("co2-01", 0.1),
    new VibrationSensor("vib-01", 2.0),
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
