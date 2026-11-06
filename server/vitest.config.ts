import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // M16: tests must never depend on, or touch, the install secret of the computer running them
    env: { HEADLESSOS_INSTALL_SECRET: 'test-install-secret-'.padEnd(64, 'x') },
  },
});
