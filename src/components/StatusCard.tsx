import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "success" | "warning" | "info";
}

const variantStyles = {
  default: "bg-card border-border",
  success: "bg-card border-l-4 border-l-success border-t-0 border-r-0 border-b-0",
  warning: "bg-card border-l-4 border-l-warning border-t-0 border-r-0 border-b-0",
  info: "bg-card border-l-4 border-l-info border-t-0 border-r-0 border-b-0",
};

const iconVariantStyles = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
};

export function StatusCard({ title, value, subtitle, icon: Icon, variant = "default" }: StatusCardProps) {
  return (
    <div className={`rounded-lg border p-5 shadow-sm ${variantStyles[variant]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className={`h-5 w-5 ${iconVariantStyles[variant]}`} />
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
