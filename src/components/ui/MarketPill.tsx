interface Props {
  market: 'NL' | 'BE';
}

export default function MarketPill({ market }: Props) {
  const isNL = market === 'NL';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        isNL
          ? 'bg-accent/10 text-accent'
          : 'bg-be-amber/10 text-be-amber'
      }`}
    >
      {isNL ? 'Nederland' : 'België/Luxemburg'}
    </span>
  );
}
