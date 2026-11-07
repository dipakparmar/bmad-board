import type { ResolvedPerson } from '@/domain/identities';
import type { Ticket } from './view-model';

/** Display projection only. Keep every ownership field consistent without editing the source tree. */
export function resolveTicketPeople(ticket: Ticket, resolve: (name: string) => ResolvedPerson | undefined): Ticket {
  const name = (value: string | undefined) => value ? resolve(value)?.name ?? value : value;
  return {
    ...ticket,
    leaf: { ...ticket.leaf, owner: name(ticket.leaf.owner), plan: ticket.leaf.plan ? { ...ticket.leaf.plan, assignee: name(ticket.leaf.plan.assignee) } : undefined },
    epic: ticket.epic ? { ...ticket.epic, owner: name(ticket.epic.owner) } : undefined,
    initiative: ticket.initiative ? { ...ticket.initiative, owner: name(ticket.initiative.owner) } : undefined,
  };
}
