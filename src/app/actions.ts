/** Board actions with user feedback: every write ends in a toast that names the commit or the PR. */
import { toast } from 'sonner';
import type { LeafStatus, TicketChange } from '../domain';
import type { BoardState } from './board-context';
import type { Ticket } from './view-model';

export async function applyWithToast(state: BoardState, workspaceId: string, changes: TicketChange[], done: string) {
  const result = await state.board.apply(workspaceId, changes);
  if (result instanceof Error) {
    toast.error('Could not save the change', { description: result.message });
    return false;
  }
  const where = result.pullRequestUrl ? 'on the pull request' : result.commit ? `in commit ${result.commit.slice(0, 7)}` : 'to disk';
  toast.success(done, {
    description: `Saved ${where}.`,
    ...(result.pullRequestUrl ? { action: { label: 'Open PR', onClick: () => window.open(result.pullRequestUrl, '_blank', 'noopener') } } : {}),
  });
  return true;
}

export function setStatus(state: BoardState, ticket: Ticket, status: LeafStatus) {
  if (ticket.readOnly || status === ticket.leaf.status) return Promise.resolve(false);
  return applyWithToast(state, ticket.workspaceId, [{ kind: 'mark', key: ticket.leaf.key, status }], `${ticket.ref} is now ${status}`);
}
