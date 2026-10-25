// EX10.9: the next prompt refines the open view; an unclear request gets a question
// @see docs/phases/phase-ex10.md §9c

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UIAgentView } from '@/components/Agent/UIAgentView';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAgentStore } from '@/store/agent-store';
import { useDynamicUIStore } from '@/store/dynamic-ui-store';
import { useDesktopStore } from '@/store/window-store';
import * as api from '@/lib/api';

let nextId = 0;
const mockGenerate = vi.fn((prompt: string) => {
  const id = `req-${++nextId}`;
  useAgentStore.getState().addSession(id, 'server-1', prompt);
  return id;
});

vi.mock('@/hooks/useUIAgent', () => ({
  useUIAgent: () => ({ generate: mockGenerate, abort: vi.fn(), writeBack: vi.fn(), connected: true }),
}));

const VIEW = {
  title: 'Disk',
  sidebarItems: [{ id: 'disk', label: 'Disk' }],
  sections: { disk: { layout: 'stack', children: [{ type: 'stat-card', title: 'Root', value: '6', unit: '%' }] } },
};
const META = { sessionId: 's', latencyMs: 1000, stepsCompleted: 3, reflectionLoops: 0, models: {} };

function renderView() {
  return render(<TooltipProvider><UIAgentView serverId="server-1" /></TooltipProvider>);
}
const composer = () => screen.getByRole('textbox') as HTMLTextAreaElement;
function send(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: 'Enter' });
}
const dynamicWindows = () => useDesktopStore.getState().windows.filter((w) => w.appId === 'dynamic-ui');
/** the pinned view shown in the (only) open dynamic window */
const openView = () => useDynamicUIStore.getState().getViewForWindow(dynamicWindows()[0]!.id);

describe('UIAgentView follow-ups and questions (EX10.9)', () => {
  beforeEach(() => {
    vi.spyOn(api, 'checkDockerAvailable').mockResolvedValue(false);
    mockGenerate.mockClear();
    nextId = 0;
    act(() => {
      useAgentStore.getState().clearSessions();
      for (const w of useDesktopStore.getState().windows) useDesktopStore.getState().closeWindow(w.id);
      useDynamicUIStore.getState().unpinAllForServer('server-1');
    });
  });

  it('refines the open view: the chip, the follow-up, and the same window', () => {
    renderView();
    send('show disk usage');
    expect(dynamicWindows()).toHaveLength(1);
    expect(composer().value).toBe(''); // cleared for the next prompt
    act(() => useAgentStore.getState().completeSession('req-1', VIEW, META));

    expect(screen.getByTestId('refine-chip').textContent).toContain('Refining “Disk”');
    expect(composer().placeholder).toMatch(/^Describe the change/);

    send('add a memory chart');
    expect(mockGenerate).toHaveBeenLastCalledWith('add a memory chart', expect.objectContaining({ followUp: { prompt: 'show disk usage', view: VIEW } }));
    expect(dynamicWindows()).toHaveLength(1); // the same window, not a new one
    expect(openView()?.loading).toBe(true);
  });

  it('"New view" starts fresh: no follow-up, a new window', () => {
    renderView();
    send('show disk usage');
    act(() => useAgentStore.getState().completeSession('req-1', VIEW, META));
    fireEvent.click(screen.getByTestId('refine-new-view'));
    expect(screen.queryByTestId('refine-chip')).toBeNull();
    send('show docker');
    expect(mockGenerate.mock.calls.at(-1)![1]).not.toHaveProperty('followUp');
    expect(dynamicWindows()).toHaveLength(2);
  });

  it('a question: shown, its empty window closed, and the answer sent with the request', () => {
    renderView();
    send('help');
    expect(dynamicWindows()).toHaveLength(1);
    act(() => useAgentStore.getState().askSession('req-1', 'Which part of the server: logs, Docker or services?'));

    expect(screen.getByTestId('agent-question').textContent).toBe('The agent asksWhich part of the server: logs, Docker or services?');
    expect(dynamicWindows()).toHaveLength(0);
    expect(composer().placeholder).toBe('Your answer…');
    expect(screen.queryByTestId('refine-chip')).toBeNull();

    send('logs');
    expect(mockGenerate).toHaveBeenLastCalledWith('help — logs', expect.not.objectContaining({ followUp: expect.anything() }));
  });

  it('keeps the open view when a follow-up ends in a question, and the answer still refines it', () => {
    renderView();
    send('show disk usage');
    act(() => useAgentStore.getState().completeSession('req-1', VIEW, META));
    send('make it better');
    act(() => useAgentStore.getState().askSession('req-2', 'Better how: more detail, or a chart?'));
    expect(dynamicWindows()).toHaveLength(1);
    expect(openView()?.loading).toBe(false);
    expect(openView()?.view?.title).toBe('Disk'); // the open view stays

    send('a chart');
    expect(mockGenerate).toHaveBeenLastCalledWith('make it better — a chart', expect.objectContaining({ followUp: { prompt: 'show disk usage', view: VIEW } }));
    expect(dynamicWindows()).toHaveLength(1);
    expect(openView()?.loading).toBe(true);
  });
});

describe('agent store askSession (EX10.9)', () => {
  it('marks the session as a question, and keeps it out of the run history', () => {
    act(() => {
      useAgentStore.getState().clearSessions();
      useAgentStore.getState().addSession('q-1', 'server-1', 'help');
      useAgentStore.getState().askSession('q-1', 'Which part?');
    });
    expect(useAgentStore.getState().getSession('q-1')).toMatchObject({ status: 'question', question: 'Which part?' });
  });
});
