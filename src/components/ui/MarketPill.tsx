interface Props {
  market: 'NL' | 'BE';
}

export default function MarketPill({ market }: Props) {
  const isNL = market === 'NL';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        isNL
          ? 'bg-nl-blue/20 text-nl-blue border-nl-blue/30'
          : 'bg-be-amber/20 text-be-amber border-be-amber/30'
      }`}
    >
      {isNL ? 'NL' : 'BE/LU'}
    </span>
  );
}
