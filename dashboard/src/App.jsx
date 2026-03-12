import { useState, useEffect } from "react";
import SensorCard from "./components/SensorCard.jsx";
import TimeRangeSelector from "./components/TImeRangeSelector.jsx";
import StatusPill from "./components/StatusPill.jsx";
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
  const [timeRange, setTimeRange] = useState(3600);
  const [wsStatus, setWsStatus] = useState("connecting");

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("error");
    connectWS(WS_URL);
    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              FogStream IoT
            </h1>
            <StatusPill status={wsStatus} />
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Real-time sensor monitoring via fog-node-01
          </p>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </header>

      {/* Sensor grid */}
      <main className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {SENSOR_TYPES.map((t) => (
          <SensorCard
            key={`${t}-${timeRange}`}
            stype={t}
            timeRange={timeRange}
          />
        ))}
      </main>

      {/* Footer */}
      <footer className="mt-10 text-center text-slate-700 text-xs">
        FogStream IoT · Data retained for 7 days · Anomalies detected via
        z-score
      </footer>
    </div>
  );
}
