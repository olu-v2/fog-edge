import { BaseSensor } from "./sensorBase.js";

const gauss = (mean, std) => {
  // Box-Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const rand = (min, max) => Math.random() * (max - min) + min;

// Air Temperature Sensor — optimal range 15–35°C
export class AirTemperatureSensor extends BaseSensor {
  constructor(id, freq = 1.0) {
    super(id, "air_temperature", freq);
  }
  generate() {
    return { celsius: +gauss(24, 3).toFixed(2), unit: "°C" };
  }
}

// Humidity Sensor — optimal 50–85% RH
export class HumiditySensor extends BaseSensor {
  constructor(id, freq = 0.5) {
    super(id, "humidity", freq);
  }
  generate() {
    return { rh: +rand(50, 85).toFixed(2), unit: "%" };
  }
}

// CO2 Sensor (NDIR) — photosynthesis range 400–1500 ppm
export class CO2Sensor extends BaseSensor {
  constructor(id, freq = 0.2) {
    super(id, "co2", freq);
  }
  generate() {
    return { ppm: +rand(400, 1500).toFixed(1), unit: "ppm" };
  }
}

// PAR Light Sensor — 0–2000 µmol/m²/s
export class PARLightSensor extends BaseSensor {
  constructor(id, freq = 0.5) {
    super(id, "par_light", freq);
  }
  generate() {
    return { umol: +gauss(800, 300).toFixed(1), unit: "µmol/m²/s" };
  }
}

// Soil Moisture Sensor — 20–80% VWC
export class SoilMoistureSensor extends BaseSensor {
  constructor(id, freq = 0.1) {
    super(id, "soil_moisture", freq);
  }
  generate() {
    return { vwc: +rand(20, 80).toFixed(2), unit: "% VWC" };
  }
}
