import { useState, useEffect } from "react";
import SensorCard from "./components/SensorCard.jsx";
import TimeRangeSelector from "./components/TImeRangeSelector.js";
import { connectWS } from "./ws.js";

const SENSOR_TYPES = [
  "temperature",
  "humidity",
  "pressure",
  "co2",
  "vibration",
];
const WS_URL = import.meta.env.VITE_WS_URL;

export default function App() {
  const [timeRange, setTimeRange] = useState(3600); // default: 1 hour
  const [wsStatus, setWsStatus] = useState("connecting");

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("error");
    connectWS(WS_URL);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sky-400">🌡 FogStream IoT</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Live sensor data via fog-node-01
            <span
              className={`ml-2 text-xs ${
                wsStatus === "connected" ? "text-green-400" : "text-red-400"
              }`}
            >
              ● {wsStatus}
            </span>
          </p>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Sensor Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {SENSOR_TYPES.map((t) => (
          <SensorCard key={t} stype={t} timeRange={timeRange} />
        ))}
      </div>
    </div>
  );
}
