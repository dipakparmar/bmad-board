import { expect, test } from 'bun:test';
import { textPreview } from './text-preview';
test('long verification criteria stay bounded and do not leak raw Markdown into a card', () => {
  const criteria = 'Verify: 1. **Check the order total before any discount.** The `total` in [the checkout summary](docs/checkout.md) must match the cart.\n\n' + '2. **Discount codes gain an explicit expiry field.** Detailed pricing requirements. '.repeat(80);
  const preview = textPreview(criteria);
  expect(preview.length).toBeLessThanOrEqual(280);
  expect(preview.endsWith('…')).toBe(true);
  expect(preview).not.toContain('**');
  expect(preview).not.toContain('`');
  expect(preview).toContain('the checkout summary');
  expect(criteria).toContain('**Check');
});
test('short notes retain their content without adding an ellipsis', () => {
  expect(textPreview('Blocked: waiting on **approval**.')).toBe('Blocked: waiting on approval.');
});
