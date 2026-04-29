interface Props {
  channel: string;
}

const CHANNEL_STYLES: Record<string, string> = {
  'Shopify': 'bg-success/10 text-success',
  'Brincr': 'bg-info/10 text-info',
  'MM-NL': 'bg-accent/10 text-accent',
  'MM-BE': 'bg-be-amber/10 text-be-amber',
  'FNAC': 'bg-warning/10 text-warning',
  'Vanden Borre': 'bg-danger/10 text-danger',
};

export default function ChannelPill({ channel }: Props) {
  if (!channel) return <span className="text-xs text-dark/30">—</span>;
  const style = CHANNEL_STYLES[channel] || 'bg-bg4 text-dark/60';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {channel}
    </span>
  );
}
