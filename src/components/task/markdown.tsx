import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('ticket-md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}>
        {source.replace(/<!--[\s\S]*?-->/g, '')}
      </ReactMarkdown>
    </div>
  );
}
