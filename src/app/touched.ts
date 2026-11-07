/** Which tickets a commit touched, from the paths it changed: their files, plans, tickets.toml and epic files. */
import type { Ticket } from './view-model';

export interface Touched {
  /** Tickets whose own file or plan changed. */
  tickets: { ticket: Ticket; how: string[] }[];
  /** Epics and initiatives whose file or tickets.toml changed. */
  containers: { key: string; title: string; kind: 'epic' | 'initiative'; path: string; how: string; scope: { initiative?: string; epic?: string } }[];
}

export function ticketsTouched(paths: string[], tickets: Ticket[]): Touched {
  const changed = new Set(paths);
  const out: Touched = { tickets: [], containers: [] };
  const seen = new Set<string>();
  for (const t of tickets) {
    const how: string[] = [];
    if (t.leaf.file && changed.has(t.leaf.file.path)) how.push('ticket');
    if (t.leaf.plan && changed.has(t.leaf.plan.path)) how.push('plan');
    if (how.length) out.tickets.push({ ticket: t, how });
    for (const c of [t.epic, t.initiative]) {
      if (!c) continue;
      // An epic's entries sit in its tickets/tickets.toml; an initiative's epic table in its own.
      const toml = c.type === 'epic' ? `${t.leaf.dir}/tickets.toml` : `${c.path.split('/').slice(0, -1).join('/')}/tickets/tickets.toml`;
      const key = `${t.workspaceId}:${c.type}:${c.path}`;
      if (seen.has(key)) continue;
      const file = changed.has(c.path);
      const entries = changed.has(toml);
      if (!file && !entries) continue;
      seen.add(key);
      out.containers.push({
        key, title: c.title, kind: c.type === 'epic' ? 'epic' : 'initiative', path: entries ? toml : c.path,
        how: entries && file ? 'epic file and tickets.toml' : entries ? 'tickets.toml' : `${c.type} file`,
        scope: c.type === 'epic' ? { initiative: t.initiative?.slug, epic: c.slug } : { initiative: c.slug },
      });
    }
  }
  return out;
}
