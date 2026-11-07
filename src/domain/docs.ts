/**
 * Documents a ticket or container points at: its PRD, architecture, UX, plans and other BMAD outputs.
 *
 * BMAD links docs in several ways, all collected here:
 * - front matter `sources`, `companions` (paths from the project root, `{project-root}/` allowed) and
 *   a plan's `context`; v6 docs use `inputDocuments`;
 * - a tickets.toml entry's `references` (relative to the initiative folder, `#anchor` allowed);
 * - a `## References` section with bullets like `- design — _bmad-output/x/ux-x/DESIGN.md, section Flows`;
 * - markdown links to `.md` files, and v6 story citations like `[Source: docs/architecture.md#Auth]`.
 */

export interface DocLink {
  /** Where the doc probably is, best guess first; the reader opens the first that exists. */
  candidates: string[];
  anchor?: string;
  /** What the link calls it: `design`, `prd`, `source`, the link text… */
  label: string;
  /** What kind of doc it looks like, from its path. */
  kind: DocKind;
}

export type DocKind = 'prd' | 'architecture' | 'ux' | 'brief' | 'research' | 'epics' | 'sprint' | 'retro' | 'plan' | 'story' | 'context' | 'spec' | 'doc';

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  prd: 'PRD', architecture: 'Architecture', ux: 'UX design', brief: 'Product brief', research: 'Research',
  epics: 'Epics', sprint: 'Sprint status', retro: 'Retrospective', plan: 'Build plan', story: 'Story', context: 'Project context',
  spec: 'Spec', doc: 'Document',
};

/** Guesses a doc's kind from its path, by BMAD's file and run-folder names. */
export function docKind(path: string): DocKind {
  const p = path.toLowerCase();
  const name = p.slice(p.lastIndexOf('/') + 1);
  if (/sprint-status\.ya?ml$/.test(p)) return 'sprint';
  if (/-plan\.md$/.test(name)) return 'plan';
  if (/retro/.test(name)) return 'retro';
  if (/project-context\.md$/.test(name)) return 'context';
  if (/(^|\/)prds?[-/]|(^|[/-])prd[.-]/.test(p) || name === 'prd.md') return 'prd';
  if (/architecture/.test(p)) return 'architecture';
  if (/(^|\/)ux[-/]|ux-design|design\.md$|experience\.md$/.test(p)) return 'ux';
  if (/brief/.test(p)) return 'brief';
  if (/research/.test(p)) return 'research';
  if (/epics?\b.*\.md$|(^|\/)epics\//.test(p) && !/epic-[a-z0-9-]+\/epic-/.test(p)) return 'epics';
  if (/^(story|spike|bug)-|^\d+-\d+[a-z]?-/.test(name)) return 'story';
  if (/(initiative|epic)-[^/]+\.md$/.test(name)) return 'spec';
  return 'doc';
}

export function docTitleFromPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  let name = parts.at(-1) ?? path;
  // `prd-x/prd-x.md`, `ux-x/DESIGN.md`: the folder says more than the file.
  if (/^(DESIGN|EXPERIENCE|ARCHITECTURE-SPINE|index|prd|brief)\.md$/i.test(name) && parts.length > 1) name = `${parts.at(-2)} · ${name}`;
  return name.replace(/\.md$/i, '');
}

