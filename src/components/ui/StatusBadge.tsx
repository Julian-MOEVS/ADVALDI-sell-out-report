interface Props {
  sales: number;
  stock: number;
}

export default function StatusBadge({ sales, stock }: Props) {
  if (stock === 0 && sales === 0) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-danger/10 text-danger">
        Geen voorraad
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-danger/10 text-danger">
        Uitverkocht
      </span>
    );
  }
  if (stock <= 2) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/10 text-warning">
        Lage voorraad
      </span>
    );
  }
  if (sales > 0) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success">
        Actief
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-dark/5 text-dark/40">
      Op voorraad
    </span>
  );
}
