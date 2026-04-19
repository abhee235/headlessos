// EX6-D.4: Session export / import (JSON file)
// @see docs/phases/phase-ex6.md
//
// Export downloads a session's full SessionState as JSON.
// Import reads a JSON file, validates it via SessionStateSchema, and
// pushes it to the backend (`PUT /api/sessions/:id`) + sessions-store.

import { SessionStateSchema, type SessionState } from 'headlessos-shared/schemas/session';
import { saveSession, fetchSession } from './api';
import { useSessionsStore } from '../store/sessions-store';

const EXPORT_VERSION = 1;

export interface SessionExportEnvelope {
  exportVersion: typeof EXPORT_VERSION;
  exportedAt: string;
  state: SessionState;
}

/** Snapshot the current in-memory state for serverId, falling back to cold tier. */
async function getSessionForExport(serverId: string): Promise<SessionState | null> {
  const inMemory = useSessionsStore.getState().sessions[serverId];
  if (inMemory) return inMemory;
  return await fetchSession(serverId);
}

/** Trigger a browser download of `data` as `filename`. */
function downloadAsFile(data: string, filename: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export a session as a JSON file. Returns true if the download was
 * triggered, false if the session could not be found.
 */
export async function exportSession(serverId: string): Promise<boolean> {
  const state = await getSessionForExport(serverId);
  if (!state) return false;
  const envelope: SessionExportEnvelope = {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  const json = JSON.stringify(envelope, null, 2);
  const safeId = state.serverId.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadAsFile(json, `headlessos-session-${safeId}.json`);
  return true;
}

export interface ImportResult {
  ok: boolean;
  serverId?: string;
  error?: string;
}

/**
 * Import a session from a JSON file. Validates via SessionStateSchema.
 * On success, pushes to backend and refreshes summaries (does not
 * auto-activate — caller can do that).
 */
export async function importSessionFromFile(file: File): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    return { ok: false, error: `Failed to read file: ${(err as Error).message}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${(err as Error).message}` };
  }

  // Accept either a bare SessionState OR an envelope { state: SessionState }
  const candidate =
    raw && typeof raw === 'object' && 'state' in raw
      ? (raw as SessionExportEnvelope).state
      : raw;

  const parsed = SessionStateSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Schema validation failed: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    };
  }

  // Always treat imports as hibernated so the UI prompts the user to wake
  // them explicitly (and so we don't claim a live SSH connection).
  const imported: SessionState = {
    ...parsed.data,
    lifecycle: 'hibernated',
    hibernatedAt: new Date().toISOString(),
  };

  try {
    await saveSession(imported);
    // Refresh summaries so the imported session shows up in the switcher
    await useSessionsStore.getState().loadAll();
    return { ok: true, serverId: imported.serverId };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to save imported session: ${(err as Error).message}`,
    };
  }
}

/** Open a hidden file picker and import the selected file. */
export async function importSessionViaPicker(): Promise<ImportResult> {
  if (typeof document === 'undefined') {
    return { ok: false, error: 'No DOM available' };
  }
  return await new Promise<ImportResult>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ ok: false, error: 'No file selected' });
        return;
      }
      const result = await importSessionFromFile(file);
      resolve(result);
    };
    input.click();
  });
}
