/**
 * The project's documents: everything markdown or YAML under the output folder (PRDs, architecture,
 * UX, epics, sprint status, retros, plans) and the project's `docs/` folder. Walked once per loaded
 * tree, with a cap so a huge repo stays quick.
 */
import { useEffect, useState } from 'react';
import { docKind, docTitleFromPath, normalisePath, type DocKind, type DocLink } from '@/domain';
import { joinPath as join, type FileSource } from '@/store';
import type { Workspace } from './use-board';

export interface DocEntry {
  path: string;
  kind: DocKind;
  title: string;
  /** Top folder under the output folder (an initiative, planning-artifacts…), or `docs`. */
  group: string;
  /** A ticket's own file or plan: shown only on request, since the board already shows them. */
  ticketFile: boolean;
}

const MAX_FILES = 800;
const MAX_DEPTH = 7;
const SKIP = new Set(['.git', 'node_modules', '.github', 'dist', 'build']);

async function walk(src: FileSource, root: string, onFile: (path: string) => void, depth = 0): Promise<boolean> {
  if (depth > MAX_DEPTH) return true;
  const entries = (await src.list(root)) ?? [];
  let truncated = false;
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const path = root ? `${root}/${e.name}` : e.name;
    if (e.kind === 'dir') truncated = (await walk(src, path, onFile, depth + 1)) || truncated;
    else if (/\.(md|ya?ml)$/i.test(e.name)) onFile(path);
  }
  return truncated;
}

export async function loadDocLibrary(src: FileSource, outputFolder: string): Promise<{ docs: DocEntry[]; truncated: boolean }> {
  const paths: string[] = [];
  let over = false;
  const onFile = (p: string) => {
    if (paths.length >= MAX_FILES) over = true;
    else paths.push(p);
  };
  const truncated = (await walk(src, outputFolder, onFile)) || ((await src.list('docs')) ? await walk(src, 'docs', onFile) : false);
  const prefix = outputFolder ? `${outputFolder}/` : '';
  const docs = paths.map((path): DocEntry => {
    const rel = prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
    const kind = docKind(path);
    const name = path.slice(path.lastIndexOf('/') + 1);
    return {
      path, kind, title: docTitleFromPath(path),
      group: path.startsWith(prefix) || !prefix ? (rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : 'Top level') : 'docs',
      ticketFile: kind === 'story' || kind === 'plan' || /^(story|spike|bug)-/.test(name),
    };
  });
  // Inside each folder: planning docs first (brief, PRD, UX, architecture), then specs, then the rest.
  const rank: DocKind[] = ['brief', 'prd', 'ux', 'architecture', 'research', 'epics', 'sprint', 'spec', 'context', 'retro', 'doc', 'story', 'plan'];
  docs.sort((a, b) => a.group.localeCompare(b.group) || rank.indexOf(a.kind) - rank.indexOf(b.kind) || a.path.localeCompare(b.path));
  return { docs, truncated: truncated || over };
}

const cache = new WeakMap<object, Promise<{ docs: DocEntry[]; truncated: boolean }>>();

export function useDocLibrary(ws: Workspace | undefined) {
  const [state, setState] = useState<{ docs: DocEntry[]; truncated: boolean } | null>(null);
  useEffect(() => {
    if (!ws?.tree) return;
    let live = true;
    // Keyed on the loaded tree, so a reload (new commit, file change) walks again.
    let pending = cache.get(ws.tree);
    if (!pending) {
      pending = loadDocLibrary(ws.store.source, ws.tree.outputFolder);
      cache.set(ws.tree, pending);
    }
    setState(null);
    void pending.then((r) => live && setState(r)).catch(() => live && setState({ docs: [], truncated: false }));
    return () => { live = false; };
  }, [ws?.tree, ws?.store.source]);
  return state;
}

/** Which files a folder link stands for, main file first: `<folder>.md`, DESIGN.md, the spine, index.md… */
const MAIN = [/^ARCHITECTURE-SPINE\.md$/i, /^DESIGN\.md$/i, /^index\.md$/i, /^prd\.md$/i, /^brief\.md$/i, /^README\.md$/i];

export interface ResolvedDoc {
  path: string;
  text: string;
  /** Other docs in the same run folder (DESIGN.md and EXPERIENCE.md, say), when a folder was linked. */
  siblings: string[];
}

/** Opens the first candidate that exists; a folder opens its main file. */
export async function resolveDoc(src: FileSource, link: DocLink): Promise<ResolvedDoc | null> {
  for (const candidate of link.candidates) {
    const path = normalisePath(candidate);
    if (/\.[a-z]+$/i.test(path)) {
      const text = await src.read(path).catch(() => null);
      if (text !== null) return { path, text, siblings: [] };
    }
    const entries = await src.list(path).catch(() => null);
    const files = (entries ?? []).filter((e) => e.kind === 'file' && /\.(md|ya?ml)$/i.test(e.name)).map((e) => e.name).sort();
    if (!files.length) continue;
    const folder = path.slice(path.lastIndexOf('/') + 1);
    const main = files.find((f) => f === `${folder}.md`) ?? MAIN.map((re) => files.find((f) => re.test(f))).find(Boolean) ?? files[0] ?? '';
    const text = await src.read(join(path, main)).catch(() => null);
    if (text !== null) return { path: join(path, main), text, siblings: files.map((f) => join(path, f)) };
  }
  return null;
}
