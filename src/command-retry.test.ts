import { test } from 'bun:test';
import { verifyCommandRetry } from './command-retry.ts';

test(
  'a player command is sent again only after an in-budget HTTP 503, an in-budget rate_limited wait of at most 60 seconds, or one session recovery that logs in',
  async () => {
    const failure = await verifyCommandRetry();
    if (failure) throw new Error(failure);
  },
  { timeout: 300_000 },
);
