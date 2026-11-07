import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { headingSlug } from '@/domain';
import { linkifyRefs, type RefResolver } from '@/app/links';
import { cn } from '@/lib/cn';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/**
 * Markdown as BMAD writes it. With `onDocLink`, links to other repo files (not web links) open in the
 * board's reader instead of the browser, and headings get GitHub-style ids so `#anchor` links land.
 */
/**
 * With `refs`, ticket refs (`Story 1.2`), ticket file names and commit hashes in the text become links
 * that open the ticket or commit in the board.
 */
/** With `onTask`, task-list checkboxes can be ticked; it gets the checkbox's index in the source, from 0. */
export function Markdown({ source, className, onDocLink, refs, onTask }: { source: string; className?: string; onDocLink?: (href: string) => void; refs?: { resolver: RefResolver; onRef: (kind: string, value: string) => void }; onTask?: (index: number, checked: boolean) => void }) {
  const seen = new Map<string, number>();
  // Checkboxes render in source order, so a running count is each one's index.
  let task = 0;
  const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4') => ({ node: _n, children, ...props }: { node?: unknown; children?: ReactNode }) => {
    const base = headingSlug(textOf(Children.toArray(children)).replace(/[*_`]/g, ''));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return <Tag id={n ? `${base}-${n}` : base} className="scroll-mt-4" {...props}>{children}</Tag>;
  };
  const components: Components = {
    a: ({ node: _n, href, ...props }) => {
      const ref = refs && href ? /^#(ticket|name|commit)=(.+)$/.exec(href) : null;
      if (ref && refs) return <a {...props} href={href} className="ticket-ref" onClick={(e) => { e.preventDefault(); refs.onRef(ref[1] ?? '', decodeURIComponent(ref[2] ?? '')); }} />;
      const local = !!onDocLink && !!href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#');
      if (local) return <a {...props} href={`#doc`} onClick={(e) => { e.preventDefault(); onDocLink(href); }} />;
      if (href?.startsWith('#')) return <a {...props} href={href} onClick={(e) => { e.preventDefault(); document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' }); }} />;
      return <a {...props} href={href} target="_blank" rel="noreferrer" />;
    },
    ...(onTask ? {
      input: ({ node: _n, type, checked, disabled: _d, ...props }) => {
        if (type !== 'checkbox') return <input type={type} {...props} />;
        const index = task++;
        return <input {...props} type="checkbox" checked={!!checked} aria-label={checked ? 'Untick task' : 'Tick task'} className="cursor-pointer" onChange={(e) => onTask(index, e.target.checked)} />;
      },
    } : {}),
    ...(onDocLink ? { h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4') } : {}),
  };
  return (
    <div className={cn('ticket-md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {refs ? linkifyRefs(source.replace(/<!--[\s\S]*?-->/g, ''), refs.resolver) : source.replace(/<!--[\s\S]*?-->/g, '')}
      </ReactMarkdown>
    </div>
  );
}
