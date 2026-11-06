/**
 * bmad-board local server: serves the built app and a small file + git API over one BMAD project folder.
 *
 *   bun run server -- --root ~/code/shop        (or BMAD_BOARD_ROOT=~/code/shop)
 *
 * Binds to 127.0.0.1 only. Writes stay inside the root, and each write is committed on the current
 * branch (never pushed), the same way BMAD's own repo store commits ticket changes.
 */
import { watch } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

type FileWrite = { path: string; text: string | null };
type Author = { kind: 'person' | 'agent'; name: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const root = resolve((arg('root') ?? process.env.BMAD_BOARD_ROOT ?? process.cwd()).replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
const port = Number(arg('port') ?? process.env.BMAD_BOARD_PORT ?? 33714);
const dist = resolve(import.meta.dir, '..', 'dist');
const ALLOWED_HOSTS = new Set([`127.0.0.1:${port}`, `localhost:${port}`, '127.0.0.1:33713', 'localhost:33713']);

/** Resolves a project-relative path, refusing anything outside the root or inside .git. */
function inside(base: string, path: string): string {
  const full = resolve(base, path.replace(/^\/+/, ''));
  if (full !== base && !full.startsWith(base + sep)) throw new HttpError(400, `path is outside the project: ${path}`);
  const rel = relative(base, full).split(sep);
  if (rel[0] === '.git') throw new HttpError(400, 'the .git folder is off limits');
  return full;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function git(args: string[]): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  return { ok: code === 0, out: (out || err).trim() };
}

async function isRepo() {
  return (await git(['rev-parse', '--is-inside-work-tree'])).ok;
}

async function info() {
  const repo = await isRepo();
  return {
    root,
    name: root.split(sep).pop(),
    git: repo,
    branch: repo ? (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out : null,
    user: repo ? (await git(['config', 'user.name'])).out || null : null,
  };
}

/**
 * Who works on the project, from git. Scans at most PEOPLE_COMMITS commits from the last PEOPLE_DAYS
 * days, so a huge history costs one bounded `git log`, and caches the answer until HEAD moves.
 */
const PEOPLE_COMMITS = Number(process.env.BMAD_BOARD_PEOPLE_COMMITS ?? 5000);
const PEOPLE_DAYS = Number(process.env.BMAD_BOARD_PEOPLE_DAYS ?? 365);
let peopleCache: { head: string; lines: { name: string; email: string; date: string; changedBy?: string }[] } | null = null;

async function people() {
  if (!(await isRepo())) return { lines: [], window: null };
  const head = (await git(['rev-parse', 'HEAD'])).out;
  if (peopleCache?.head !== head) {
    const log = await git(['log', `-n${PEOPLE_COMMITS}`, `--since=${PEOPLE_DAYS}.days`, '--format=%an%x1f%ae%x1f%aI%x1f%(trailers:key=Changed-by,valueonly,separator=%x2C)%x1e']);
    const lines = log.ok
      ? log.out.split('\x1e').map((l) => l.trim()).filter(Boolean).map((l) => {
          const [name = '', email = '', date = '', changedBy = ''] = l.split('\x1f');
          return { name, email, date, changedBy: changedBy.trim() || undefined };
        })
      : [];
    peopleCache = { head, lines };
  }
  return { lines: peopleCache.lines, window: { commits: PEOPLE_COMMITS, days: PEOPLE_DAYS } };
}

/**
 * GitHub through the user's own `gh` login: the server asks `gh auth token` for the token and forwards
 * API calls with it, so the browser never sees or stores the token. Re-reads it once on a 401.
 */
const GITHUB_API = process.env.BMAD_BOARD_GITHUB_API ?? 'https://api.github.com';
let ghToken: string | null | undefined;

async function readGhToken(fresh = false): Promise<string | null> {
  if (ghToken !== undefined && !fresh) return ghToken;
  try {
    const proc = Bun.spawn(['gh', 'auth', 'token'], { stdout: 'pipe', stderr: 'pipe' });
    const out = (await new Response(proc.stdout).text()).trim();
    ghToken = (await proc.exited) === 0 && out ? out : null;
  } catch {
    ghToken = null; // gh is not installed
  }
  return ghToken;
}

async function ghStatus() {
  const token = await readGhToken(true);
  if (!token) return { available: false };
  const res = await fetch(`${GITHUB_API}/user`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
  if (!res.ok) return { available: false, error: `GitHub said ${res.status} for the gh token` };
  const user = (await res.json()) as { login: string };
  return { available: true, login: user.login };
}

async function ghProxy(req: Request, url: URL): Promise<Response> {
  const rest = url.pathname.slice('/api/gh'.length) || '/';
  if (!rest.startsWith('/') || rest.includes('..')) throw new HttpError(400, 'bad GitHub path');
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  const send = async (token: string) => fetch(`${GITHUB_API}${rest}${url.search}`, {
    method: req.method,
    body,
    headers: {
      authorization: `Bearer ${token}`,
      accept: req.headers.get('accept') ?? 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
  });
  let token = await readGhToken();
  if (!token) throw new HttpError(401, 'no GitHub CLI login on this machine; run `gh auth login`');
  let res = await send(token);
  if (res.status === 401 && (token = await readGhToken(true))) res = await send(token);
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' } });
}

async function list(path: string) {
  const full = inside(root, path);
  try {
    const entries = await readdir(full, { withFileTypes: true });
    return entries
      .filter((e) => (e.isFile() || e.isDirectory()) && !(path === '' && e.name === '.git'))
      .map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file' }));
  } catch {
    return null;
  }
}

async function commit(files: FileWrite[], message: string, author: Author) {
  if (!Array.isArray(files) || files.length === 0) throw new HttpError(400, 'nothing to write');
  const paths: string[] = [];
  for (const f of files) {
    const full = inside(root, f.path);
    if (f.text === null) await rm(full, { force: true });
    else {
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, f.text);
    }
    paths.push(relative(root, full));
  }
  if (!(await isRepo())) return { paths, commit: undefined, note: 'not a git repository; files written without a commit' };
  const add = await git(['add', '--all', '--', ...paths]);
  if (!add.ok) throw new HttpError(500, `git add failed: ${add.out}`);
  const msg = message || `chore(tickets): update via bmad-board\n\nChanged-by: ${author.kind}:${author.name}`;
  const done = await git(['commit', '-m', msg, '--', ...paths]);
  if (!done.ok && !/nothing to commit/.test(done.out)) throw new HttpError(500, `git commit failed: ${done.out}`);
  return { paths, commit: done.ok ? (await git(['rev-parse', 'HEAD'])).out : undefined };
}

/** Recent commits touching a path, parsed from `git log`. */
async function history(path: string, limit: number) {
  if (!(await isRepo())) return [];
  const rel = relative(root, inside(root, path)) || '.';
  const log = await git(['log', `-n${Math.min(Math.max(limit, 1), 200)}`, '--format=%x1e%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1f', '--name-only', '--', rel]);
  if (!log.ok) return [];
  return log.out.split('\x1e').filter(Boolean).map((chunk) => {
    const [sha = '', author = '', date = '', subject = '', body = '', files = ''] = chunk.split('\x1f');
    return {
      sha, author, date, subject,
      changedBy: /^Changed-by:\s*(\S+)/m.exec(body)?.[1],
      paths: files.split('\n').map((f) => f.trim()).filter(Boolean),
    };
  });
}

/** Server-sent events: one `change` event (debounced) whenever a file under the root changes. */
function events(): Response {
  let close = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const send = (data: string) => controller.enqueue(enc.encode(`data: ${data}\n\n`));
      send('ready');
      let watcher: ReturnType<typeof watch> | undefined;
      try {
        watcher = watch(root, { recursive: true }, (_e, file) => {
          if (file && String(file).split(sep)[0] === '.git') return;
          clearTimeout(timer);
          timer = setTimeout(() => send('change'), 250);
        });
      } catch {
        send('unwatchable');
      }
      const ping = setInterval(() => controller.enqueue(enc.encode(': ping\n\n')), 25_000);
      close = () => {
        clearInterval(ping);
        watcher?.close();
      };
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}

async function serveStatic(pathname: string): Promise<Response> {
  const file = pathname === '/' ? join(dist, 'index.html') : inside(dist, pathname);
  try {
    if ((await stat(file)).isFile()) return new Response(Bun.file(file));
  } catch {
    /* fall through to the app shell */
  }
  try {
    return new Response(Bun.file(join(dist, 'index.html')), { headers: { 'content-type': 'text/html' } });
  } catch {
    return new Response('Run `bun run build` first, or use `bun run dev` for the dev server.', { status: 404 });
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      // Blocks DNS rebinding: only our own host names may talk to the API.
      if (url.pathname.startsWith('/api/') && !ALLOWED_HOSTS.has(req.headers.get('host') ?? '')) throw new HttpError(403, 'unexpected host');
      // Writes, and anything that spends the gh token, need the header a cross-site page cannot send without CORS.
      if ((req.method !== 'GET' || url.pathname.startsWith('/api/gh')) && url.pathname.startsWith('/api/') && req.headers.get('x-bmad-board') !== '1') throw new HttpError(403, 'missing x-bmad-board header');
      if (url.pathname === '/api/gh-status') return json(await ghStatus());
      if (url.pathname.startsWith('/api/gh/')) return await ghProxy(req, url);
      const path = url.searchParams.get('path') ?? '';
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/info':
          return json(await info());
        case 'GET /api/list': {
          const entries = await list(path);
          return entries ? json(entries) : json({ error: 'not found' }, 404);
        }
        case 'GET /api/read': {
          try {
            return new Response(await readFile(inside(root, path), 'utf8'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
          } catch (e) {
            if (e instanceof HttpError) throw e;
            return json({ error: 'not found' }, 404);
          }
        }
        case 'POST /api/commit': {
          const body = (await req.json()) as { files: FileWrite[]; message: string; author: Author };
          return json(await commit(body.files, body.message, body.author));
        }
        case 'GET /api/log':
          return json(await history(path, Number(url.searchParams.get('limit') ?? 30)));
        case 'GET /api/people':
          return json(await people());
        case 'GET /api/events':
          return events();
      }
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'no such endpoint');
      return serveStatic(url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      return json({ error: e instanceof Error ? e.message : 'server error' }, 500);
    }
  },
});

console.log(`bmad-board serving ${root}\n  → http://${server.hostname}:${server.port}`);
