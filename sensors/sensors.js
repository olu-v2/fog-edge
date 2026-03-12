import { BaseSensor } from "./sensorBase.js";

const gauss = (mean, std) => {
  // Box-Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const rand = (min, max) => Math.random() * (max - min) + min;

export class TemperatureSensor extends BaseSensor {
  constructor(id, freq = 1.0) {
    super(id, "temperature", freq);
  }
  generate() {
    return { celsius: +gauss(22, 3).toFixed(2), unit: "C" };
  }
}

export class HumiditySensor extends BaseSensor {
  constructor(id, freq = 0.5) {
    super(id, "humidity", freq);
  }
  generate() {
    return { rh: +rand(30, 90).toFixed(2), unit: "%" };
  }
}

export class PressureSensor extends BaseSensor {
  constructor(id, freq = 0.2) {
    super(id, "pressure", freq);
  }
  generate() {
    return { hpa: +gauss(1013, 5).toFixed(2), unit: "hPa" };
  }
}

export class CO2Sensor extends BaseSensor {
  constructor(id, freq = 0.1) {
    super(id, "co2", freq);
  }
  generate() {
    return { ppm: +rand(350, 1200).toFixed(1), unit: "ppm" };
  }
}

export class VibrationSensor extends BaseSensor {
  constructor(id, freq = 2.0) {
    super(id, "vibration", freq);
  }
  generate() {
    return {
      x: +rand(-2, 2).toFixed(4),
      y: +rand(-2, 2).toFixed(4),
      z: +rand(9.5, 10.5).toFixed(4),
      unit: "m/s2",
    };
  }
}
