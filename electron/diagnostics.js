// M15.2, M15.3: Desktop diagnostics: what to do when the backend exits, and the log file
// @see docs/phases/phase-15.md
//
// Plain Node with no Electron imports, so the tests can load it.

const fs = require('fs');
const path = require('path');

const LOG_MAX_BYTES = 5 * 1024 * 1024;

// The same patterns as server/src/agent/actions/redact.ts: main.js is not bundled with the
// server, so it can't import them. diagnostics.test.ts feeds both the same samples.
const SECRET_KEY = '[A-Za-z0-9_.-]*(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*';
const NOT_A_SECRET = /^["']?(\[(redacted|[a-z ]+ removed)\]|true|false|null|yes|no|on|off|\d+)["']?$/i;

const RULES = [
  [/-----BEGIN ([A-Z0-9 ]*)PRIVATE KEY-----.*/g, '[private key removed]'],
  [/\b([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+):([^@\s/]+)@/gi, '$1:[redacted]@'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{16,}=*/g, '$1 [redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[token removed]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[aws key removed]'],
  [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g, '[api key removed]'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, '[github token removed]'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, '[gitlab token removed]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[slack token removed]'],
  [/\$(?:1|5|6|y|2[aby])\$[./A-Za-z0-9$]{20,}/g, '[hash removed]'],
  // withToken() carries the API token in a query string, and Fastify logs request URLs
  [/([?&]token=)[^&\s"']+/gi, '$1[redacted]'],
  // Fastify puts this computer's name on every line, and people paste logs into issues
  [/"hostname":"[^"]*",?/g, ''],
  [
    new RegExp(`(["']?\\b${SECRET_KEY}["']?)(\\s*[=:]\\s*)("[^"\\n]*"|'[^'\\n]*'|\\[(?:redacted|[a-z ]+ removed)\\]|[^\\s,;}\\]]+)`, 'gi'),
    (m, key, sep, value) =>
      // PWD / OLDPWD are directories; flags and numbers are not secrets
      /^["']?(old)?pwd["']?$/i.test(key) || NOT_A_SECRET.test(value) ? m : `${key}${sep}[redacted]`,
  ],
];

/** Remove secrets from one line of log text */
function redactLogLine(line) {
  return RULES.reduce((out, [re, replace]) => out.replace(re, replace), line);
}

/**
 * The desktop app's log. Writes are synchronous so the last lines before a crash reach the
 * disk, and a failed write is ignored: a log must never take the app down.
 * @param {{ dir: string, home?: string, maxBytes?: number, now?: () => Date }} options
 *   home: the user's home folder, shown as ~ because it usually holds their name
 */
function createLog({ dir, home, maxBytes = LOG_MAX_BYTES, now = () => new Date() }) {
  const file = path.join(dir, 'headlessos.log');
  const oldFile = path.join(dir, 'headlessos.1.log');
  const partial = new Map(); // source → text waiting for its newline
  // As written, in a URL or log text with / and, on Windows, escaped inside JSON
  const homes = home
    ? [...new Set([home.replaceAll('\\', '\\\\'), home.replaceAll('\\', '/'), home])]
    : [];
  let size = null;

  function line(source, text) {
    // HEADLESSOS_TOKEN is the API token, printed for main.js to read
    if (!text.trim() || text.includes('HEADLESSOS_TOKEN:')) return;
    try {
      const clean = homes.reduce((out, h) => out.replaceAll(h, '~'), redactLogLine(text));
      const entry = `${now().toISOString()} [${source}] ${clean}\n`;
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (size === null) size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > 0 && size + entry.length > maxBytes) {
        fs.renameSync(file, oldFile);
        size = 0;
      }
      fs.appendFileSync(file, entry, { mode: 0o600 });
      size += entry.length;
    } catch {
      size = null;
    }
  }

  /** Add a chunk of process output. Only whole lines are written, so the filter sees whole lines. */
  function write(source, chunk) {
    const lines = ((partial.get(source) ?? '') + chunk).split(/\r?\n/);
    partial.set(source, lines.pop());
    for (const text of lines) line(source, text);
  }

  /** Write what is still waiting for a newline, for when the process has exited */
  function flush() {
    for (const [source, text] of partial) line(source, text);
    partial.clear();
  }

  return { file, line, write, flush };
}

/** Words for how the backend ended. A process killed on Windows reports a huge number. */
function describeExit(code) {
  return Number.isSafeInteger(code) ? `exited with code ${code}` : 'was stopped';
}

/**
 * What to do when the backend process exits.
 * @param {{ stopping: boolean, ready: boolean }} state
 * @returns {'ignore' | 'failed-to-start' | 'ask'}
 */
function backendExitAction({ stopping, ready }) {
  if (stopping) return 'ignore'; // the app is quitting and stopped it
  return ready ? 'ask' : 'failed-to-start';
}

module.exports = { backendExitAction, createLog, describeExit, redactLogLine };
