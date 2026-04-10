interface Props {
  rank: number;
}

export default function RankBadge({ rank }: Props) {
  if (rank > 3) return <span className="text-xs text-dark/30 font-light">#{rank}</span>;

  const colors: Record<number, string> = {
    1: 'bg-warning/10 text-warning',
    2: 'bg-dark/5 text-dark/40',
    3: 'bg-amber-700/10 text-amber-700',
  };

  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${colors[rank]}`}
    >
      {rank}
    </span>
  );
}
