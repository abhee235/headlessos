// M15.2: Desktop diagnostics
// @see docs/phases/phase-15.md
//
// Plain Node with no Electron imports, so the tests can load it.

/**
 * What to do when the backend process exits.
 * @param {{ stopping: boolean, ready: boolean }} state
 * @returns {'ignore' | 'failed-to-start' | 'ask'}
 */
function backendExitAction({ stopping, ready }) {
  if (stopping) return 'ignore'; // the app is quitting and stopped it
  return ready ? 'ask' : 'failed-to-start';
}

module.exports = { backendExitAction };
