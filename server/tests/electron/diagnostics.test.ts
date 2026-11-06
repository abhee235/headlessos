// M15.2: what the desktop app does when its backend exits
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { backendExitAction } = require('../../../electron/diagnostics.js');

describe('backendExitAction', () => {
  it('ignores an exit the app caused', () => {
    expect(backendExitAction({ stopping: true, ready: true })).toBe('ignore');
    expect(backendExitAction({ stopping: true, ready: false })).toBe('ignore');
  });

  it('fails the start when the backend dies before it is ready', () => {
    expect(backendExitAction({ stopping: false, ready: false })).toBe('failed-to-start');
  });

  it('asks the owner when a running backend dies', () => {
    expect(backendExitAction({ stopping: false, ready: true })).toBe('ask');
  });
});
