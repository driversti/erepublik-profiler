interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

function StatCard({ label, value, subtitle, color }: StatCardProps) {
  return (
    <div className="bg-surface rounded-lg border shadow-card p-4">
      <div className="text-sm text-secondary mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-primary'}`}>{value}</div>
      {subtitle && <div className="text-xs text-tertiary mt-1">{subtitle}</div>}
    </div>
  );
}

export default StatCard;
