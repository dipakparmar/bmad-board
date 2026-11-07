import { useBoardContext } from '@/app/board-context';
import { referencedTicket } from '@/app/reference-titles';
import type { Ticket } from '@/app/view-model';
import { TicketReferenceChip } from './reference-chip';

/** Short UI notices such as "Waiting on 3.4" share the same title chips as Markdown refs. */
export function ReferenceText({ text, ticket }: { text: string; ticket: Ticket }) {
  const { tickets } = useBoardContext();
  const parts = text.split(/(\b\d+\.\d+[a-z]?\b)/g);
  return <>{parts.map((part, i) => {
    const target = /^\d+\.\d+[a-z]?$/.test(part) ? referencedTicket(part, ticket, tickets) : undefined;
    return target ? <TicketReferenceChip key={i} ticket={target} /> : <span key={i}>{part}</span>;
  })}</>;
}
