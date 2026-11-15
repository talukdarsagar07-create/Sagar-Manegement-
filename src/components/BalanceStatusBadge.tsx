import React from 'react';
import { getBalanceVisuals } from '../lib/accounting';
import { translateDirection } from '../lib/i18n';
import type { BalanceDirection, Language } from '../types';

interface BalanceStatusBadgeProps {
  direction: BalanceDirection;
  lang: Language;
  isMemberView?: boolean;
  className?: string;
}

export const BalanceStatusBadge: React.FC<BalanceStatusBadgeProps> = ({
  direction,
  lang,
  isMemberView = false,
  className = '',
}) => {
  const visuals = getBalanceVisuals(direction);
  const label = translateDirection(direction, lang, isMemberView);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap ${visuals.badgeClass} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${visuals.dotClass}`} />
      <span>{label}</span>
    </span>
  );
};