/** Normalises a path as BMAD writes it: drops `{project-root}/`, `./` and a trailing slash. */
export function cleanDocPath(raw: string): string {
  return raw.trim().replace(/^\{project-root\}\/?/, '').replace(/^\.\//, '').replace(/\/+$/, '');
}

/** `a/b/../c` → `a/c`. */
export function normalisePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

const isExternal = (s: string) => /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('#') || s.startsWith('mailto:');

interface LinkContext {
  /** Folder of the file the link sits in. */
  baseDir: string;
  /** The initiative folder, which tickets.toml `references` are relative to. */
  initiativeDir?: string;
  /** The output folder, tried last for bare paths. */
  outputFolder?: string;
}

function link(raw: string, label: string, ctx: LinkContext, relativeTo: 'root' | 'base' | 'initiative'): DocLink | null {
  const cleaned = cleanDocPath(raw);
  if (!cleaned || isExternal(cleaned)) return null;
  const [pathPart = '', anchor] = cleaned.split('#');
  if (!pathPart) return null;
  const fromRoot = normalisePath(pathPart);
  const fromBase = normalisePath(`${ctx.baseDir}/${pathPart}`);
  const fromInit = ctx.initiativeDir ? normalisePath(`${ctx.initiativeDir}/${pathPart}`) : null;
  const fromOut = ctx.outputFolder ? normalisePath(`${ctx.outputFolder}/${pathPart}`) : null;
  const order = relativeTo === 'root' ? [fromRoot, fromBase, fromInit, fromOut] : relativeTo === 'initiative' ? [fromInit, fromBase, fromRoot, fromOut] : [fromBase, fromRoot, fromInit, fromOut];
  const candidates = [...new Set(order.filter((c): c is string => !!c))];
  return { candidates, anchor: anchor || undefined, label, kind: docKind(fromRoot) };
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => (typeof x === 'string' ? [x] : x && typeof x === 'object' && 'path' in x ? [String((x as { path: unknown }).path)] : []));

/** Every doc a ticket, plan or container file links to, without repeats, in the order found. */
export function docLinks(input: { frontmatter?: Record<string, unknown>; body?: string; references?: string[] }, ctx: LinkContext): DocLink[] {
  const found: DocLink[] = [];
  const add = (l: DocLink | null) => {
    if (l && !found.some((f) => f.candidates[0] === l.candidates[0] && f.anchor === l.anchor)) found.push(l);
  };
  const fm = input.frontmatter ?? {};
  for (const s of asList(fm.sources)) add(link(s, 'source', ctx, 'root'));
  for (const s of asList(fm.companions)) add(link(s, 'companion', ctx, 'root'));
  for (const s of asList(fm.context)) add(link(s, 'context', ctx, 'root'));
  for (const s of asList(fm.inputDocuments)) add(link(s, 'input', ctx, 'root'));
  for (const s of input.references ?? []) add(link(s, 'reference', ctx, 'initiative'));

  const body = (input.body ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  // `## References` bullets: `- design — path, section X` (em dash, en dash or hyphen).
  const refs = /^#{2,3}\s+References\s*$([\s\S]*?)(?=^#{1,3}\s|(?![\s\S]))/im.exec(body)?.[1] ?? '';
  for (const line of refs.split('\n')) {
    const m = /^\s*[-*]\s+(?:([\w ./-]+?)\s+[—–-]\s+)?`?([^\s,`]+\.(?:md|ya?ml|toml))`?(?:#([\w-]+))?/.exec(line);
    if (m?.[2]) add(link(m[3] ? `${m[2]}#${m[3]}` : m[2], (m[1] ?? 'reference').trim(), ctx, 'root'));
  }
  for (const m of body.matchAll(/\[Source:\s*([^\]\s]+)\s*\]/g)) add(link(m[1] ?? '', 'source', ctx, 'root'));
  for (const m of body.matchAll(/\[([^\]]+)\]\(([^)\s]+\.md(?:#[^)\s]*)?)\)/g)) add(link(m[2] ?? '', m[1] ?? 'link', ctx, 'base'));
  return found;
}

/** The headings of a markdown doc, for its outline and for `#anchor` jumps. */
export function docOutline(body: string): { depth: number; text: string; slug: string }[] {
  const out: { depth: number; text: string; slug: string }[] = [];
  const seen = new Map<string, number>();
  for (const m of body.replace(/```[\s\S]*?```/g, '').matchAll(/^(#{1,4})\s+(.+?)\s*#*\s*$/gm)) {
    const text = (m[2] ?? '').replace(/[*_`]/g, '');
    const base = headingSlug(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ depth: (m[1] ?? '#').length, text, slug: n ? `${base}-${n}` : base });
  }
  return out;
}

/** GitHub-style heading slug, so `#ad-8` and `#flows` anchors land. */
export function headingSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
}
