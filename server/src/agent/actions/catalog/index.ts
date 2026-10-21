// EX9.1: Action catalog registry
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { ACTION_CATEGORIES, MAX_TIMEOUT_MS, type ActionDef } from '../types.js';
import { SYSTEM_ACTIONS } from './system.js';
import { NETWORK_ACTIONS } from './network.js';
import { SERVICE_ACTIONS } from './services.js';
import { DOCKER_ACTIONS } from './docker.js';
import { ADMIN_ACTIONS } from './admin.js';
import { FILE_ACTIONS } from './files.js';

const ACTION_ID = /^[a-z][a-z0-9_]{2,47}$/;
/** Program/verb pairs a read action must never build (spot list, catalog-load check). */
const WRITE_VERBS = /^(rm|mv|cp|dd|chmod|chown|kill|pkill|killall|reboot|shutdown|tee|truncate)$|^(systemctl|service) (start|stop|restart|reload|enable|disable|mask)$|^docker (rm|rmi|stop|start|restart|kill|run|exec|prune)$|^apt(-get)? (install|remove|purge|upgrade|autoremove)$/;

export class CatalogError extends Error {}

export class ActionCatalog {
  private readonly actions = new Map<string, ActionDef>();

  constructor(defs: ActionDef[] = []) {
    for (const def of defs) this.add(def);
  }

  /** Add one action after checking it is well-formed. */
  add(def: ActionDef): void {
    checkAction(def);
    if (this.actions.has(def.id)) throw new CatalogError(`duplicate action id: ${def.id}`);
    this.actions.set(def.id, def);
  }

  get(id: string): ActionDef | undefined {
    return this.actions.get(id);
  }

  has(id: string): boolean {
    return this.actions.has(id);
  }

  list(filter: { risk?: ActionDef['risk'] } = {}): ActionDef[] {
    return [...this.actions.values()].filter((a) => !filter.risk || a.risk === filter.risk);
  }

  get size(): number {
    return this.actions.size;
  }

  /** Up to `n` ids closest to an unknown one (edit distance, then shared words). */
  closest(id: string, n = 3): string[] {
    const want = String(id).toLowerCase();
    const words = new Set(want.split(/[^a-z0-9]+/).filter(Boolean));
    return [...this.actions.keys()]
      .map((candidate) => {
        const shared = candidate.split('_').filter((w) => words.has(w)).length;
        return { candidate, score: editDistance(want, candidate) - shared * 3 };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, n)
      .map((x) => x.candidate);
  }
}

function checkAction(def: ActionDef): void {
  const where = `action ${def.id}`;
  if (!ACTION_ID.test(def.id)) throw new CatalogError(`${where}: id must match ${ACTION_ID}`);
  if (!def.title) throw new CatalogError(`${where}: missing title`);
  if (!def.description || def.description.length > 120) throw new CatalogError(`${where}: description must be 1–120 chars`);
  if (!ACTION_CATEGORIES.includes(def.category)) throw new CatalogError(`${where}: unknown category ${def.category}`);
  if (!(def.params instanceof z.ZodObject)) throw new CatalogError(`${where}: params must be a z.object`);
  if (def.params._def.unknownKeys !== 'strict') throw new CatalogError(`${where}: params must be .strict()`);
  if (!(def.timeoutMs > 0 && def.timeoutMs <= MAX_TIMEOUT_MS)) throw new CatalogError(`${where}: timeout out of range`);
  if (!(def.maxOutputBytes > 0 && def.maxOutputBytes <= 1024 * 1024)) throw new CatalogError(`${where}: output cap out of range`);
  if (def.risk === 'read' && def.run.kind === 'exec') {
    // Cheap guard for parameterless reads; tests build every action with sample params.
    const shape = def.params.shape as Record<string, z.ZodTypeAny>;
    if (Object.keys(shape).length === 0) {
      const argv = def.run.build({});
      const head = argv.slice(0, 2).join(' ');
      if (WRITE_VERBS.test(argv[0]!) || WRITE_VERBS.test(head)) {
        throw new CatalogError(`${where}: a read action builds a write command (${head})`);
      }
    }
  }
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/** Every seeded action (EX9.1: read only; EX9.2 adds change actions). */
export const ALL_ACTIONS: ActionDef[] = [
  ...SYSTEM_ACTIONS,
  ...NETWORK_ACTIONS,
  ...SERVICE_ACTIONS,
  ...DOCKER_ACTIONS,
  ...ADMIN_ACTIONS,
  ...FILE_ACTIONS,
] as ActionDef[];

let defaultCatalog: ActionCatalog | null = null;

/** The shared catalog, built (and checked) on first use. */
export function getDefaultCatalog(): ActionCatalog {
  defaultCatalog ??= new ActionCatalog(ALL_ACTIONS);
  return defaultCatalog;
}
