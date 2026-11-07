/**
 * "What's next?": groups open leaves by their next step, the same way `tickets.py next` does,
 * so the board and the agents agree on what is ready.
 */
import type { Leaf, TicketKey } from './ticket-tree';

export interface NextView {
  readyToRefine: Leaf[];
  readyToStart: Leaf[];
  inProgress: Leaf[];
  blocked: { leaf: Leaf; waitingOn: TicketKey[]; reason?: string }[];
}

/**
 * @param leaves every leaf in scope, with `after` and `gatedBy` already resolved to keys
 * @param doneContainers slugs of epics whose own status is done (an epic gate waits on these)
 */
export function whatsNext(leaves: Leaf[], doneContainers: Iterable<string> = []): NextView {
  const done = new Set<TicketKey>(doneContainers);
  for (const leaf of leaves) if (leaf.state === 'done') done.add(leaf.key);
  // A prerequisite in review counts as met; an epic gate still waits for the epic to be done.
  const met = new Set(done);
  for (const leaf of leaves) if (leaf.state === 'review') met.add(leaf.key);

  const view: NextView = { readyToRefine: [], readyToStart: [], inProgress: [], blocked: [] };
  for (const leaf of leaves) {
    if (leaf.state === 'done' || leaf.state === 'dropped') continue;
    // v6 builds stories one after another, so there the story before counts as a prerequisite.
    const sequence = leaf.links?.sequential && leaf.links.previous ? [leaf.links.previous] : [];
    const waitingOn = [...new Set([...leaf.after, ...sequence])].filter((k) => !met.has(k)).concat(leaf.gatedBy.filter((k) => !done.has(k)));
    if (leaf.status === 'blocked' || leaf.plan?.blockedAt) {
      view.blocked.push({ leaf, waitingOn, reason: leaf.plan?.blockedReason });
    } else if (leaf.state === 'in-progress' || leaf.state === 'review') {
      view.inProgress.push(leaf);
    } else if (waitingOn.length > 0) {
      view.blocked.push({ leaf, waitingOn });
    } else if (needsRefining(leaf)) {
      view.readyToRefine.push(leaf);
    } else if (leaf.entry?.unknown) {
      view.blocked.push({ leaf, waitingOn: [], reason: leaf.entry.unknown });
    } else {
      view.readyToStart.push(leaf);
    }
  }
  return view;
}

/** Bugs, leaves with no breakdown entry, and entries marked `refine` get full criteria before a build. */
export function needsRefining(leaf: Leaf): boolean {
  return (leaf.type === 'bug' || !leaf.entry || !!leaf.entry.refine) && !leaf.file?.refined;
}
