import { SirenProject } from './context';
import { IR_CONTEXT_FACTORY } from './context-internal';
import { cloneAndFreezeResources } from './snapshot';
import type { Resource } from './types';

export class SirenBuilder {
  private constructor(private readonly resourcesSnapshot: readonly Resource[]) {
    Object.freeze(this);
  }

  static fromResources(resources: readonly Resource[]): SirenBuilder {
    return new SirenBuilder(cloneAndFreezeResources(resources));
  }

  get resources(): readonly Resource[] {
    return this.resourcesSnapshot;
  }

  build(): SirenProject {
    return SirenProject[IR_CONTEXT_FACTORY](this.resourcesSnapshot);
  }
}
