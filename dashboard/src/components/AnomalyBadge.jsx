export default function AnomalyBadge({ count }) {
  if (!count) return null;
  return (
    <span
      className="ml-2 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400
                     text-xs font-semibold border border-red-500/40"
    >
      ⚠ {count} anomal{count === 1 ? "y" : "ies"}
    </span>
  );
}
