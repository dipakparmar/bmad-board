/**
 * The `bmad-board` command: run it inside any BMAD project to open its board.
 *
 *   bmad-board                 serve the current folder and open the browser
 *   bmad-board ~/code/shop     serve another folder
 *   bmad-board --port 4000 --no-open
 */
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const HELP = `bmad-board ${pkg.version}: a ticket board for a BMAD project

Usage: bmad-board [folder] [options]

  folder           the project to serve (default: the current folder)
  --root <folder>  same as folder
  --port <n>       port to listen on (default 33714, or the next free one)
  --no-open        don't open the browser
  -v, --version    print the version
  -h, --help       print this help

Environment: BMAD_BOARD_ROOT, BMAD_BOARD_PORT, BMAD_BOARD_PEOPLE_COMMITS, BMAD_BOARD_PEOPLE_DAYS.
The server listens on 127.0.0.1 only. Board edits are committed on the current branch, never pushed.`;

const argv = process.argv.slice(2);
const has = (...flags: string[]) => argv.some((a) => flags.includes(a));
const value = (flag: string) => {
  const i = argv.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  if (i < 0) return undefined;
  const a = argv[i] ?? '';
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1];
};

if (has('-h', '--help')) {
  console.log(HELP);
  process.exit(0);
}
if (has('-v', '--version')) {
  console.log(pkg.version);
  process.exit(0);
}

// The first argument that isn't a flag or a flag's value is the folder.
const positional = argv.find((a, i) => !a.startsWith('-') && !['--root', '--port'].includes(argv[i - 1] ?? ''));
const home = process.env.HOME ?? process.env.USERPROFILE ?? '~';
const folder = resolve((value('--root') ?? positional ?? process.env.BMAD_BOARD_ROOT ?? process.cwd()).replace(/^~(?=$|[/\\])/, home));
if (!existsSync(folder) || !statSync(folder).isDirectory()) {
  console.error(`bmad-board: ${folder} is not a folder`);
  process.exit(1);
}
const port = value('--port');
if (port !== undefined && !/^\d+$/.test(port)) {
  console.error(`bmad-board: --port needs a number, got ${port}`);
  process.exit(1);
}

// The server reads these; set them before it loads.
process.env.BMAD_BOARD_ROOT = folder;
if (port) process.env.BMAD_BOARD_PORT = port;
process.argv = [process.argv[0] ?? 'bun', process.argv[1] ?? 'bmad-board'];

if (!['_bmad', '_bmad-output', 'docs'].some((d) => existsSync(join(folder, d)))) {
  console.warn(`bmad-board: no _bmad, _bmad-output or docs folder in ${folder}; the board will be empty until BMAD writes there.`);
}

let started: { url: string };
try {
  started = await import('./index.ts');
} catch (e) {
  console.error(`bmad-board: could not start: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

if (!has('--no-open') && !process.env.BMAD_BOARD_NO_OPEN) {
  const cmd = process.platform === 'darwin' ? ['open', started.url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', started.url] : ['xdg-open', started.url];
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' }).unref();
  } catch {
    /* no browser opener here; the URL is printed above */
  }
}
console.log('  Press Ctrl+C to stop.');
