interface SystemStatusBadgeProps {
  status: "online" | "offline" | "degraded";
  label: string;
}

const statusStyles = {
  online: "bg-success/10 text-success",
  offline: "bg-destructive/10 text-destructive",
  degraded: "bg-warning/10 text-warning",
};

const dotStyles = {
  online: "bg-success",
  offline: "bg-destructive",
  degraded: "bg-warning",
};

export function SystemStatusBadge({ status, label }: SystemStatusBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${statusStyles[status]}`}>
      <span className={`h-2 w-2 rounded-full animate-pulse ${dotStyles[status]}`} />
      {label}
    </div>
  );
}
