import { IRContext } from './context';
import { IR_CONTEXT_FACTORY } from './context-internal';
import { cloneAndFreezeResources } from './snapshot';
import type { Resource } from './types';

export class IRAssembly {
  private constructor(private readonly resourcesSnapshot: readonly Resource[]) {
    Object.freeze(this);
  }

  static fromResources(resources: readonly Resource[]): IRAssembly {
    return new IRAssembly(cloneAndFreezeResources(resources));
  }

  get resources(): readonly Resource[] {
    return this.resourcesSnapshot;
  }

  build(): IRContext {
    return IRContext[IR_CONTEXT_FACTORY](this.resourcesSnapshot);
  }
}
