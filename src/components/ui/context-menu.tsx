/** Right-click menu built on base-ui's ContextMenu; items, separators and submenus reuse ./menu. */
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import type * as React from 'react';
import { cn } from '@/lib/cn';

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

function ContextMenuPopup({ className, children, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Popup>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="z-50">
        <ContextMenuPrimitive.Popup
          className={cn('relative flex min-w-44 origin-(--transform-origin) rounded-lg border bg-popover shadow-lg/5 outline-none transition-[scale,opacity] duration-150 ease-out data-starting-style:scale-98 data-starting-style:opacity-0', className)}
          {...props}
        >
          <div className="max-h-(--available-height) w-full overflow-y-auto p-1">{children as React.ReactNode}</div>
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export { ContextMenu, ContextMenuPopup, ContextMenuTrigger };
