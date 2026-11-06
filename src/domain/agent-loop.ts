/**
 * The human ↔ agent loop around a ticket. BMAD's agents run in the person's coding tool, so the board
 * hands work over as ready-to-paste prompts naming the right skill, and shows what agents did.
 */
import type { Leaf } from './ticket-tree';

export interface Handoff {
  /** Short button label. */
  label: string;
  /** The BMAD skill that does the work. */
  skill: string;
  /** What to paste into Claude Code (or another agent) to start it. */
  prompt: string;
  /** Why this is the next step for the ticket. */
  why: string;
}

/** Checklist progress in a plan body: `- [x]` done of all `- [ ]` items. */
export function planProgress(body: string | undefined): { done: number; total: number } | null {
  if (!body) return null;
  const items = [...body.matchAll(/^\s*[-*]\s+\[([ xX])\]/gm)];
  if (items.length === 0) return null;
  return { done: items.filter((m) => m[1] !== ' ').length, total: items.length };
}

/** Built or in review: agents stop here and a person decides it is done. */
export function awaitsPerson(leaf: Leaf): boolean {
  return leaf.status === 'built' || leaf.status === 'in-review';
}

/** The next hand-offs for a ticket, most useful first. `ref` is the BMAD ref (`1.2`, or a backlog file stem). */
export function handoffs(leaf: Leaf, ref: string, readiness: 'ready' | 'refine' | 'blocked' | 'active' | 'closed'): Handoff[] {
  const out: Handoff[] = [];
  const kind = leaf.type === 'bug' ? 'bug' : leaf.type === 'spike' ? 'spike' : 'story';
  if (readiness === 'refine' || (leaf.entry?.unknown && readiness !== 'closed')) {
    out.push({
      label: 'Refine with Sofia',
      skill: 'bmad-agent-po',
      prompt: `Use bmad-agent-po to review ${kind} ${ref} with me and write its acceptance criteria.${leaf.entry?.unknown ? ` First settle this open question: ${leaf.entry.unknown}` : ''}`,
      why: leaf.entry?.unknown ? 'It has an open question that blocks the build.' : 'It needs full acceptance criteria before a build.',
    });
  }
  if (readiness === 'ready') {
    out.push({
      label: 'Build it',
      skill: 'bmad-build',
      prompt: `Use bmad-build to build ${kind} ${ref}.`,
      why: 'Its prerequisites are met, so a build can start.',
    });
    if (!leaf.hitl) {
      out.push({
        label: 'Build unattended',
        skill: 'bmad-build-auto',
        prompt: `Use bmad-build-auto to build ${kind} ${ref} without stopping for questions.`,
        why: 'No person is needed for this one, so it can run unattended.',
      });
    }
  }
  if (leaf.status === 'in-progress' || leaf.status === 'draft' || leaf.status === 'ready-for-dev') {
    out.push({ label: 'Resume the build', skill: 'bmad-build', prompt: `Use bmad-build to resume ${kind} ${ref} from its plan.`, why: 'A build started and has not finished.' });
  }
  if (awaitsPerson(leaf)) {
    out.push({
      label: 'Review the code',
      skill: 'bmad-code-review',
      prompt: `Use bmad-code-review to review ${kind} ${ref}${leaf.plan?.baselineRevision ? ` against ${leaf.plan.baselineRevision}` : ''}.`,
      why: 'The build finished; review it before you mark it done.',
    });
  }
  if (leaf.status === 'blocked' || leaf.plan?.blockedAt) {
    out.push({
      label: 'Unblock with the agent',
      skill: 'bmad-build',
      prompt: `${kind[0]?.toUpperCase()}${kind.slice(1)} ${ref} is blocked: ${leaf.plan?.blockedReason ?? 'see its plan'}. Here is the answer: `,
      why: 'The build halted and is waiting on an answer.',
    });
  }
  return out;
}
