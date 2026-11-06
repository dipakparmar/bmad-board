/**
 * Read-only view of the BMAD v6 layout (`_bmad-output/implementation-artifacts/sprint-status.yaml`,
 * story markdown beside it, `planning-artifacts/epics.md`). Migrate with `bmad migrate method` to edit.
 */
import { parse } from 'yaml';
import { boardState, type Epic, type Leaf, type LeafStatus, type TicketTree } from '../domain';
import { parseFrontmatter, str } from './frontmatter';
import { joinPath, type FileSource } from './file-source';

const V6_STATUS: Record<string, LeafStatus | ''> = {
  backlog: '', drafted: 'draft', 'ready-for-dev': 'ready-for-dev', 'in-progress': 'in-progress',
  review: 'in-review', done: 'done', blocked: 'blocked', optional: '',
};

export function v6Status(value: string): LeafStatus | '' {
  return V6_STATUS[value.toLowerCase().replaceAll('_', '-').trim()] ?? '';
}

export async function loadV6Tree(src: FileSource, outputFolder: string): Promise<TicketTree | null> {
  const impl = joinPath(outputFolder, 'implementation-artifacts');
  const statusPath = joinPath(impl, 'sprint-status.yaml');
  const text = await src.read(statusPath);
  if (text === null) return null;
  const problems: string[] = [];
  let doc: Record<string, unknown> = {};
  try {
    doc = (parse(text) ?? {}) as Record<string, unknown>;
  } catch (cause) {
    problems.push(`${statusPath}: ${cause instanceof Error ? cause.message : 'invalid YAML'}`);
  }
  const statuses = (doc.development_status ?? {}) as Record<string, unknown>;
  const epicsPath = joinPath(outputFolder, 'planning-artifacts', 'epics.md');
  const epicText = (await src.read(epicsPath)) ?? '';
  const files = new Set(((await src.list(impl)) ?? []).filter((e) => e.kind === 'file').map((e) => e.name));

  const epics = new Map<string, Epic>();
  const epicFor = (n: string, status?: string): Epic => {
    const slug = `epic-${n}`;
    let epic = epics.get(slug);
    if (!epic) {
      const heading = new RegExp(`^##\\s+Epic\\s+${n}\\s*[:：-]\\s*(.+)$`, 'mi').exec(epicText)?.[1]?.trim();
      epic = {
        type: 'epic', slug, id: Number(n), title: heading ?? `Epic ${n}`, description: '', path: epicsPath,
        covers: [], after: [], gates: [], refined: true, companions: [], body: '', leaves: [],
      };
      epics.set(slug, epic);
    }
    if (status === 'done') epic.status = 'done';
    else if (status === 'in-progress' || status === 'contexted') epic.status = 'in-progress';
    return epic;
  };

  for (const [key, value] of Object.entries(statuses)) {
    const fields = value && typeof value === 'object' ? (value as Record<string, unknown>) : { status: value };
    const epicKey = /^epic-(\d+)$/.exec(key);
    if (epicKey) {
      epicFor(epicKey[1] ?? '', str(fields.status));
      continue;
    }
    const story = /^(\d+)-(\d+)-(.+)$/.exec(key);
    if (!story) continue;
    const [, e = '', s = '', slug = ''] = story;
    const epic = epicFor(e);
    const fileName = `${key}.md`;
    let file: Leaf['file'];
    let title = str(fields.title) || slug.replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (files.has(fileName)) {
      const raw = (await src.read(joinPath(impl, fileName))) ?? '';
      const { body } = parseFrontmatter(raw);
      title = /^#\s+(.+)$/m.exec(body)?.[1]?.replace(/^Story\s+[\d.]+[:：-]?\s*/i, '').trim() || title;
      file = { path: joinPath(impl, fileName), body, refined: true };
    }
    const status = v6Status(str(fields.status));
    epic.leaves.push({
      key: `${epic.slug}/${s}`, id: Number(s), type: 'story', title, folder: epic.slug, dir: impl, initiative: 'sprint',
      file, after: [], gatedBy: [], hitl: false, status, state: boardState(status),
      plan: fields.owner ? { path: statusPath, ticket: key, status, assignee: str(fields.owner), body: '' } : undefined,
    });
  }

  return {
    projectRoot: '', outputFolder, tracker: 'repo', layout: 'v6', backlog: [], problems,
    initiatives: [{
      type: 'initiative', slug: 'sprint', title: str(doc.project) || 'Sprint plan', description: '', path: statusPath,
      covers: [], after: [], gates: [], companions: [], body: '', epics: [...epics.values()], leaves: [],
    }],
  };
}
