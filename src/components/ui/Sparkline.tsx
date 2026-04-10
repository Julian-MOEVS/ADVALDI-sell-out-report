interface Props {
  values: number[];
}

export default function Sparkline({ values }: Props) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-px h-6">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm bg-accent"
          style={{
            height: `${Math.max((v / max) * 100, 4)}%`,
            opacity: v === 0 ? 0.15 : 0.7,
          }}
        />
      ))}
    </div>
  );
}
