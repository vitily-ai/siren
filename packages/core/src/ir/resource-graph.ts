import type {
  DependencyTree,
  TraversalControl,
  TraversePredicate,
} from '../utilities/dependency-tree';
import { getDependsOn } from '../utilities/entry';
import { cloneAndFreezeResources } from './snapshot';
import type { Resource } from './types';

const MAX_DEPTH = 1000000;

function normalizeControl(result: boolean | TraversalControl): TraversalControl {
  if (typeof result === 'boolean') {
    return { include: result, expand: result };
  }
  return result;
}

function makeMissingResource(id: string): Resource {
  return {
    type: 'task',
    id,
    attributes: [],
  };
}

/**
 * Immutable resource graph snapshot.
 *
 * Owns the frozen resource array, id -> Resource index, and dependency
 * adjacency in one consistent structure.
 */
export class ResourceGraph {
  private constructor(
    private readonly resourceIndex: ReadonlyMap<string, Resource>,
    private readonly adjacency: Map<string, Set<string>>,
  ) {
    Object.freeze(this);
  }

  static fromResources(resources: readonly Resource[]): ResourceGraph {
    const frozenResources = cloneAndFreezeResources(resources, new Set());
    const resourcesById = new Map<string, Resource>(
      frozenResources.map((resource) => [resource.id, resource]),
    );
    const adjacency = new Map<string, Set<string>>();

    const addNode = (id: string): void => {
      if (!adjacency.has(id)) {
        adjacency.set(id, new Set());
      }
    };

    const addEdge = (source: string, target: string): void => {
      addNode(source);
      addNode(target);
      adjacency.get(source)!.add(target);
    };

    for (const resource of frozenResources) {
      addNode(resource.id);
      for (const dependencyId of getDependsOn(resource)) {
        addEdge(resource.id, dependencyId);
      }
    }

    return new ResourceGraph(resourcesById, adjacency);
  }

  get resources(): readonly Resource[] {
    return Array.from(this.resourceIndex.values());
  }

  getResource(id: string): Resource | undefined {
    return this.resourceIndex.get(id);
  }

  hasResource(id: string): boolean {
    return this.resourceIndex.has(id);
  }

  getSuccessors(id: string): string[] {
    return Array.from(this.adjacency.get(id) ?? []);
  }

  getNodes(): string[] {
    return Array.from(this.adjacency.keys());
  }

  dfs(
    start: string,
    onVisit: (node: string, path: string[], depth: number) => boolean | undefined,
    options?: {
      maxDepth?: number;
      onBackEdge?: (from: string, to: string, path: string[]) => void;
    },
  ): void {
    const maxDepth = options?.maxDepth ?? Number.POSITIVE_INFINITY;
    const path: string[] = [];
    const pathSet = new Set<string>();

    type Frame = {
      node: string;
      depth: number;
      successors: string[];
      successorIndex: number;
      entered: boolean;
      expand: boolean;
    };

    const stack: Frame[] = [
      {
        node: start,
        depth: 0,
        successors: [],
        successorIndex: 0,
        entered: false,
        expand: false,
      },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;

      if (!frame.entered) {
        frame.entered = true;
        path.push(frame.node);
        pathSet.add(frame.node);

        const cont = onVisit(frame.node, [...path], frame.depth);
        frame.expand = cont !== false && frame.depth < maxDepth;
        frame.successors = frame.expand ? this.getSuccessors(frame.node) : [];
      }

      if (frame.expand && frame.successorIndex < frame.successors.length) {
        const successor = frame.successors[frame.successorIndex];
        if (successor === undefined) {
          // this can only happen if the successors array was malformed (e.g. had holes or non-string values)
          // skip it for error tolerance
          // TODO figure out how to report this as a non-fatal error
          frame.successorIndex += 1;
          continue;
        }
        frame.successorIndex += 1;

        if (pathSet.has(successor)) {
          options?.onBackEdge?.(frame.node, successor, [...path]);
          continue;
        }

        stack.push({
          node: successor,
          depth: frame.depth + 1,
          successors: [],
          successorIndex: 0,
          entered: false,
          expand: false,
        });
        continue;
      }

      path.pop();
      pathSet.delete(frame.node);
      stack.pop();
    }
  }

  hasCycle(): boolean {
    return this.getCycles().length > 0;
  }

  getCycles(): string[][] {
    const cycles: string[][] = [];

    for (const start of this.getNodes()) {
      this.dfs(start, () => true, {
        onBackEdge: (_from, to, path) => {
          const cycleStart = path.indexOf(to);
          if (cycleStart < 0) return;

          const cycle = path.slice(cycleStart).concat(to);
          const cycleNodes = cycle.slice(0, -1);
          const minNode = cycleNodes.reduce((min, current) => (current < min ? current : min));
          const minIndex = cycleNodes.indexOf(minNode);
          const normalized = cycleNodes
            .slice(minIndex)
            .concat(cycleNodes.slice(0, minIndex), minNode);

          cycles.push(normalized);
        },
      });
    }

    return Array.from(new Set(cycles.map((cycle) => cycle.join(',')))).map((cycle) =>
      cycle.split(','),
    );
  }

  getDependencyTree(
    rootId: string,
    traversePredicate: TraversePredicate = () => true,
  ): DependencyTree {
    const rootResource = this.resourceIndex.get(rootId);
    if (!rootResource) {
      throw new Error(`Resource with id ${rootId} not found`);
    }

    const tree: DependencyTree = { resource: rootResource, dependencies: [] };
    const rootControl = normalizeControl(traversePredicate(rootResource));
    if (!rootControl.expand) {
      return tree;
    }

    const pathKey = (path: readonly string[]): string => path.join('\u0000');
    const nodesByPath = new Map<string, DependencyTree>();
    nodesByPath.set(pathKey([rootId]), tree);

    this.dfs(
      rootId,
      (nodeId, path, depth) => {
        if (depth > MAX_DEPTH) {
          throw new Error('maximum dependency depth exceeded');
        }

        if (depth === 0) {
          return rootControl.expand;
        }

        const parentKey = pathKey(path.slice(0, -1));
        const parent = nodesByPath.get(parentKey);
        if (!parent) return false;

        const resource = this.resourceIndex.get(nodeId) ?? makeMissingResource(nodeId);
        const control = normalizeControl(traversePredicate(resource, parent.resource));
        if (!control.include) {
          return false;
        }

        const child: DependencyTree = { resource, dependencies: [] };
        if (!this.resourceIndex.has(nodeId)) {
          child.missing = true;
        }

        parent.dependencies.push(child);
        nodesByPath.set(pathKey(path), child);
        return control.expand;
      },
      {
        onBackEdge: (_from, to, path) => {
          const parent = nodesByPath.get(pathKey(path));
          if (!parent) return;

          const cycResource = this.resourceIndex.get(to) ?? makeMissingResource(to);
          parent.dependencies.push({ resource: cycResource, dependencies: [], cycle: true });
        },
      },
    );

    return tree;
  }
}
