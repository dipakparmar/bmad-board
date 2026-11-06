/**
 * Assignee field: free text, as BMAD's plan files allow, with suggestions from the team roster
 * (git authors, GitHub users, earlier assignees). Arrow keys pick, Enter or blur saves.
 */
import { Bot, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePeople } from '@/app/use-people';
import type { Member } from '@/domain';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

function Avatar({ m }: { m: Member }) {
  if (m.avatarUrl) return <img src={m.avatarUrl} alt="" className="size-5 shrink-0 rounded-full" />;
  const Icon = m.agent ? Bot : UserRound;
  return <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', m.agent ? 'bg-info/15 text-info' : 'bg-primary/12 text-primary')}><Icon className="size-3" /></span>;
}

function detail(m: Member): string {
  const bits = [m.agent ? 'agent' : m.login ? `@${m.login}` : m.email, m.commits ? `${m.commits} commit${m.commits === 1 ? '' : 's'}` : m.sources.includes('tickets') ? 'assigned before' : undefined];
  return bits.filter(Boolean).join(' · ');
}

export function AssigneePicker({ workspaceId, value, onCommit }: { workspaceId: string; value: string; onCommit: (name: string) => void }) {
  const people = usePeople(workspaceId);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Until the person types, list everyone rather than filtering by the current assignee.
  const [typed, setTyped] = useState(false);
  const committed = useRef(value);
  useEffect(() => {
    setText(value);
    committed.current = value;
  }, [value]);

  const q = typed ? text.trim().toLowerCase() : '';
  const matches = people.filter((m) => !q || m.name.toLowerCase().includes(q) || m.login?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)).slice(0, 8);

  const commit = (name: string) => {
    setOpen(false);
    setTyped(false);
    setText(name);
    if (name !== committed.current) {
      committed.current = name;
      onCommit(name);
    }
  };

  return (
    <div className="relative">
      <Input
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Assignee"
        value={text}
        placeholder="Person or agent"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setTyped(true);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); commit(open && matches[active] ? matches[active].name : text.trim()); }
          else if (e.key === 'Escape') { setOpen(false); setText(committed.current); }
        }}
        onBlur={() => commit(text.trim())}
      />
      {open && matches.length > 0 && (
        <ul role="listbox" className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {matches.map((m, i) => (
            <li
              key={m.name}
              role="option"
              aria-selected={i === active}
              // mousedown, so the pick lands before the input's blur commits the typed text
              onMouseDown={(e) => { e.preventDefault(); commit(m.name); }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm', i === active && 'bg-accent')}
            >
              <Avatar m={m} />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{detail(m)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
