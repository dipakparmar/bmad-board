/**
 * Prerequisites people write in a ticket's text rather than its `after` key. BMAD's own key is `after`,
 * but story and epic files often say it in words too, and v6 has no key at all:
 *
 * - labelled lines: `**Prerequisites:** Story 1.1, 1.2`, `Depends on: story-cart-scaffold`, `Blocked by: Epic 2`,
 *   `- Waits on epic-pricing-rules because: …` (the ticket template's Notes line);
 * - a `## Dependencies` or `## Prerequisites` section, every ref in it;
 * - front matter keys other tools use: `depends_on`, `dependencies`, `prerequisites`, `blocked_by`, `requires`.
 *
 * Out of those it takes only refs that look like tickets, so "Requires: a signed-in user" adds nothing:
 * `Story 1.2` and bare `1.2` (epic 1, story 2), `#3` or `Story 3` (a sibling), v6 keys `1-2-slug`,
 * `Epic 2`, and file names `epic-x`, `story-x`, `spike-x`, `bug-x`.
 */

export type ProseRef =
  | { kind: 'story'; epic: string; story: string }
  | { kind: 'sibling'; id: string }
  | { kind: 'epic'; id: string }
  | { kind: 'name'; name: string };

const LABEL = String.raw`(?:pre-?requisites?|depends\s+on|dependencies|dependency|blocked\s+by|requires|waits\s+on|builds\s+on)`;
const LABEL_LINE = new RegExp(String.raw`^[ \t]*(?:[-*+][ \t]+)?(?:\*\*|__)?(${LABEL})(?:\*\*|__)?[ \t]*(:)?(?:\*\*|__)?[ \t]*(.*)$`, 'gim');
const SECTION = new RegExp(String.raw`^(#{2,5})[ \t]+(?:story[ \t]+|epic[ \t]+)?(?:pre-?requisites?|dependencies|depends[ \t]+on|blocked[ \t]+by)\b.*$`, 'gim');
const NONE = /^\s*(?:none|n\/?a|-|—|nothing)\b/i;

export const PROSE_KEYS = ['depends_on', 'dependencies', 'prerequisites', 'blocked_by', 'requires', 'depends'];

/** Ticket-like refs in one stretch of text. With `bare`, plain `1.2` counts too (labelled lines and sections). */
export function refsIn(text: string, bare: boolean): ProseRef[] {
  const out: ProseRef[] = [];
  const seen = new Set<string>();
  const add = (r: ProseRef) => {
    const id = JSON.stringify(r);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(r);
    }
  };
  // Mask what a match consumed so `Story 1.2` is not also read as `1.2` or `Story 1`.
  let rest = text;
  const take = (re: RegExp, f: (m: RegExpExecArray) => ProseRef | null) => {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const r = f(m);
      if (r) add(r);
      return ' ';
    });
  };
  take(/\b((?:epic|story|spike|bug)-[a-z0-9][a-z0-9-]*)(?:\.md)?\b/gi, (m) => ({ kind: 'name', name: (m[1] ?? '').toLowerCase() }));
  take(/\b(\d+)-(\d+[a-z]?)-[a-z][\w-]*/gi, (m) => ({ kind: 'story', epic: m[1] ?? '', story: m[2] ?? '' }));
  take(/\bstor(?:y|ies)[ \t]+#?(\d+)\.(\d+[a-z]?)\b/gi, (m) => ({ kind: 'story', epic: m[1] ?? '', story: m[2] ?? '' }));
  take(/\bepic[ \t]+#?(\d+)\b/gi, (m) => ({ kind: 'epic', id: m[1] ?? '' }));
  take(/\b(?:stor(?:y|ies)|ticket|spike|bug)[ \t]+#?(\d+)\b/gi, (m) => ({ kind: 'sibling', id: m[1] ?? '' }));
  if (bare) {
    // "Stories 1.1, 1.2 and 1.4": the later refs carry no word of their own.
    take(/(?<![\w.])(\d+)\.(\d+[a-z]?)(?![\w.])/gi, (m) => ({ kind: 'story', epic: m[1] ?? '', story: m[2] ?? '' }));
    take(/(?<![\w.])#(\d+)(?![\w.])/g, (m) => ({ kind: 'sibling', id: m[1] ?? '' }));
  }
  return out;
}

/** Every prerequisite a ticket's markdown body states in words. */
export function proseDependencies(body: string): ProseRef[] {
  const text = body.replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  const out: ProseRef[] = [];
  const push = (refs: ProseRef[]) => {
    for (const r of refs) if (!out.some((o) => JSON.stringify(o) === JSON.stringify(r))) out.push(r);
  };
  for (const m of text.matchAll(SECTION)) {
    const depth = (m[1] ?? '##').length;
    const start = (m.index ?? 0) + m[0].length;
    const next = new RegExp(String.raw`^#{1,${depth}}[ \t]`, 'm').exec(text.slice(start));
    const section = text.slice(start, next ? start + next.index : undefined);
    if (!NONE.test(section)) push(refsIn(section, true));
  }
  for (const m of text.matchAll(LABEL_LINE)) {
    const label = (m[1] ?? '').toLowerCase();
    const value = m[3] ?? '';
    if (NONE.test(value)) continue;
    // "Waits on X because: …" and "Requires X" only count up to the reason, and bare numbers need a colon.
    const head = /^waits/.test(label) ? value.split(/\bbecause\b/i)[0] ?? '' : value;
    if (head.trim()) push(refsIn(head, !!m[2]));
    else if (m[2]) {
      // `**Dependencies:**` on its own line: the list under it.
      const after = text.slice((m.index ?? 0) + m[0].length).replace(/^\r?\n/, '');
      const list = /^(?:[ \t]*[-*+][ \t].*(?:\r?\n|$))+/.exec(after)?.[0] ?? '';
      push(refsIn(list, true));
    }
  }
  return out;
}

/** Refs from front matter keys other tools write (`depends_on: [1.2]`), as plain strings or lists. */
export function frontmatterDependencies(data: Record<string, unknown>): ProseRef[] {
  const out: ProseRef[] = [];
  for (const key of PROSE_KEYS) {
    const v = data[key];
    const items = Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
    for (const item of items) {
      const s = String(item).trim();
      if (/^\d+$/.test(s)) out.push({ kind: 'sibling', id: s });
      else out.push(...refsIn(s, true));
    }
  }
  return out;
}
