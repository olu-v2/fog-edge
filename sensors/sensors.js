import { BaseSensor } from "./sensorBase.js";

const gauss = (mean, std) => {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const rand = (min, max) => Math.random() * (max - min) + min;

export class AirTemperatureSensor extends BaseSensor {
  constructor(id, freq = 1.0, options = {}) {
    super(id, "air_temperature", freq, options);
  }
  generate() {
    return { celsius: +gauss(24, 3).toFixed(2), unit: "°C" };
  }
}

export class HumiditySensor extends BaseSensor {
  constructor(id, freq = 0.5, options = {}) {
    super(id, "humidity", freq, options);
  }
  generate() {
    return { rh: +rand(50, 85).toFixed(2), unit: "%" };
  }
}

export class CO2Sensor extends BaseSensor {
  constructor(id, freq = 0.2, options = {}) {
    super(id, "co2", freq, options);
  }
  generate() {
    return { ppm: +rand(400, 1500).toFixed(1), unit: "ppm" };
  }
}

export class PARLightSensor extends BaseSensor {
  constructor(id, freq = 0.5, options = {}) {
    super(id, "par_light", freq, options);
  }
  generate() {
    return { umol: +gauss(800, 300).toFixed(1), unit: "µmol/m²/s" };
  }
}

export class SoilMoistureSensor extends BaseSensor {
  constructor(id, freq = 0.1, options = {}) {
    super(id, "soil_moisture", freq, options);
  }
  generate() {
    return { vwc: +rand(20, 80).toFixed(2), unit: "% VWC" };
  }
}
