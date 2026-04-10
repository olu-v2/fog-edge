import { useState, useEffect } from "react";
import SensorCard from "./components/SensorCard.jsx";
import TimeRangeSelector from "./components/TimeRangeSelector.jsx";
import StatusPill from "./components/StatusPill.jsx";
import PlantHealthScore from "./components/PlantHealthScore.jsx";
import { connectWS, onMessage, offMessage } from "./ws.js";

const SENSOR_TYPES = [
  "air_temperature",
  "humidity",
  "co2",
  "par_light",
  "soil_moisture",
];
const ZONES = ["All Zones", "Zone A", "Zone B", "Zone C"];
const WS_URL = import.meta.env.VITE_WS_URL;

export default function App() {
  const [timeRange, setTimeRange] = useState(3600);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [activeZone, setActiveZone] = useState("All Zones"); // ← new
  const [latestByType, setLatestByType] = useState({}); // ← new: for health score

  // WebSocket connection
  useEffect(() => {
    const ws = connectWS(WS_URL);
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("error");
    return () => ws?.close();
  }, []);

  // Collect latest reading per sensor type for the health score
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type !== "reading") return;
      const r = msg.payload;
      // Filter by active zone if one is selected
      if (activeZone !== "All Zones" && !r.locations?.includes(activeZone))
        return;
      setLatestByType((prev) => ({ ...prev, [r.type]: r }));
    };
    onMessage(handler);
    return () => offMessage(handler);
  }, [activeZone]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              🌿 Greenhouse Monitor
            </h1>
            <StatusPill status={wsStatus} />
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Real-time sensor monitoring via fog-node-01
          </p>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </header>
      {/* Plant Health Score */}
      <PlantHealthScore latestByType={latestByType} /> {/* ← new */}
      {/* Zone Filter Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {" "}
        {/* ← new */}
        {ZONES.map((zone) => (
          <button
            key={zone}
            onClick={() => setActiveZone(zone)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${
                activeZone === zone
                  ? "bg-green-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
          >
            {zone}
          </button>
        ))}
      </div>
      {/* Sensor Grid */}
      <main className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {SENSOR_TYPES.map((t) => (
          <SensorCard
            key={`${t}-${timeRange}`}
            stype={t}
            timeRange={timeRange}
            activeZone={activeZone}
          />
        ))}
      </main>
      <footer className="mt-10 text-center text-slate-700 text-xs">
        FogStream IoT · Greenhouse Edition · Data retained for 7 days ·
        Anomalies via Z-score
      </footer>
    </div>
  );
}
