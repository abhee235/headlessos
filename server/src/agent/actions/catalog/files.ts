// EX9.1: read actions — files and CLI discovery (replaces the EX5-A.1 regexes)
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { readAction } from './define.js';
import {
  globPattern,
  programName,
  readPath,
  searchText,
  subcommand,
  SEARCH_EXCLUDED_DIRS,
  SEARCH_EXCLUDED_FILES,
} from '../params.js';

export const FILE_ACTIONS = [
  readAction({
    id: 'file_read',
    title: 'Read a file',
    description: 'Text of a config or log file, from the start (SFTP). Use file_tail for the end of a log.',
    category: 'files',
    keywords: ['file', 'read', 'config', 'conf', 'show', 'contents', 'cat'],
    params: z.object({
      path: readPath(),
      maxBytes: z.number().int().min(1).max(262_144).default(65_536).describe('bytes to read, ≤ 256 KiB'),
    }).strict(),
    maxOutputBytes: 262_144,
    run: { kind: 'sftp-read', path: (p) => p.path, maxBytes: (p) => p.maxBytes },
  }),
  readAction({
    id: 'dir_list',
    title: 'List a directory',
    description: 'Entries of a directory with type, permissions, owner, size and date (ls -la).',
    category: 'files',
    keywords: ['directory', 'folder', 'list', 'files', 'ls'],
    params: z.object({ path: readPath() }).strict(),
    okExitCodes: [0, 2],
    run: { kind: 'exec', build: (p) => ['ls', '-la', '--time-style=long-iso', '--', p.path] },
  }),
  readAction({
    id: 'file_find',
    title: 'Find files',
    description: 'Files or directories under a path whose name matches a pattern, up to 4 levels deep.',
    category: 'files',
    keywords: ['find', 'search', 'file', 'where', 'locate'],
    params: z.object({
      path: readPath(),
      name: globPattern(),
      type: z.enum(['file', 'dir', 'any']).default('any').describe('what to match'),
      depth: z.number().int().min(1).max(4).default(2).describe('levels below path, 1–4'),
    }).strict(),
    timeoutMs: 30_000,
    okExitCodes: [0, 1],
    run: {
      kind: 'exec',
      build: (p) => [
        'find', p.path, '-xdev', '-maxdepth', String(p.depth),
        ...(p.type === 'file' ? ['-type', 'f'] : p.type === 'dir' ? ['-type', 'd'] : []),
        '-name', p.name, '-print',
      ],
    },
  }),
  readAction({
    id: 'file_search',
    title: 'Search file contents',
    description: 'Lines containing some text in files under a path (grep, literal match, secrets skipped).',
    category: 'files',
    keywords: ['grep', 'search', 'contains', 'text', 'config', 'where is'],
    params: z.object({
      path: readPath(),
      text: searchText(),
      maxPerFile: z.number().int().min(1).max(50).default(20).describe('matches per file'),
    }).strict(),
    timeoutMs: 30_000,
    okExitCodes: [0, 1, 2],
    run: {
      kind: 'exec',
      build: (p) => [
        'grep', '-rnIF', '-m', String(p.maxPerFile),
        ...SEARCH_EXCLUDED_DIRS.map((d) => `--exclude-dir=${d}`),
        ...SEARCH_EXCLUDED_FILES.map((f) => `--exclude=${f}`),
        '-e', p.text, '--', p.path,
      ],
    },
  }),

  // ── CLI discovery (EX5): run in the sandbox when one is active ──
  readAction({
    id: 'cli_locate',
    title: 'Locate a program',
    description: 'Whether a program is installed and where (which).',
    category: 'cli',
    keywords: ['installed', 'which', 'where', 'command', 'program'],
    params: z.object({ program: programName() }).strict(),
    okExitCodes: [0, 1],
    run: { kind: 'exec', build: (p) => ['which', p.program] },
  }),
  readAction({
    id: 'cli_help',
    title: 'Program help',
    description: 'A program\'s --help text, optionally for a subcommand chain (e.g. restic backup).',
    category: 'cli',
    keywords: ['help', 'usage', 'options', 'flags', 'cli'],
    params: z.object({
      program: programName(),
      subcommands: z.array(subcommand()).max(3).default([]).describe('up to 3 subcommand words'),
    }).strict(),
    okExitCodes: [0, 1, 2],
    run: { kind: 'exec', build: (p) => [p.program, ...p.subcommands, '--help'] },
  }),
  readAction({
    id: 'cli_version',
    title: 'Program version',
    description: "A program's --version output.",
    category: 'cli',
    keywords: ['version', 'installed', 'cli'],
    params: z.object({ program: programName() }).strict(),
    okExitCodes: [0, 1, 2],
    run: { kind: 'exec', build: (p) => [p.program, '--version'] },
  }),
  readAction({
    id: 'cli_manual',
    title: 'Manual page',
    description: 'The man page of a program as plain text.',
    category: 'cli',
    keywords: ['man', 'manual', 'documentation', 'cli'],
    params: z.object({ program: programName() }).strict(),
    okExitCodes: [0, 16],
    run: { kind: 'exec', build: (p) => ['man', '-P', 'cat', p.program] },
  }),
];
