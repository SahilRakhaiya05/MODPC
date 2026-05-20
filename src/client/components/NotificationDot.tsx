import React from 'react';

type Tone = 'alert' | 'info' | 'neutral';

type Props = {
  count: number;
  tone?: Tone;
  label?: string;
  max?: number;
};

export const NotificationDot: React.FC<Props> = ({ count, tone = 'alert', label, max = 99 }) => {
  if (!Number.isFinite(count) || count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);
  return (
    <span className={`notification-dot tone-${tone}`} role="status" aria-label={label ?? `${count} unread`}>
      {display}
    </span>
  );
};
