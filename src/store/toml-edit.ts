/**
 * Edits `tickets.toml` by table, keeping comments and layout. Agents read these files too,
 * so the board never re-serializes a whole file.
 */
const TABLE_RE = /^\[\[(entry|epic|initiative)\]\]\s*(#.*)?$/;

export interface TomlTable {
  kind: string;
  lines: string[];
}

export interface TomlDoc {
  preamble: string[];
  tables: TomlTable[];
}

export function splitTables(text: string): TomlDoc {
  const doc: TomlDoc = { preamble: [], tables: [] };
  let current: TomlTable | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = TABLE_RE.exec(line.trim());
    if (m) {
      current = { kind: m[1] ?? 'entry', lines: [line] };
      doc.tables.push(current);
    } else if (current) current.lines.push(line);
    else doc.preamble.push(line);
  }
  return doc;
}

export function joinTables(doc: TomlDoc): string {
  return [...doc.preamble, ...doc.tables.flatMap((t) => t.lines)].join('\n');
}

export type TomlValue = string | number | boolean | (string | number)[];

export function tomlValue(value: TomlValue): string {
  if (Array.isArray(value)) return `[${value.map((v) => tomlValue(v)).join(', ')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function keyRe(key: string) {
  return new RegExp(`^\\s*#?\\s*${key}\\s*=`);
}

export function tableId(table: TomlTable): string | undefined {
  for (const line of table.lines) {
    const m = /^\s*id\s*=\s*("?)([^"#\s]+)\1/.exec(line);
    if (m) return m[2];
  }
  return undefined;
}

/** Sets or removes one key. A commented-out `# key = …` template line is replaced in place. */
export function setKey(table: TomlTable, key: string, value: TomlValue | undefined): void {
  const live = table.lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  const commented = live < 0 ? table.lines.findIndex((l) => keyRe(key).test(l)) : -1;
  const at = live >= 0 ? live : commented;
  if (value === undefined) {
    if (live >= 0) table.lines.splice(live, 1);
    return;
  }
  const comment = live >= 0 ? /\s#[^"]*$/.exec(table.lines[live] ?? '')?.[0] ?? '' : '';
  const line = `${key} = ${tomlValue(value)}${comment}`;
  if (at >= 0) {
    table.lines[at] = line;
    return;
  }
  // After the last key line, before trailing blank lines.
  let end = table.lines.length;
  while (end > 1 && (table.lines[end - 1] ?? '').trim() === '') end -= 1;
  table.lines.splice(end, 0, line);
}

export function findTable(doc: TomlDoc, kind: string, id: string | number): TomlTable | undefined {
  return doc.tables.find((t) => t.kind === kind && tableId(t) === String(id));
}

export function appendTable(doc: TomlDoc, kind: string, values: Record<string, TomlValue | undefined>): void {
  const last = doc.tables.at(-1);
  if (last && (last.lines.at(-1) ?? '').trim() !== '') last.lines.push('');
  else if (!last && (doc.preamble.at(-1) ?? '').trim() !== '') doc.preamble.push('');
  const lines = [`[[${kind}]]`];
  for (const [k, v] of Object.entries(values)) if (v !== undefined) lines.push(`${k} = ${tomlValue(v)}`);
  lines.push('');
  doc.tables.push({ kind, lines });
}

/** Reorders tables of one kind; ids not named keep their relative order after the named ones. */
export function reorderTables(doc: TomlDoc, kind: string, order: (string | number)[]): void {
  const mine = doc.tables.filter((t) => t.kind === kind);
  const rank = new Map(order.map((id, i) => [String(id), i]));
  const sorted = [...mine].sort((a, b) => (rank.get(tableId(a) ?? '') ?? order.length) - (rank.get(tableId(b) ?? '') ?? order.length));
  // Keep a blank line between tables after the move.
  for (const t of sorted) if ((t.lines.at(-1) ?? '').trim() !== '') t.lines.push('');
  let i = 0;
  doc.tables = doc.tables.map((t) => (t.kind === kind ? (sorted[i++] as TomlTable) : t));
}
