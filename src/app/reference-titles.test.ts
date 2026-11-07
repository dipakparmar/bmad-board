import { expect, test } from 'bun:test';
import { documentTitle, referencedTicket } from './reference-titles';
import type { Ticket } from './view-model';
const ticket = (workspaceId: string, initiative: string, title: string): Ticket => ({ workspaceId, ref: '3.4', initiative: { slug: initiative }, leaf: { title } } as Ticket);
test('references resolve in their project and initiative, avoiding arbitrary matches', () => {
  const context = ticket('demo', 'a', 'Context');
  const same = ticket('demo', 'a', 'Nightly report export');
  const another = ticket('demo', 'b', 'Different story');
  const unrelated = ticket('other', 'a', 'Other project');
  expect(referencedTicket('3.4', context, [unrelated, another, same])).toBe(same);
  expect(referencedTicket('3.4', context, [unrelated])).toBeUndefined();
  expect(referencedTicket('3.4', ticket('demo', 'c', ''), [same, another])).toBeUndefined();
});
test('doc chips use frontmatter titles or real Markdown headings rather than raw filenames', () => {
  expect(documentTitle('---\ntitle: Login form validation\n---\n# Heading')).toBe('Login form validation');
  expect(documentTitle('```md\n# Example heading\n```\n# Real document title')).toBe('Real document title');
  expect(documentTitle('A document without a heading')).toBeUndefined();
  expect(documentTitle('# Epics\n\n## Nightly export\nContent', 'nightly-export')).toBe('Nightly export');
});
