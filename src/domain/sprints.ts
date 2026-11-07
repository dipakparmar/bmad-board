export interface SprintDefinition {
  id: string;
  start?: string;
  end?: string;
  status?: string;
}
const date = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
};
export function parseSprintDefinitions(value: unknown): SprintDefinition[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const fields = raw as Record<string, unknown>;
    return [{ id, start: date(fields.start ?? fields.start_date), end: date(fields.end ?? fields.end_date), status: typeof fields.status === 'string' ? fields.status.toLowerCase() : undefined }];
  });
}
export function currentSprint(sprints: SprintDefinition[], now = new Date()): SprintDefinition | undefined {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const eligible = sprints.filter((s) => s.status !== 'closed' && (!s.start || s.start <= today));
  const latest = (a: SprintDefinition, b: SprintDefinition) => (b.start ?? '').localeCompare(a.start ?? '') || a.id.localeCompare(b.id);
  return eligible.filter((s) => s.start && s.end && s.start <= today && today <= s.end).sort(latest)[0]
    ?? eligible.filter((s) => s.status === 'active').sort(latest)[0];
}

/** Unknown calendars fall back to all tickets. An explicit sprint or unscheduled choice stays exact. */
export function matchesSprint(sprint: string | undefined, selection: string | undefined, definitions: SprintDefinition[], now = new Date()): boolean {
  const selected = selection ?? 'current';
  if (selected === 'all') return true;
  if (selected === 'unscheduled') return !sprint;
  if (selected === 'current') {
    const current = currentSprint(definitions, now);
    return !current || sprint === current.id;
  }
  return sprint === selected;
}
