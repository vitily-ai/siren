import { type DependencyTree, isComplete } from '@sirenpm/core';

function hasCycleInTree(tree: DependencyTree): boolean {
  if (tree.cycle) return true;
  for (const dependency of tree.dependencies) {
    if (hasCycleInTree(dependency)) return true;
  }
  return false;
}

export function renderDependencyTree(
  tree: DependencyTree,
  prefix = '',
  _isLast = true,
  depth = 0,
  maxDepth = 2,
): string[] {
  const lines: string[] = [];
  const dependencies = tree.dependencies.filter((dependency) => !isComplete(dependency.resource));

  if (dependencies.length === 0) {
    return lines;
  }

  if (depth >= maxDepth - 1 && dependencies.length > 0) {
    const hasGrandchildren = dependencies.some(
      (dependency) =>
        dependency.dependencies.filter((child) => !isComplete(child.resource)).length > 0,
    );
    if (hasGrandchildren) {
      const countAllDependencies = (node: DependencyTree): number => {
        const childDependencies = node.dependencies.filter((child) => !isComplete(child.resource));
        if (childDependencies.length === 0) {
          return 0;
        }
        let count = childDependencies.length;
        for (const child of childDependencies) {
          count += countAllDependencies(child);
        }
        return count;
      };

      if (dependencies.length > 1) {
        const hasDescendants = dependencies.some(
          (dependency) => countAllDependencies(dependency) > 0,
        );

        if (hasDescendants) {
          lines.push(`${prefix}└─ … (multiple dependency branches)`);
          return lines;
        }

        for (let index = 0; index < dependencies.length; index++) {
          const dependency = dependencies[index];
          if (!dependency) continue;
          const isLastDependency = index === dependencies.length - 1;
          const connector = isLastDependency ? '└─' : '├─';
          lines.push(`${prefix}${connector} ${dependency.resource.id}`);
        }
        return lines;
      }

      const firstDependency = dependencies[0];
      if (!firstDependency) return lines;

      const totalDependencies = 1 + countAllDependencies(firstDependency);
      const intermediateCount = totalDependencies - 1;
      const childPrefix = `${prefix}   `;

      if (intermediateCount > 0) {
        lines.push(
          `${prefix}└─ … (${intermediateCount} intermediate ${intermediateCount === 1 ? 'dependency' : 'dependencies'})`,
        );

        let current: DependencyTree | undefined = firstDependency;
        while (current?.dependencies.some((dependency) => !isComplete(dependency.resource))) {
          current = current.dependencies.find((dependency) => !isComplete(dependency.resource));
        }
        if (current && current !== firstDependency) {
          lines.push(`${childPrefix}└─ ${current.resource.id}`);
        }
      } else {
        lines.push(`${prefix}└─ ${firstDependency.resource.id}`);
      }
      return lines;
    }
  }

  for (let index = 0; index < dependencies.length; index++) {
    const dependency = dependencies[index];
    if (!dependency) continue;
    const isLastDependency = index === dependencies.length - 1;
    const connector = isLastDependency ? '└─' : '├─';

    lines.push(`${prefix}${connector} ${dependency.resource.id}`);

    if (hasCycleInTree(dependency)) {
      const childPrefix = prefix + (isLastDependency ? '   ' : '│  ');
      lines.push(`${childPrefix}└─ … (dependency loop - check warnings)`);
      continue;
    }

    const childPrefix = prefix + (isLastDependency ? '   ' : '│  ');
    lines.push(
      ...renderDependencyTree(dependency, childPrefix, isLastDependency, depth + 1, maxDepth),
    );
  }

  return lines;
}
