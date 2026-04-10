export class BaseSensor {
  constructor(
    sensorId,
    sensorType,
    frequencyHz = 1.0,
    {
      dropoutRate = 0.02,
      spikeRate = 0.01,
      location = "Zone A", // ← new
      firmware = "1.0.0", // ← new
    } = {},
  ) {
    this.sensorId = sensorId;
    this.sensorType = sensorType;
    this.frequencyHz = frequencyHz;
    this.dropoutRate = dropoutRate;
    this.spikeRate = spikeRate;
    this.location = location; // ← new
    this.firmwareVersion = firmware; // ← new
    this._timer = null;
  }

  generate() {
    throw new Error("generate() must be implemented");
  }

  start(callback) {
    const intervalMs = Math.floor(1000 / this.frequencyHz);
    this._timer = setInterval(() => {
      // Simulate packet loss
      if (Math.random() < this.dropoutRate) {
        console.log(`[SENSOR] ${this.sensorId} dropped packet (simulated)`);
        return;
      }

      const data = this.generate();

      // Simulate spike
      if (Math.random() < this.spikeRate) {
        const key = Object.keys(data)[0];
        data[key] = +(data[key] * 10).toFixed(2);
        console.log(
          `[SENSOR] ${this.sensorId} spike injected → ${key}: ${data[key]}`,
        );
      }

      callback({
        sensor_id: this.sensorId,
        type: this.sensorType,
        timestamp: Date.now() / 1000,
        location: this.location, // ← new
        firmware_version: this.firmwareVersion, // ← new
        data,
      });
    }, intervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}
