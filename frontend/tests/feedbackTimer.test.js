import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK_DISMISS_DELAY_MS,
  scheduleFeedbackDismiss,
} from '../src/services/feedbackTimer.js';

test('configura os avisos de canto para desaparecerem em 30 segundos', () => {
  assert.equal(FEEDBACK_DISMISS_DELAY_MS, 30_000);
});

test('agenda e permite cancelar o fechamento automático', async () => {
  let dismissCount = 0;
  scheduleFeedbackDismiss(() => { dismissCount += 1; }, 5);
  const cancel = scheduleFeedbackDismiss(() => { dismissCount += 10; }, 5);
  cancel();

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(dismissCount, 1);
});
