import { parse } from 'yaml';
import { parseSprintDefinitions, type SprintDefinition } from '../domain/sprints';
import type { FileSource } from './file-source';

/** Follow-up board definitions are read-only project data, including date windows and active state. */
export async function loadSprints(source: FileSource, outputFolder: string, problems: string[]): Promise<SprintDefinition[]> {
  const found = new Map<string, SprintDefinition>();
  for (const path of [`${outputFolder}/implementation-artifacts/sprint-status.yaml`, '_super-bmad/followup/board-config.yaml']) {
    const text = await source.read(path).catch(() => null);
    if (!text) continue;
    try {
      const doc = parse(text) as Record<string, unknown> | null;
      for (const sprint of parseSprintDefinitions(doc?.sprints)) found.set(sprint.id, sprint);
    } catch { problems.push(`${path}: could not read sprint definitions`); }
  }
  return [...found.values()].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
