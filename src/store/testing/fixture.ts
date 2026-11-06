import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MemorySource } from '../file-source';

/** Loads an example project from disk into memory so tests can write without touching it. */
export function fixture(name: string): MemorySource {
  const root = join(import.meta.dir, '..', '..', '..', 'examples', name);
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files[relative(root, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(root);
  return new MemorySource(files, name, name);
}
