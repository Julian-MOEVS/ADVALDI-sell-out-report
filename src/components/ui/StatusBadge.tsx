interface Props {
  sales: number;
  stock: number;
}

export default function StatusBadge({ sales, stock }: Props) {
  if (stock === 0 && sales === 0) {
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-danger/20 text-danger border border-danger/30">
        Geen voorraad
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-danger/20 text-danger border border-danger/30">
        Uitverkocht
      </span>
    );
  }
  if (stock <= 2) {
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-warning/20 text-warning border border-warning/30">
        Lage voorraad
      </span>
    );
  }
  if (sales > 0) {
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-success/20 text-success border border-success/30">
        Actief
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30">
      Op voorraad
    </span>
  );
}
