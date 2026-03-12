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
  temperature: "°C",
  humidity: "%RH",
  pressure: "hPa",
  co2: "ppm",
  vibration: "m/s²",
};

const ICONS = {
  temperature: "🌡",
  humidity: "💧",
  pressure: "🔵",
  co2: "🌿",
  vibration: "📳",
};

const API_BASE = import.meta.env.VITE_API_URL;

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
      <p className="text-brand-400 font-semibold">
        Mean: {d.mean} {UNITS[d.stype]}
      </p>
      <p className="text-slate-400">
        Min: {d.min} · Max: {d.max}
      </p>
      {d.anomaly && (
        <p className="text-red-400 font-semibold mt-1">⚠ Anomaly detected</p>
      )}
    </div>
  );
}

export default function SensorCard({ stype, timeRange }) {
  const [readings, setReadings] = useState([]);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    setStatus("loading");
    const since = Math.floor(Date.now() / 1000) - timeRange;
    fetch(`${API_BASE}?type=${stype}&since=${since}`)
      .then((r) => r.json())
      .then((data) => {
        const items = (data.readings ?? []).map((r) => ({
          time: new Date(r.timestamp * 1000).toLocaleTimeString(),
          mean: parseFloat(r.mean) || 0,
          min: parseFloat(r.min) || 0,
          max: parseFloat(r.max) || 0,
          anomaly: r.anomaly ?? false,
          stype,
        }));
        setReadings(items);
        setAnomalyCount(items.filter((r) => r.anomaly).length);
        setStatus("live");
      })
      .catch(() => setStatus("error"));
  }, [stype, timeRange]);

  useEffect(() => {
    const handler = (msg) => {
      if (msg.type !== "reading" || msg.payload.type !== stype) return;
      const r = msg.payload;
      const point = {
        time: new Date(r.timestamp * 1000).toLocaleTimeString(),
        mean: r.mean ?? 0,
        min: r.min ?? 0,
        max: r.max ?? 0,
        anomaly: r.anomaly ?? false,
        stype,
      };
      setReadings((prev) => [...prev.slice(-99), point]);
      if (point.anomaly) setAnomalyCount((c) => c + 1);
    };
    onMessage(handler);
    return () => offMessage(handler);
  }, [stype]);

  const latest = readings[readings.length - 1];
  const isAnomaly = latest?.anomaly ?? false;

  return (
    <div
      className={`card transition-all duration-300 ${
        isAnomaly ? "border-red-500/50 shadow-lg shadow-red-500/10" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{ICONS[stype]}</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {stype}
          </h3>
          <AnomalyBadge count={anomalyCount} />
        </div>
        <StatusPill status={status} />
      </div>

      {/* Current reading */}
      {latest ? (
        <div className="mb-5">
          <div className="flex items-baseline gap-1">
            <span
              className={`stat-value ${isAnomaly ? "text-red-400" : "text-white"}`}
            >
              {latest.mean.toFixed(2)}
            </span>
            <span className="stat-unit">{UNITS[stype]}</span>
            {isAnomaly && (
              <span
                className="ml-2 badge bg-red-500/10 text-red-400
                               border border-red-500/30 animate-pulse-slow"
              >
                ANOMALY
              </span>
            )}
          </div>
          <p className="stat-sub">
            Min: {latest.min} &nbsp;·&nbsp; Max: {latest.max}
          </p>
        </div>
      ) : (
        <div className="mb-5 h-10 flex items-center">
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
            stroke="rgb(51 65 85)" // slate-700
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{ fill: "rgb(100 116 139)", fontSize: 9 }} // slate-500
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
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
            stroke="rgb(56 189 248)" // brand-400 / sky-400
            strokeWidth={2}
            dot={<AnomalyDot />}
            activeDot={{ r: 4, fill: "rgb(56 189 248)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
