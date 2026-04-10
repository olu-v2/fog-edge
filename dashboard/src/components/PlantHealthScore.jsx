// Optimal ranges — centre of healthy band for each sensor
const OPTIMAL = {
  air_temperature: { min: 18, max: 28, unit: "°C", icon: "🌡️" },
  humidity: { min: 55, max: 80, unit: "% RH", icon: "💧" },
  co2: { min: 600, max: 1200, unit: "ppm", icon: "🌫️" },
  par_light: { min: 200, max: 800, unit: "µmol/m²/s", icon: "☀️" },
  soil_moisture: { min: 40, max: 70, unit: "% VWC", icon: "🪴" },
};

// Hard limits — beyond these, sensor scores 0
const LIMITS = {
  air_temperature: { min: 5, max: 45 },
  humidity: { min: 20, max: 95 },
  co2: { min: 300, max: 2000 },
  par_light: { min: 0, max: 3000 },
  soil_moisture: { min: 10, max: 95 },
};

function scoreSensor(type, value) {
  const opt = OPTIMAL[type];
  const limit = LIMITS[type];
  if (!opt || value === undefined || value === null) return null;

  // Within optimal range → full score
  if (value >= opt.min && value <= opt.max) return 100;

  // Outside hard limit → zero
  if (value < limit.min || value > limit.max) return 0;

  // Between optimal and limit → linear scale
  if (value < opt.min) {
    return Math.round(((value - limit.min) / (opt.min - limit.min)) * 100);
  }
  return Math.round(((limit.max - value) / (limit.max - opt.max)) * 100);
}

function scoreColor(score) {
  if (score >= 80) return "text-green-400";
  if (score >= 55) return "text-yellow-400";
  return "text-red-400";
}

function barColor(score) {
  if (score >= 80) return "bg-green-500";
  if (score >= 55) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreLabel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 55) return "Fair";
  if (score >= 35) return "Poor";
  return "Critical";
}

export default function PlantHealthScore({ latestByType }) {
  const sensorTypes = Object.keys(OPTIMAL);

  // Compute individual scores
  const scores = sensorTypes.map((type) => {
    const reading = latestByType[type];
    const value = reading ? parseFloat(reading.mean) : null;
    const score = scoreSensor(type, value);
    return { type, value, score };
  });

  const available = scores.filter((s) => s.score !== null);
  const overall =
    available.length > 0
      ? Math.round(
          available.reduce((sum, s) => sum + s.score, 0) / available.length,
        )
      : null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        {/* Overall score dial */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              {/* Background track */}
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke="rgb(51 65 85)"
                strokeWidth="3"
              />
              {/* Score arc */}
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke={
                  overall >= 75
                    ? "rgb(34 197 94)"
                    : overall >= 55
                      ? "rgb(234 179 8)"
                      : "rgb(239 68 68)"
                }
                strokeWidth="3"
                strokeDasharray={`${overall ?? 0} 100`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`text-xl font-bold tabular-nums leading-none
                ${overall !== null ? scoreColor(overall) : "text-slate-500"}`}
              >
                {overall ?? "—"}
              </span>
              <span className="text-slate-500 text-xs leading-none">/100</span>
            </div>
          </div>
          <div>
            <p className="text-white font-semibold text-base">
              Plant Health Score
            </p>
            <p
              className={`text-sm font-medium ${overall !== null ? scoreColor(overall) : "text-slate-500"}`}
            >
              {overall !== null ? scoreLabel(overall) : "Awaiting data…"}
            </p>
            <p className="text-slate-600 text-xs mt-0.5">
              {available.length}/{sensorTypes.length} sensors reporting
            </p>
          </div>
        </div>

        {/* Per-sensor breakdown */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-3">
          {scores.map(({ type, value, score }) => (
            <div key={type} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs flex items-center gap-1">
                  {OPTIMAL[type].icon}{" "}
                  {type.replace(/_/g, " ").replace("air ", "")}
                </span>
                <span
                  className={`text-xs font-semibold tabular-nums
                  ${score !== null ? scoreColor(score) : "text-slate-600"}`}
                >
                  {score !== null ? score : "—"}
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700
                    ${score !== null ? barColor(score) : "bg-slate-600"}`}
                  style={{ width: `${score ?? 0}%` }}
                />
              </div>
              <p className="text-slate-600 text-xs tabular-nums">
                {value !== null
                  ? `${value?.toFixed(1)} ${OPTIMAL[type].unit}`
                  : "No data"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
