import { FolderOpen, Github, Server } from 'lucide-react';
import { useBoardContext } from '@/app/board-context';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { openFolder } from './app-sidebar';

export function EmptyState() {
  const { setDialog, board } = useBoardContext();
  return (
    <Empty className="m-auto max-w-lg">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Server /></EmptyMedia>
        <EmptyTitle>Connect a BMAD project</EmptyTitle>
        <EmptyDescription>
          For a local checkout, run <code>bun run start -- --root &lt;project&gt;</code>. Each change becomes a git commit. A GitHub repo works too, and your edits go to a pull request. You can also open a folder to browse it read-only.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button onClick={() => setDialog('github')}><Github />Connect GitHub repo</Button>
        <Button variant="outline" onClick={() => void openFolder((s) => board.add(s))}><FolderOpen />Open folder</Button>
      </EmptyContent>
    </Empty>
  );
}
