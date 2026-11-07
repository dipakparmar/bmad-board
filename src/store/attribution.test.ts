import { expect, test } from 'bun:test';
import { changedByOf, coAuthorsOf } from './file-source';
test('keeps full Changed-by names and removes the board suffix', () => {
  expect(changedByOf('Changed-by: person:Dipak Parmar via bmad-board')).toBe('person:Dipak Parmar');
});
test('reads human and agent co-authors, deduplicating repeated trailers', () => {
  expect(coAuthorsOf('Co-authored-by: Dipak Parmar <d@example.com>\nCo-authored-by: Claude <c@example.com>\nCo-authored-by: Dipak Parmar <d@example.com>')).toEqual(['Dipak Parmar', 'Claude']);
});
