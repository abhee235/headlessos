// M0.2: Service Container — Container Registry
// @see docs/phases/phase-0.md

import { BaseService } from './base-service.js';

/**
 * ServiceContainer manages all backend services with a two-phase boot lifecycle:
 *   Phase 1: construct() all services (internal setup, no cross-deps)
 *   Phase 2: init() all services (cross-service wiring)
 *
 * Shutdown calls destroy() in reverse registration order.
 */
export class ServiceContainer {
  private instances = new Map<string, BaseService>();
  private bootOrder: string[] = [];

  /** Register a service by name. Must be called before boot(). */
  register(name: string, service: BaseService): void {
    if (this.instances.has(name)) {
      throw new Error(`Service "${name}" is already registered`);
    }
    this.instances.set(name, service);
    this.bootOrder.push(name);
  }

  /** Get a registered service by name. Throws if not found. */
  get<T extends BaseService>(name: string): T {
    const service = this.instances.get(name);
    if (!service) {
      throw new Error(
        `Service "${name}" not found. Registered services: ${[...this.instances.keys()].join(', ')}`
      );
    }
    return service as T;
  }

  /** Two-phase boot: construct all services, then init all services. */
  async boot(): Promise<void> {
    // Phase 1: construct (internal setup, no cross-service deps)
    for (const name of this.bootOrder) {
      const service = this.instances.get(name)!;
      await service.construct(this);
    }

    // Phase 2: init (cross-service wiring)
    for (const name of this.bootOrder) {
      const service = this.instances.get(name)!;
      await service.init();
    }
  }

  /** Reverse-order shutdown — last registered service destroyed first. */
  async shutdown(): Promise<void> {
    const reversed = [...this.bootOrder].reverse();
    for (const name of reversed) {
      const service = this.instances.get(name)!;
      await service.destroy();
    }
  }
}
