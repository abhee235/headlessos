// EX8.8: CodeEditor wrapper — lazy Monaco chunk behind the branded spinner.
// Monaco itself needs real layout APIs, so the impl is mocked; the editor is
// checked end to end with Playwright (see docs/phases/phase-ex8.md).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeEditor } from '../../src/components/ui/code-editor';
import type { CodeEditorProps } from '../../src/components/ui/code-editor';

let release: () => void = () => {};
const gate = new Promise<void>((r) => { release = r; });

vi.mock('../../src/components/ui/code-editor-impl', async () => {
  await gate;
  return {
    default: (p: CodeEditorProps) => (
      <textarea data-testid="impl" data-path={p.path} value={p.value} onChange={(e) => p.onChange?.(e.target.value)} />
    ),
  };
});

describe('CodeEditor', () => {
  it('shows the H spinner until Monaco loads, then passes props through', async () => {
    const onChange = vi.fn();
    render(<CodeEditor path="/srv/app.ts" value="const a = 1;" onChange={onChange} />);

    expect(screen.getByRole('status')).toHaveTextContent('Opening editor…');

    release();
    const impl = await screen.findByTestId('impl');
    expect(impl).toHaveAttribute('data-path', '/srv/app.ts');
    expect(impl).toHaveValue('const a = 1;');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
