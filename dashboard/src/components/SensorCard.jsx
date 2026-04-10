import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { onMessage, offMessage } from "../ws.js";
import AnomalyBadge from "./AnomalyBadge.jsx";
import StatusPill from "./StatusPill.jsx";

const UNITS = {
  air_temperature: "°C",
  humidity: "% RH",
  co2: "ppm",
  par_light: "µmol/m²/s",
  soil_moisture: "% VWC",
};

const ICONS = {
  air_temperature: "🌡️",
  humidity: "💧",
  co2: "🌫️",
  par_light: "☀️",
  soil_moisture: "🪴",
};

function AnomalyDot({ cx, cy, payload }) {
  if (!payload?.anomaly) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      className="fill-red-500 stroke-white stroke-2"
    />
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-sky-400 font-semibold">
        Mean: {d.mean} {UNITS[d.stype]}
      </p>
      <p className="text-slate-400">
        Min: {d.min} · Max: {d.max}
      </p>
      {d.locations?.length > 0 && (
        <p className="text-green-400 mt-1">Zone: {d.locations.join(", ")}</p>
      )}
      {d.anomaly && (
        <p className="text-red-400 font-semibold mt-1">⚠️ Anomaly detected</p>
      )}
    </div>
  );
}

export default function SensorCard({ stype, timeRange, activeZone }) {
  const [readings, setReadings] = useState([]);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [status, setStatus] = useState("loading");
  const [zones, setZones] = useState([]); // ← new: track zones seen

  const API_BASE = import.meta.env.VITE_API_URL;

  // Fetch historical data — include zone param if filtered
  useEffect(() => {
    setStatus("loading");
    const since = Math.floor(Date.now() / 1000) - timeRange;
    const zoneParam =
      activeZone !== "All Zones"
        ? `&zone=${encodeURIComponent(activeZone)}`
        : "";

    fetch(`${API_BASE}?type=${stype}&since=${since}${zoneParam}`)
      .then((r) => r.json())
      .then((data) => {
        const items = (data.readings ?? []).map((r) => ({
          time: new Date(r.timestamp * 1000).toLocaleTimeString(),
          mean: parseFloat(r.mean) || 0,
          min: parseFloat(r.min) || 0,
          max: parseFloat(r.max) || 0,
          anomaly: r.anomaly ?? false,
          locations: r.locations ?? [],
          stype,
        }));
        setReadings(items);
        setAnomalyCount(items.filter((r) => r.anomaly).length);
        // Collect all unique zones from history
        const allZones = [...new Set(items.flatMap((r) => r.locations))].filter(
          Boolean,
        );
        setZones(allZones);
        setStatus("live");
      })
      .catch(() => setStatus("error"));
  }, [stype, timeRange, activeZone]);

  // Live WebSocket updates
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type !== "reading" || msg.payload.type !== stype) return;
      const r = msg.payload;

      // Respect zone filter on live updates too
      if (activeZone !== "All Zones" && !r.locations?.includes(activeZone))
        return;

      const point = {
        time: new Date(r.timestamp * 1000).toLocaleTimeString(),
        mean: parseFloat(r.mean) || 0,
        min: parseFloat(r.min) || 0,
        max: parseFloat(r.max) || 0,
        anomaly: r.anomaly ?? false,
        locations: r.locations ?? [],
        stype,
      };
      setReadings((prev) => [...prev.slice(-99), point]);
      setZones((prev) =>
        [...new Set([...prev, ...point.locations])].filter(Boolean),
      );
      if (point.anomaly) setAnomalyCount((c) => c + 1);
    };
    onMessage(handler);
    return () => offMessage(handler);
  }, [stype, activeZone]);

  const latest = readings[readings.length - 1];
  const isAnomaly = latest?.anomaly ?? false;

  return (
    <div
      className={`bg-slate-800 rounded-xl p-5 border transition-all duration-300
      ${
        isAnomaly
          ? "border-red-500/50 shadow-lg shadow-red-500/10"
          : "border-slate-700"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{ICONS[stype]}</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {stype.replace(/_/g, " ")}
          </h3>
          <AnomalyBadge count={anomalyCount} />
        </div>
        <StatusPill status={status} />
      </div>

      {/* Current value */}
      {latest ? (
        <div className="mb-4">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-3xl font-bold tabular-nums
              ${isAnomaly ? "text-red-400" : "text-white"}`}
            >
              {latest.mean.toFixed(2)}
            </span>
            <span className="text-slate-400 text-sm">{UNITS[stype]}</span>
            {isAnomaly && (
              <span className="ml-2 text-red-400 text-xs font-semibold animate-pulse">
                ⚠️ ANOMALY
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Min {latest.min} · Max {latest.max} · {readings.length} readings
          </p>
          {/* Zone badges ← new */}
          {zones.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {zones.map((z) => (
                <span
                  key={z}
                  className="text-xs px-2 py-0.5 rounded-full bg-green-500/10
                             text-green-400 border border-green-500/20"
                >
                  {z}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 h-10 flex items-center">
          <p className="text-slate-600 text-sm">Awaiting data…</p>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={150}>
        <LineChart
          data={readings}
          margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgb(51 65 85)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{ fill: "rgb(100 116 139)", fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "rgb(100 116 139)", fontSize: 9 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="mean"
            stroke="rgb(56 189 248)"
            strokeWidth={2}
            dot={<AnomalyDot />}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
