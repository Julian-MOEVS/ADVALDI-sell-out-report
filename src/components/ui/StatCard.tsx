import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string | number;
  sub?: ReactNode;
  icon?: ReactNode;
}

export default function StatCard({ label, value, sub, icon }: Props) {
  return (
    <div className="bg-white border border-bg4 rounded-3xl p-5 flex flex-col gap-1.5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-dark/40 font-semibold">
          {label}
        </span>
        {icon && <span className="text-accent-light">{icon}</span>}
      </div>
      <span className="text-2xl font-semibold text-dark">{value}</span>
      {sub && <div className="text-xs text-dark/40 font-light">{sub}</div>}
    </div>
  );
}
