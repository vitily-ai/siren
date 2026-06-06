import type { SirenDocument } from '@sirenpm/core';
import { formatAttributeValue, formatResourceIdentifier } from './formatters';

export function renderSirenDocument(document: SirenDocument): string {
  if (document.resources.length === 0) return '';

  const blocks = document.resources.map((resource) => {
    const id = formatResourceIdentifier(resource.id);
    const statusToken = resource.status ? ` ${resource.status}` : '';
    const bodyLines = resource.attributes.map(
      (attr) => `  ${attr.key} = ${formatAttributeValue(attr.value)}`,
    );

    const header = `${resource.type} ${id}${statusToken}`;
    const block =
      bodyLines.length === 0 ? `${header} {}` : `${header} {\n${bodyLines.join('\n')}\n}`;

    return `${block}\n`;
  });

  return blocks.join('\n');
}
