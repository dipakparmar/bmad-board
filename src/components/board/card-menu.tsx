/** Right-click menu on a ticket card (Kaneo's task card context menu): status, open, copy. */
import { Copy, Link2, Maximize2, PanelRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { setStatus } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { statusesFor, type Ticket } from '@/app/view-model';
import { STATUS_LABELS } from '@/domain';
import { ContextMenu, ContextMenuPopup, ContextMenuTrigger } from '@/components/ui/context-menu';
import { MenuItem, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger } from '@/components/ui/menu';

export function CardMenu({ ticket, children }: { ticket: Ticket; children: ReactElement }) {
  const state = useBoardContext();
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(`Copied ${what}`);
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuPopup>
        <MenuItem onClick={() => state.select(ticket.uid)}><PanelRight />Open</MenuItem>
        <MenuItem onClick={() => { state.select(ticket.uid); state.setExpanded(true); }}><Maximize2 />Open full screen</MenuItem>
        {!ticket.readOnly && (
          <MenuSub>
            <MenuSubTrigger>Set status</MenuSubTrigger>
            <MenuSubPopup>
              {statusesFor(ticket).map((s) => (
                <MenuItem key={s} disabled={s === ticket.leaf.status} onClick={() => void setStatus(state, ticket, s)}>{STATUS_LABELS[s].label}</MenuItem>
              ))}
            </MenuSubPopup>
          </MenuSub>
        )}
        <MenuSeparator />
        <MenuItem onClick={() => copy(ticket.ref, ticket.ref)}><Copy />Copy ref</MenuItem>
        <MenuItem onClick={() => copy(`${location.origin}${location.pathname}#ticket=${encodeURIComponent(ticket.ref)}&full=1`, 'link')}><Link2 />Copy link</MenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
