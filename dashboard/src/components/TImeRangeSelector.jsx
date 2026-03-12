const RANGES = [
  { label: "1h", value: 3600 },
  { label: "6h", value: 21600 },
  { label: "24h", value: 86400 },
  { label: "7d", value: 604800 },
];

export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`btn ${value === r.value ? "btn-active" : "btn-inactive"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
