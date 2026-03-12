import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Dot,
} from "recharts";
import { onMessage, offMessage } from "../ws.js";
import AnomalyBadge from "./AnomalyBadge.jsx";

const UNITS = {
  temperature: "°C",
  humidity: "%RH",
  pressure: "hPa",
  co2: "ppm",
  vibration: "m/s²",
};

const API_BASE = import.meta.env.VITE_API_URL;

// Custom dot — red for anomalies, normal otherwise
function AnomalyDot(props) {
  const { cx, cy, payload } = props;
  if (!payload?.anomaly) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="#ef4444"
      stroke="#fff"
      strokeWidth={1.5}
    />
  );
}

export default function SensorCard({ stype, timeRange }) {
  const [readings, setReadings] = useState([]);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [status, setStatus] = useState("loading");

  // Fetch historical data when timeRange changes
  useEffect(() => {
    const since = Math.floor(Date.now() / 1000) - timeRange;
    fetch(`${API_BASE}?type=${stype}&since=${since}`)
      .then((r) => r.json())
      .then((data) => {
        const items = data.readings ?? [];
        setReadings(
          items.map((r) => ({
            time: new Date(r.timestamp * 1000).toLocaleTimeString(),
            mean: parseFloat(r.mean) || 0,
            min: parseFloat(r.min) || 0,
            max: parseFloat(r.max) || 0,
            anomaly: r.anomaly ?? false,
          })),
        );
        setAnomalyCount(items.filter((r) => r.anomaly).length);
        setStatus("live");
      })
      .catch(() => setStatus("error"));
  }, [stype, timeRange]);

  // Live WebSocket updates
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type !== "reading") return;
      const r = msg.payload;
      if (r.type !== stype) return;

      const point = {
        time: new Date(r.timestamp * 1000).toLocaleTimeString(),
        mean: r.mean ?? 0,
        min: r.min ?? 0,
        max: r.max ?? 0,
        anomaly: r.anomaly ?? false,
      };

      setReadings((prev) => [...prev.slice(-99), point]); // keep last 100
      if (point.anomaly) setAnomalyCount((c) => c + 1);
    };

    onMessage(handler);
    return () => offMessage(handler);
  }, [stype]);

  const latest = readings[readings.length - 1];

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <h3 className="text-sky-400 text-xs font-bold uppercase tracking-widest">
            {stype}
          </h3>
          <AnomalyBadge count={anomalyCount} />
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            status === "live"
              ? "bg-green-500/20 text-green-400"
              : status === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-slate-600 text-slate-400"
          }`}
        >
          {status === "live" ? "● live" : status}
        </span>
      </div>

      {/* Current value */}
      {latest ? (
        <div className="mb-4">
          <span
            className={`text-3xl font-bold ${latest.anomaly ? "text-red-400" : "text-white"}`}
          >
            {latest.mean.toFixed(2)}
          </span>
          <span className="text-slate-400 text-sm ml-1">{UNITS[stype]}</span>
          {latest.anomaly && (
            <span className="ml-2 text-red-400 text-xs font-semibold animate-pulse">
              ⚠ ANOMALY
            </span>
          )}
          <div className="text-slate-500 text-xs mt-1">
            Min: {latest.min} · Max: {latest.max}
          </div>
        </div>
      ) : (
        <div className="text-slate-500 text-sm mb-4">Awaiting data…</div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={160}>
        <LineChart
          data={readings}
          margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#64748b", fontSize: 9 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fill: "#64748b", fontSize: 9 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "11px",
            }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#7dd3fc" }}
          />
          <Line
            type="monotone"
            dataKey="mean"
            stroke="#38bdf8"
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
