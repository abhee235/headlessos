// M0.2: Service Container — Base Service
// @see docs/phases/phase-0.md

import type { ServiceContainer } from './container.js';

/**
 * Abstract base class for all HeadlessOS backend services.
 *
 * Lifecycle:
 *   1. construct() — set up internal data structures (no cross-service deps)
 *   2. init()      — wire to other services via this.services.get()
 *   3. destroy()   — cleanup: close connections, clear intervals
 *
 * Subclasses override _construct(), _init(), _destroy() as needed.
 */
export abstract class BaseService {
  protected services!: ServiceContainer;
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** Called by ServiceContainer during boot phase 1 */
  async construct(services: ServiceContainer): Promise<void> {
    this.services = services;
    await this._construct();
  }

  /** Called by ServiceContainer during boot phase 2 */
  async init(): Promise<void> {
    await this._init();
  }

  /** Called by ServiceContainer during shutdown (reverse order) */
  async destroy(): Promise<void> {
    await this._destroy();
  }

  /** Override: set up internal data structures. No cross-service deps. */
  protected async _construct(): Promise<void> {}

  /** Override: wire to other services. this.services.get('name') works here. */
  protected async _init(): Promise<void> {}

  /** Override: cleanup — close connections, clear intervals. */
  protected async _destroy(): Promise<void> {}
}
