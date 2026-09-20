// Due dates are calendar days stored as UTC midnight, so the host timezone must never move them.
// `TZ` cannot be switched inside a running Jest worker, and `test:unit` pins it to UTC, so this
// re-runs the calculator suite in child processes that start under other host timezones.
// Local-time month arithmetic used to return the same date again (a duplicate period) for anchors
// on the 1st or at month-end.

import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const HOST_TIMEZONES = ['America/New_York', 'Europe/Rome'];
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const CHILD_TIMEOUT_MS = 120_000;

describe('calculateNextDueDate under a non-UTC host timezone', () => {
  it.each(HOST_TIMEZONES)(
    'keeps every due date on the same calendar day when the host runs in %s',
    (timezone) => {
      const run = () =>
        execFileSync(
          'npx',
          ['jest', '-c', 'jest.config.unit.ts', '--forceExit', '--testPathPattern', 'calculate-next-due-date\\.unit'],
          { cwd: BACKEND_ROOT, env: { ...process.env, NODE_ENV: 'test', TZ: timezone }, stdio: 'pipe' },
        );

      expect(run).not.toThrow();
    },
    CHILD_TIMEOUT_MS,
  );
});
