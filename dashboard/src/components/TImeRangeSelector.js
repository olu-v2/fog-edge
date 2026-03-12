const RANGES = [
  { label: "1 Hour", value: 3600 },
  { label: "6 Hours", value: 21600 },
  { label: "24 Hours", value: 86400 },
  { label: "7 Days", value: 604800 },
];

export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            value === r.value
              ? "bg-sky-500 text-white"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
