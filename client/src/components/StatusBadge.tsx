type Status = 'online' | 'offline' | 'away';

const statusConfig: Record<Status, { color: string; label: string }> = {
  online: { color: 'bg-green-500', label: 'Online' },
  offline: { color: 'bg-gray-400', label: 'Offline' },
  away: { color: 'bg-yellow-500', label: 'Away' },
};

export function StatusBadge({ status }: { status: Status }) {
  const { color, label } = statusConfig[status];

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
