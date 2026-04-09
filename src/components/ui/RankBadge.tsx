interface Props {
  rank: number;
}

export default function RankBadge({ rank }: Props) {
  if (rank > 3) return <span className="text-xs text-gray-500">#{rank}</span>;

  const colors: Record<number, string> = {
    1: 'bg-warning/20 text-warning border-warning/30',
    2: 'bg-gray-400/20 text-gray-300 border-gray-400/30',
    3: 'bg-amber-700/20 text-amber-600 border-amber-700/30',
  };

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${colors[rank]}`}
    >
      {rank}
    </span>
  );
}
