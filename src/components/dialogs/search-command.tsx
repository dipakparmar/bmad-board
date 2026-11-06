/** ⌘K: jump to any ticket by ref, title, epic or assignee (Kaneo's search command menu). */
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useBoardContext } from '@/app/board-context';
import type { Ticket } from '@/app/view-model';
import { Command, CommandCollection, CommandDialog, CommandDialogPopup, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList, CommandPanel } from '@/components/ui/command';
import { StateIcon } from '../board/chips';

export function SearchCommand() {
  const { dialog, setDialog, tickets, select } = useBoardContext();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDialog(dialog === 'search' ? null : 'search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, setDialog]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = tickets.filter((t) => !q || `${t.ref} ${t.leaf.title} ${t.epic?.title ?? ''} ${t.leaf.plan?.assignee ?? ''}`.toLowerCase().includes(q)).slice(0, 50);
    const byEpic = new Map<string, Ticket[]>();
    for (const t of hits) {
      const k = t.epic?.title ?? (t.leaf.folder === 'backlog' ? 'Backlog' : t.initiative?.title ?? 'Tickets');
      byEpic.set(k, [...(byEpic.get(k) ?? []), t]);
    }
    return [...byEpic].map(([label, items]) => ({ value: label, label, items }));
  }, [tickets, query]);

  return (
    <CommandDialog open={dialog === 'search'} onOpenChange={(open) => setDialog(open ? 'search' : null)}>
      <CommandDialogPopup>
        <Command items={groups} filter={null}>
          <CommandInput placeholder="Search tickets by ref, title, epic or assignee" value={query} onChange={(e) => setQuery(e.target.value)} />
          <CommandPanel>
            <CommandEmpty>
              <div className="py-6 text-center"><Search className="mx-auto mb-2 size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">No tickets match</p></div>
            </CommandEmpty>
            <CommandList>
              {(group: (typeof groups)[number]) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel>{group.label}</CommandGroupLabel>
                  <CommandCollection>
                    {(t: Ticket) => (
                      <CommandItem key={t.uid} value={`${t.ref} ${t.leaf.title}`} onClick={() => { select(t.uid); setDialog(null); setQuery(''); }} className="flex items-center gap-3">
                        <StateIcon state={t.leaf.state} className="size-3.5" />
                        <span className="w-10 shrink-0 font-mono text-[11px] text-muted-foreground">{t.ref}</span>
                        <span className="truncate">{t.leaf.title}</span>
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
