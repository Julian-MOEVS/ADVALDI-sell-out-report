interface Props {
  channel: string;
}

const CHANNEL_STYLES: Record<string, string> = {
  shopify: 'bg-success/10 text-success',
  brincr: 'bg-info/10 text-info',
  'mm-nl': 'bg-accent/10 text-accent',
  'mm-be': 'bg-be-amber/10 text-be-amber',
  fnac: 'bg-warning/10 text-warning',
  'vanden borre': 'bg-danger/10 text-danger',
};

function styleKey(channel: string): string {
  const v = channel.toLowerCase().trim();
  if (v.startsWith('shopify')) return 'shopify';
  return v;
}

export default function ChannelPill({ channel }: Props) {
  if (!channel) return <span className="text-xs text-dark/30">—</span>;
  const style = CHANNEL_STYLES[styleKey(channel)] || 'bg-bg4 text-dark/60';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {channel}
    </span>
  );
}
