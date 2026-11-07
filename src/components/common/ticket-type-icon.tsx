import { BookOpen, Bug, FlaskConical, Layers, Target } from 'lucide-react';
import type { TicketType } from '@/domain';
import { cn } from '@/lib/cn';

const TYPES = {
  story: { icon: BookOpen, color: 'text-emerald-600 dark:text-emerald-400', label: 'Story' },
  epic: { icon: Layers, color: 'text-violet-600 dark:text-violet-400', label: 'Epic' },
  initiative: { icon: Target, color: 'text-amber-600 dark:text-amber-400', label: 'Initiative' },
  bug: { icon: Bug, color: 'text-rose-600 dark:text-rose-400', label: 'Bug' },
  spike: { icon: FlaskConical, color: 'text-sky-600 dark:text-sky-400', label: 'Spike' },
} as const;
export const ticketTypeColor = (type: TicketType) => TYPES[type].color;
export function TicketTypeIcon({ type, className }: { type: TicketType; className?: string }) {
  const { icon: Icon, color, label } = TYPES[type];
  return <Icon role="img" aria-label={label} className={cn('size-3.5 shrink-0', color, className)} />;
}
