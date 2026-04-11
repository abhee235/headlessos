// EX4: Observatory App Registration Tests
import { describe, it, expect } from 'vitest';
import { APPS } from '../../../src/lib/apps';

describe('Observatory App Registration', () => {
  const observatory = APPS.find(a => a.id === 'observatory');

  it('is registered in the app list', () => {
    expect(observatory).toBeDefined();
  });

  it('has correct properties', () => {
    expect(observatory!.name).toBe('LLM Observatory');
    expect(observatory!.icon).toBe('Telescope');
    expect(observatory!.singleInstance).toBe(true);
  });

  it('has the correct appId', () => {
    expect(observatory!.id).toBe('observatory');
  });
});
