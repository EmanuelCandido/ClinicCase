import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../src/services/promisePool.js';

test('preserva a ordem e respeita o limite de concorrência', async () => {
  let active = 0;
  let maximumActive = 0;
  const progress = [];
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, value % 2 ? 3 : 1));
    active -= 1;
    return value * 10;
  }, (completed, total) => progress.push([completed, total]));

  assert.deepEqual(result, [10, 20, 30, 40, 50]);
  assert.equal(maximumActive, 2);
  assert.deepEqual(progress.at(-1), [5, 5]);
});
