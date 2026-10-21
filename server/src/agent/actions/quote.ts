// EX9.1: argv quoting — the only place an action's argv becomes a command string
// @see docs/phases/phase-ex9.md §3

/** Characters that never need quoting in POSIX sh (the shlex.quote safe set). */
const SAFE_ARG = /^[A-Za-z0-9_@%+=:,./-]+$/;
const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export class ArgvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgvError';
  }
}

/**
 * Quote one argument for sh. Safe strings are left as they are so commands stay
 * readable in the approval card and the audit log; anything else is wrapped in
 * single quotes. NUL, CR and LF are refused outright.
 */
export function quoteArg(arg: string): string {
  if (typeof arg !== 'string') throw new ArgvError('argument must be a string');
  if (/[\0\r\n]/.test(arg)) throw new ArgvError('argument contains a control character');
  if (arg === '') return "''";
  if (SAFE_ARG.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export interface CommandTarget {
  /** prefix `sudo -n` */
  sudo?: boolean;
  /** EX5 sandbox: run inside this container (name comes from the server, never the model) */
  sandboxContainer?: string;
}

/** Turn argv into the single command string sent over SSH. */
export function toCommand(argv: string[], target: CommandTarget = {}): string {
  if (argv.length === 0) throw new ArgvError('empty argv');
  if (!PROGRAM.test(argv[0]!)) throw new ArgvError(`invalid program name: ${argv[0]}`);
  const parts = argv.map(quoteArg);
  if (target.sudo) parts.unshift('sudo', '-n');
  if (target.sandboxContainer) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(target.sandboxContainer)) {
      throw new ArgvError('invalid sandbox container name');
    }
    parts.unshift('docker', 'exec', target.sandboxContainer);
  }
  return parts.join(' ');
}
