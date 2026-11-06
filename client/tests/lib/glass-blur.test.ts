// M15.20: the built app keeps its glass. Tailwind's build runs Lightning CSS, which treats
// backdrop-filter and -webkit-backdrop-filter as one property and keeps the last. Chromium ignores
// the prefixed one, so a stylesheet that ends on it has no blur in any built app, while the dev
// server, which doesn't minify, looks fine. The test runs the stylesheet through that same step.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transform } from 'lightningcss';

const source = readFileSync(resolve(__dirname, '../../src/styles.css'), 'utf8');

const built = transform({
  filename: 'styles.css',
  code: Buffer.from(source),
  minify: true,
  errorRecovery: true,
}).code.toString();

function rule(selector: string): string {
  const start = built.search(new RegExp(`(^|[{},])\\${selector}\\{`));
  if (start === -1) throw new Error(`${selector} is not in the built stylesheet`);
  const open = built.indexOf('{', start + 1);
  return built.slice(open + 1, built.indexOf('}', open));
}

describe('glass in the built stylesheet', () => {
  it.each(['.glass', '.glass-heavy', '.lumen-menubar'])('%s keeps a blur Chromium can use', (selector) => {
    expect(rule(selector)).toMatch(/(^|;)backdrop-filter:/);
  });
});
