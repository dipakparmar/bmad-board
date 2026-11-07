import { Bot, GitCommitHorizontal, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PersonKindIcon({ agent, className }: { agent: boolean; className?: string }) {
  const Icon = agent ? Bot : UserRound;
  const label = agent ? 'Agent' : 'Person';
  return <span role="img" aria-label={label} title={label} className={cn('inline-flex shrink-0 items-center', agent ? 'text-info' : 'text-muted-foreground', className)}><Icon aria-hidden="true" className="size-3.5" /></span>;
}

export function CommitCount({ count, context, className }: { count: number; context?: string; className?: string }) {
  const label = `${count} commit${count === 1 ? '' : 's'}${context ? ` ${context}` : ''}`;
  return <span role="img" aria-label={label} title={label} className={cn('inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground', className)}><GitCommitHorizontal aria-hidden="true" className="size-3.5" /><span aria-hidden="true">{count}</span></span>;
}
