/**
 * Writes a made-up BMAD project in the ticket-tree layout, for trying the board at size:
 *
 *   bun scripts/generate-project.ts <folder> [--tickets 2110] [--seed 7] [--git]
 *
 * Initiatives hold epics, epics hold stories, spikes and bugs, the way bmad-agent-po writes them:
 * tickets.toml in build order with `after` (siblings, `<epic>.<entry>`, `epic-<slug>`), epic `after`
 * tables, leaf files with Dependencies sections and Prerequisites lines, "Waits on" notes, and plans
 * with status, assignee and a task checklist. With --git it commits the lot, spread over the last weeks.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--'));
if (!out) {
  console.error('usage: bun scripts/generate-project.ts <folder> [--tickets 2110] [--seed 7] [--git]');
  process.exit(1);
}
const opt = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const total = opt('tickets', 2110);
let seed = opt('seed', 7);
const useGit = args.includes('--git');

// Small seeded PRNG, so the same seed gives the same project.
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

const AREAS = ['checkout', 'search', 'accounts', 'catalog', 'payments', 'shipping', 'reviews', 'promotions', 'inventory', 'notifications', 'admin', 'reporting', 'mobile', 'loyalty', 'support'];
const VERBS = ['Show', 'Validate', 'Store', 'Sync', 'Refund', 'Export', 'Import', 'Filter', 'Sort', 'Cache', 'Audit', 'Retry', 'Notify', 'Preview', 'Archive', 'Schedule', 'Price', 'Translate'];
const THINGS = ['order history', 'saved carts', 'gift cards', 'tax rules', 'delivery slots', 'product images', 'stock levels', 'coupon codes', 'user roles', 'payment methods', 'returns', 'wish lists', 'price alerts', 'invoices', 'store hours', 'reviews', 'shipping labels', 'search facets'];
const PEOPLE = ['Dipak', 'Asha', 'Marco', 'Lena', 'Kenji', 'Priya', 'Tom', 'dev-agent', 'qa-agent', 'claude'];
const STATUSES = ['done', 'done', 'done', 'in-progress', 'in-review', 'ready-for-dev', 'ready-for-dev', 'blocked'];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const write = async (path: string, text: string) => {
  await mkdir(join(out, path, '..'), { recursive: true });
  await writeFile(join(out, path), text);
};
const toml = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(toml).join(', ')}]` : String(v));

// Roughly 9 epics per initiative and 19 tickets per epic, until the total is reached.
const perEpic = 19;
const epicsPerInit = 9;
let made = 0;
let initiativeNo = 0;
const commits: string[][] = [];

await write('_bmad/config.toml', '[core]\noutput_folder = "{project-root}/_bmad-output"\n');
await write('_bmad/custom/config.user.toml', '[core]\nuser_name = "Dipak"\n');

while (made < total) {
  initiativeNo++;
  const area = AREAS[(initiativeNo - 1) % AREAS.length] ?? 'misc';
  const init = `initiative-${area}${initiativeNo > AREAS.length ? `-${initiativeNo}` : ''}`;
  const initDir = `_bmad-output/${init}`;
  const epicTables: string[] = [];
  const epicSlugs: string[] = [];
  const files: string[] = [];
  await write(`${initDir}/${init}.md`, `---\ntype: initiative\ntitle: "Shoppers get better ${area}"\nstatus: in-progress\nrisk: medium\n---\n\n# Shoppers get better ${area}\n\n## Description\n\nEverything about ${area}, end to end.\n\n## Requirements\n\n- R1: ${area} works on the live site.\n`);
  for (let e = 1; e <= epicsPerInit && made < total; e++) {
    const thing = pick(THINGS);
    const epicSlug = `epic-${slug(`${thing} ${e}`)}`;
    epicSlugs.push(epicSlug);
    // Most epics wait on the one before, a few on an earlier one, declared in tickets.toml.
    const waits = e > 1 && rand() < 0.6 ? [e - 1 - (rand() < 0.2 && e > 2 ? 1 : 0)] : [];
    epicTables.push([
      '[[epic]]', `id = ${e}`, `slug = "${epicSlug}"`, `title = "${thing[0]?.toUpperCase()}${thing.slice(1)} (${area})"`,
      `description = "Shoppers can manage ${thing} in ${area}."`, 'covers = ["R1"]',
      ...(waits.length ? [`after = [${waits.map((w) => `{ epic = ${w}, needs = "its data model" }`).join(', ')}]`] : []), '',
    ].join('\n'));
    const epicDir = `${initDir}/tickets/${epicSlug}`;
    const waitNote = waits.map((w) => `- Waits on ${epicSlugs[w - 1]} because: it needs that epic's data model.`).join('\n');
    const epicStatus = e <= 2 ? 'done' : e <= 5 ? 'in-progress' : '';
    await write(`${epicDir}/${epicSlug}.md`, `---\nid: ${e}\ntype: epic\ntitle: "${thing} (${area})"\nparent: ${init}\ncovers: [R1]\nafter: []\n${epicStatus ? `status: ${epicStatus}\n` : ''}risk: low\n---\n\n# ${thing}\n\n## Description\n\nShoppers can manage ${thing}.\n\n## Notes\n\n${waitNote || '- Decision: ships on its own.'}\n`);
    files.push(`${epicDir}/${epicSlug}.md`);
    const entries: string[] = [];
    const n = Math.min(perEpic, total - made);
    for (let s = 1; s <= n; s++) {
      made++;
      const type = rand() < 0.08 ? 'spike' : rand() < 0.1 ? 'bug' : 'story';
      const title = `${pick(VERBS)} ${pick(THINGS)}${s > 1 ? ` (${s})` : ''}`;
      const name = `${type}-${slug(title)}`;
      // Declared prerequisites: usually the story before or one two back; sometimes another epic's ticket.
      const after: (number | string)[] = [];
      if (s > 1 && rand() < 0.45) after.push(s - 1);
      if (s > 3 && rand() < 0.15) after.push(s - 3);
      if (e > 1 && s <= 2 && rand() < 0.3) after.push(`${e - 1}.${1 + Math.floor(rand() * perEpic)}`);
      entries.push([
        '[[entry]]', `id = ${s}`, `type = "${type}"`, `title = ${JSON.stringify(title)}`,
        `description = "Makes ${title.toLowerCase()} work end to end."`, 'verify = "A shopper sees it on the deployed site."',
        'covers = ["R1"]', `after = ${toml(after)}`, `hitl = ${rand() < 0.1}`, `risk = "${pick(['low', 'low', 'medium', 'high'])}"`, '',
      ].join('\n'));
      // Done and started tickets have files and plans; the rest stay entries until refined.
      const epicDone = epicStatus === 'done';
      const status = epicDone ? 'done' : epicStatus === 'in-progress' ? pick(STATUSES) : rand() < 0.15 ? 'ready-for-dev' : '';
      if (!status) continue;
      // Some tickets say what they need in words only: a Dependencies section or a Prerequisites line.
      const prose = s > 2 && rand() < 0.35
        ? rand() < 0.5 ? `\n## Dependencies\n\n- Story ${e}.${s - 2}, for its ${pick(THINGS)}.\n` : `\n**Prerequisites:** Story ${e}.${Math.max(1, s - 2)}\n`
        : '';
      await write(`${epicDir}/tickets/${name}.md`, `---\nid: ${s}\ntype: ${type}\ntitle: ${JSON.stringify(title)}\nparent: ${epicSlug}\nafter: ${toml(after)}\nrefined: true\nhitl: false\nrisk: low\n---\n\n# ${title}\n\n## Description\n\nMakes ${title.toLowerCase()} work.\n${prose}\n## Requirements\n\n1. **It works** (R1)\n   **Given** a shopper\n   **When** they use it\n   **Then** it works\n`);
      const done = status === 'done';
      const assignee = pick(PEOPLE);
      await write(`${epicDir}/tickets/${name}-plan.md`, `---\ntitle: ${JSON.stringify(title)}\nticket: ${s}\ntype: feature\nstatus: ${status}\nassignee: "${assignee}"\n${status === 'blocked' ? 'blocked_at: 2026-11-05\nblocked_reason: "Waiting on a decision about the API"\n' : ''}---\n\n# Plan: ${title}\n\n- [${done ? 'x' : 'x'}] Model\n- [${done ? 'x' : ' '}] API\n- [${done ? 'x' : ' '}] UI\n`);
      files.push(`${epicDir}/tickets/${name}.md`, `${epicDir}/tickets/${name}-plan.md`);
    }
    await write(`${epicDir}/tickets/tickets.toml`, `${entries.join('\n')}`);
    files.push(`${epicDir}/tickets/tickets.toml`);
  }
  await write(`${initDir}/tickets/tickets.toml`, epicTables.join('\n'));
  commits.push([`${initDir}`, ...files]);
}

if (useGit) {
  const run = (cmd: string[], env: Record<string, string> = {}) => {
    const p = Bun.spawnSync(cmd, { cwd: out, env: { ...process.env, ...env } });
    if (p.exitCode !== 0) throw new Error(`${cmd.join(' ')}: ${p.stderr.toString()}`);
  };
  run(['git', 'init', '-q']);
  run(['git', 'add', '_bmad']);
  run(['git', 'commit', '-qm', 'chore: bmad config'], { GIT_AUTHOR_NAME: 'Dipak', GIT_AUTHOR_EMAIL: 'dipak@example.com', GIT_COMMITTER_NAME: 'Dipak', GIT_COMMITTER_EMAIL: 'dipak@example.com' });
  commits.forEach(([dir], i) => {
    const who = pick(PEOPLE);
    const date = new Date(Date.now() - (commits.length - i) * 3 * 86_400_000).toISOString();
    run(['git', 'add', dir ?? '.']);
    run(['git', 'commit', '-qm', `feat(tickets): plan ${dir?.split('/').pop()}\n\nChanged-by: person:${who} via bmad-board`], {
      GIT_AUTHOR_NAME: who, GIT_AUTHOR_EMAIL: `${slug(who)}@example.com`, GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: who, GIT_COMMITTER_EMAIL: `${slug(who)}@example.com`, GIT_COMMITTER_DATE: date,
    });
  });
}

console.log(`wrote ${made} tickets in ${initiativeNo} initiatives to ${out}${useGit ? ' (committed)' : ''}`);
