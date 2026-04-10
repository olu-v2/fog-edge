const STATUS_STYLES = {
  live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  loading: "bg-slate-700/50 text-slate-400 border-slate-600",
  error: "bg-red-500/10 text-red-400 border-red-500/30",
  connecting: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  disconnected: "bg-red-500/10 text-red-400 border-red-500/30",
  connected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

const STATUS_DOT = {
  live: "bg-emerald-400",
  loading: "bg-slate-400",
  error: "bg-red-400",
  connecting: "bg-amber-400 animate-pulse",
  disconnected: "bg-red-400",
  connected: "bg-emerald-400",
};

export default function StatusPill({ status }) {
  return (
    <span
      className={`badge border ${STATUS_STYLES[status] ?? STATUS_STYLES.loading}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${STATUS_DOT[status] ?? "bg-slate-400"}`}
      />
      {status}
    </span>
  );
}
