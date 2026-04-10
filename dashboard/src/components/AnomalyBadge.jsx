export default function AnomalyBadge({ count }) {
  if (!count) return null;
  return (
    <span className="badge bg-red-500/10 text-red-400 border border-red-500/30 ml-2">
      <span className="mr-1">⚠</span>
      {count} anomal{count === 1 ? "y" : "ies"}
    </span>
  );
}
