/**
 * YAML frontmatter, read with a real parser and written by editing lines in place,
 * so comments and key order in files that agents also edit stay as they were.
 */
import { parse, stringify } from 'yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface Parsed {
  data: Record<string, unknown>;
  body: string;
  /** False when the text has no frontmatter block. */
  has: boolean;
}

export function parseFrontmatter(text: string): Parsed {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { data: {}, body: text, has: false };
  let data: unknown;
  try {
    data = parse(m[1] ?? '');
  } catch {
    data = {};
  }
  return { data: data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}, body: text.slice(m[0].length), has: true };
}

function scalar(value: unknown): string {
  return stringify(value, { lineWidth: 0, collectionStyle: 'flow', flowCollectionPadding: false }).trimEnd();
}

/**
 * Sets (or with `undefined`, removes) top-level keys. Only single-line values are written,
 * which is all the board needs (status, assignee, blocked_at, blocked_reason, ticket, after).
 */
export function setFrontmatter(text: string, fields: Record<string, string | number | boolean | (string | number)[] | undefined>): string {
  const m = FRONTMATTER_RE.exec(text);
  const lines = m ? (m[1] ?? '').split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(fields)) {
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
    const at = lines.findIndex((l) => re.test(l));
    if (value === undefined) {
      if (at >= 0) lines.splice(at, 1);
      continue;
    }
    const comment = at >= 0 ? / #.*$/.exec(lines[at] ?? '')?.[0] ?? '' : '';
    const line = `${key}: ${scalar(value)}${comment}`;
    if (at >= 0) lines[at] = line;
    else lines.push(line);
  }
  const head = `---\n${lines.filter((l, i) => l !== '' || i < lines.length - 1).join('\n')}\n---\n`;
  return m ? head + text.slice(m[0].length) : head + text;
}

export function replaceBody(text: string, body: string): string {
  const m = FRONTMATTER_RE.exec(text);
  return m ? m[0] + body : body;
}

export function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function flag(value: unknown): boolean {
  return value === true || value === 'true';
}

export function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}
