export class BaseSensor {
  constructor(sensorId, sensorType, frequencyHz = 1.0) {
    this.sensorId = sensorId;
    this.sensorType = sensorType;
    this.frequencyHz = frequencyHz;
    this._timer = null;
  }

  generate() {
    throw new Error("generate() must be implemented");
  }

  start(callback) {
    const intervalMs = Math.floor(1000 / this.frequencyHz);
    this._timer = setInterval(() => {
      const payload = {
        sensor_id: this.sensorId,
        type: this.sensorType,
        timestamp: Date.now() / 1000,
        data: this.generate(),
      };
      callback(payload);
    }, intervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}
