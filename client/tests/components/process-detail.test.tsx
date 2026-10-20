// EX8.6: Task Manager process detail card
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ProcessDetailCard,
  formatPriority,
  formatStarted,
  shortProcessName,
} from '../../src/components/TaskManager/ProcessDetailCard';

vi.mock('../../src/lib/api', () => ({
  fetchProcessDetail: vi.fn(async () => ({ success: true, data: { pid: 4205, threads: 2, nice: 10, startedAt: null } })),
}));
// recharts needs layout APIs jsdom lacks; the chart itself isn't under test here
vi.mock('../../src/components/TaskManager/parts', () => ({
  Sparkline: () => <div data-testid="sparkline" />,
  SERIES: { cpu: { color: 'var(--chart-1)' } },
}));

const proc = {
  pid: 4205, user: 'testuser', cpu: 38, memory: 0.02, vsz: 1000, rss: 3379,
  stat: 'R', started: '16:28', time: '0:01', command: 'top -b -n 1',
};

describe('process detail helpers', () => {
  it('labels nice values', () => {
    expect(formatPriority(10)).toBe('10 · low');
    expect(formatPriority(0)).toBe('0 · normal');
    expect(formatPriority(-5)).toBe('-5 · high');
    expect(formatPriority(null)).toBe('—');
  });

  it('falls back to the ps aux start column without lstart', () => {
    expect(formatStarted(null, '16:28')).toBe('16:28');
    expect(formatStarted('not a date', '16:28')).toBe('not a date');
  });

  it('derives a short name from the command', () => {
    expect(shortProcessName('/usr/sbin/sshd -D')).toBe('sshd');
    expect(shortProcessName('top -b -n 1')).toBe('top');
  });
});

describe('ProcessDetailCard', () => {
  const base = {
    serverId: 's1',
    cpuHistory: [{ t: 1, cpu: 30 }, { t: 2, cpu: 38 }],
    status: { variant: 'success' as const, label: 'Running' },
    busy: false,
  };

  it('shows identity, command and facts, and loads threads/priority', async () => {
    render(<ProcessDetailCard {...base} process={proc} onSignal={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'top' })).toBeInTheDocument();
    expect(screen.getByText('top -b -n 1')).toBeInTheDocument();
    expect(screen.getByText('3.3 MB')).toBeInTheDocument();
    expect(await screen.findByText('10 · low')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('38.0%')).toBeInTheDocument();
  });

  it('Suspend sends SIGSTOP; a stopped process offers Resume (SIGCONT); End task sends SIGTERM', () => {
    const onSignal = vi.fn();
    const { rerender } = render(<ProcessDetailCard {...base} process={proc} onSignal={onSignal} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Suspend/ }));
    expect(onSignal).toHaveBeenLastCalledWith(19);
    fireEvent.click(screen.getByRole('button', { name: /End task/ }));
    expect(onSignal).toHaveBeenLastCalledWith(15);
    rerender(<ProcessDetailCard {...base} process={{ ...proc, stat: 'T' }} onSignal={onSignal} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    expect(onSignal).toHaveBeenLastCalledWith(18);
  });

  it('closes from the round X', () => {
    const onClose = vi.fn();
    render(<ProcessDetailCard {...base} process={proc} onSignal={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close process details' }));
    expect(onClose).toHaveBeenCalled();
  });
});
