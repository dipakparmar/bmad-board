import { describe, expect, test } from 'bun:test';
import { docKind, docLinks, docOutline, headingSlug } from './docs';

const ctx = { baseDir: '_bmad-output/initiative-checkout/tickets/epic-pricing/tickets', initiativeDir: '_bmad-output/initiative-checkout', outputFolder: '_bmad-output' };

describe('linked docs', () => {
  test('collects front matter, references, a References section, citations and markdown links', () => {
    const links = docLinks({
      frontmatter: { sources: ['{project-root}/_bmad-output/initiative-checkout/prd-checkout/prd-checkout.md'], companions: ['_bmad-output/initiative-checkout/ux-checkout/'] },
      references: ['architecture-checkout/architecture-checkout.md#ad-8'],
      body: [
        '## Story', 'See [the plan](./story-a-plan.md).', '',
        '## References', '- parent — _bmad-output/initiative-checkout/initiative-checkout.md, section Requirements', '- design — _bmad-output/initiative-checkout/ux-checkout/DESIGN.md', '',
        '## Dev Notes', '[Source: docs/architecture.md#Auth]', '```', '[x](ignored.md)', '```',
      ].join('\n'),
    }, ctx);
    expect(links.map((l) => [l.label, l.candidates[0], l.anchor, l.kind])).toEqual([
      ['source', '_bmad-output/initiative-checkout/prd-checkout/prd-checkout.md', undefined, 'prd'],
      ['companion', '_bmad-output/initiative-checkout/ux-checkout', undefined, 'ux'],
      ['reference', '_bmad-output/initiative-checkout/architecture-checkout/architecture-checkout.md', 'ad-8', 'architecture'],
      ['parent', '_bmad-output/initiative-checkout/initiative-checkout.md', undefined, 'spec'],
      ['design', '_bmad-output/initiative-checkout/ux-checkout/DESIGN.md', undefined, 'ux'],
      ['source', 'docs/architecture.md', 'Auth', 'architecture'],
      ['the plan', `${ctx.baseDir}/story-a-plan.md`, undefined, 'plan'],
    ]);
  });

  test('skips web links and repeats', () => {
    expect(docLinks({ body: '[a](https://x.dev/a.md) [b](b.md) [b again](b.md)' }, { baseDir: 'd' }).map((l) => l.candidates[0])).toEqual(['d/b.md']);
  });

  test('names doc kinds from BMAD paths', () => {
    expect(docKind('_bmad-output/planning-artifacts/prd.md')).toBe('prd');
    expect(docKind('_bmad-output/planning-artifacts/epics.md')).toBe('epics');
    expect(docKind('_bmad-output/implementation-artifacts/sprint-status.yaml')).toBe('sprint');
    expect(docKind('_bmad-output/implementation-artifacts/1-2-account-management.md')).toBe('story');
    expect(docKind('x/tickets/epic-a/epic-a-retrospective.md')).toBe('retro');
  });

  test('outlines headings with GitHub-style slugs', () => {
    expect(docOutline('# PRD\n## Goals\n## Goals\n```\n# not\n```\n### AD-8: Pricing')).toEqual([
      { depth: 1, text: 'PRD', slug: 'prd' }, { depth: 2, text: 'Goals', slug: 'goals' }, { depth: 2, text: 'Goals', slug: 'goals-1' }, { depth: 3, text: 'AD-8: Pricing', slug: 'ad-8-pricing' },
    ]);
    expect(headingSlug('Flows & States')).toBe('flows--states');
  });
});
