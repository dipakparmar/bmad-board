import { Bot, ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { Ticket } from '@/app/view-model';
import { handoffs, type Handoff } from '@/domain';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';

export async function copyHandoff(h: Handoff) {
  try {
    await navigator.clipboard.writeText(h.prompt);
    toast.success('Prompt copied', { description: `Paste it into Claude Code to run ${h.skill}: "${h.prompt}"` });
  } catch {
    toast.message(h.prompt, { description: `Copy this into Claude Code to run ${h.skill}.` });
  }
}

export function ticketHandoffs(t: Ticket): Handoff[] {
  return handoffs(t.leaf, t.ref, t.readiness);
}

/** One primary hand-off button, with the rest in a menu. */
export function HandoffMenu({ ticket, size = 'xs' }: { ticket: Ticket; size?: 'xs' | 'sm' }) {
  const all = ticketHandoffs(ticket);
  const [first, ...rest] = all;
  if (!first) return null;
  return (
    <div className="flex items-center">
      <Button size={size} variant="outline" className={rest.length ? 'rounded-r-none' : ''} onClick={(e) => { e.stopPropagation(); void copyHandoff(first); }} title={first.why}>
        <Bot />{first.label}
      </Button>
      {rest.length > 0 && (
        <Menu>
          <MenuTrigger render={<Button size={size} variant="outline" className="-ml-px rounded-l-none px-1" aria-label="More hand-offs" onClick={(e) => e.stopPropagation()}><ChevronDown /></Button>} />
          <MenuPopup align="end">
            {rest.map((h) => <MenuItem key={h.label} onClick={() => void copyHandoff(h)}><Copy />{h.label}<span className="ml-2 text-xs text-muted-foreground">{h.skill}</span></MenuItem>)}
          </MenuPopup>
        </Menu>
      )}
    </div>
  );
}
