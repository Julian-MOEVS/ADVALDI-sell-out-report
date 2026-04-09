import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string | number;
  sub?: ReactNode;
  icon?: ReactNode;
}

export default function StatCard({ label, value, sub, icon }: Props) {
  return (
    <div className="bg-bg2 border border-white/5 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-gray-400">
          {label}
        </span>
        {icon && <span className="text-gray-500">{icon}</span>}
      </div>
      <span className="text-2xl font-mono font-medium">{value}</span>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
