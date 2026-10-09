import { useCallback, useEffect, useState } from 'react';
import { formatRetryDelay, getAiRetryAfterSeconds } from '../services/retryAfter.js';

export default function useAiRateLimit() {
  const [deadline, setDeadline] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [baseMessage, setBaseMessage] = useState('');

  useEffect(() => {
    if (!deadline) return undefined;

    const updateRemaining = () => {
      const nextRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);
      if (!nextRemaining) {
        setDeadline(0);
        setBaseMessage('');
      }
    };

    updateRemaining();
    const intervalId = globalThis.setInterval(updateRemaining, 250);
    return () => globalThis.clearInterval(intervalId);
  }, [deadline]);

  const registerRateLimit = useCallback((error, suffix = '') => {
    const seconds = getAiRetryAfterSeconds(error);
    if (!seconds) return false;

    setBaseMessage(`${error.message || 'O limite de uso da IA foi atingido.'}${suffix}`);
    setRemainingSeconds(seconds);
    setDeadline(Date.now() + (seconds * 1000));
    return true;
  }, []);

  const clearRateLimit = useCallback(() => {
    setDeadline(0);
    setRemainingSeconds(0);
    setBaseMessage('');
  }, []);

  return {
    clearRateLimit,
    isRateLimited: remainingSeconds > 0,
    rateLimitMessage: remainingSeconds > 0
      ? `${baseMessage} Nova tentativa em ${formatRetryDelay(remainingSeconds)}.`
      : '',
    registerRateLimit,
    remainingSeconds,
  };
}
