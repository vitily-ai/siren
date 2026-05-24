import type { Node, Tree } from 'web-tree-sitter';

interface FormatElement {
  type: 'comment' | 'attribute';
  node: Node;
  startIndex: number;
  row: number;
}

interface TopLevelElement {
  type: 'comment' | 'resource';
  node: Node;
  startIndex: number;
}

function getNamedChildren(node: Node): Node[] {
  const children: Node[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) children.push(child);
  }
  return children;
}

function formatCommentText(text: string): string {
  const match = text.match(/^(\/\/|#)\s?(.*)$/);
  const clean = match ? (match[2] ?? '') : text;
  return `# ${clean.trimEnd()}`;
}

function formatAttribute(keyNode: Node, valueNode: Node): string {
  const key = keyNode.text;
  let tupleNode = valueNode;
  if (valueNode.type === 'expression') {
    const firstChild = valueNode.namedChild(0);
    if (firstChild && firstChild.type === 'tuple') {
      tupleNode = firstChild;
    }
  }
  const isExplicit = tupleNode.children.some((c) => c.type === '[');
  const memberTexts = getNamedChildren(tupleNode).map((child) => child.text.trim());
  const membersStr = memberTexts.join(', ');
  const valueStr = isExplicit ? `[${membersStr}]` : membersStr;
  return `${key} = ${valueStr}`;
}

function hasAttributesOrComments(node: Node): boolean {
  if (node.type === 'attribute' || node.type === 'comment') {
    return true;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasAttributesOrComments(child)) {
      return true;
    }
  }
  return false;
}

function collectResourceElements(node: Node, elements: FormatElement[]) {
  if (node.type === 'comment') {
    elements.push({
      type: 'comment',
      node,
      startIndex: node.startIndex,
      row: node.startPosition.row,
    });
    return;
  }
  if (node.type === 'attribute') {
    elements.push({
      type: 'attribute',
      node,
      startIndex: node.startIndex,
      row: node.startPosition.row,
    });
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      collectResourceElements(child, elements);
    }
  }
}

function compareElements(a: FormatElement, b: FormatElement): number {
  if (a.row !== b.row) {
    return a.row - b.row;
  }
  if (a.type === 'comment' && b.type !== 'comment') {
    return -1;
  }
  if (b.type === 'comment' && a.type !== 'comment') {
    return 1;
  }
  return a.startIndex - b.startIndex;
}

function formatResource(resourceNode: Node): string[] {
  const headerNode = resourceNode.children.find((c) => c.type === 'resource_header');
  if (!headerNode) {
    return [];
  }
  const typeNode = headerNode.childForFieldName('type');
  const type = typeNode ? typeNode.text : '';
  const idNode = headerNode.childForFieldName('id');
  const idText = idNode ? idNode.text : '';
  const modifierNodes = headerNode.children.filter((c) => c.type === 'resource_modifier');
  const modifierTexts = modifierNodes.map((m) => m.text);
  const modifierStr = modifierTexts.length > 0 ? ' ' + modifierTexts.join(' ') : '';

  const bodyNode = resourceNode.childForFieldName('body');
  const isEmpty = !bodyNode || !hasAttributesOrComments(bodyNode);

  if (isEmpty) {
    return [`${type} ${idText}${modifierStr} {}`];
  }

  const lines: string[] = [];
  lines.push(`${type} ${idText}${modifierStr} {`);

  const innerElements: FormatElement[] = [];
  collectResourceElements(bodyNode, innerElements);
  innerElements.sort(compareElements);

  for (const element of innerElements) {
    if (element.type === 'attribute') {
      const keyNode = element.node.childForFieldName('key');
      const valueNode = element.node.childForFieldName('value');
      if (keyNode && valueNode) {
        lines.push('  ' + formatAttribute(keyNode, valueNode));
      }
    } else if (element.type === 'comment') {
      lines.push('  ' + formatCommentText(element.node.text));
    }
  }

  lines.push('}');
  return lines;
}

/**
 * CST-backed formatter for Siren AST / CST.
 *
 * Walks the private tree-sitter CST to emit canonical, deterministic Siren text.
 * Throws or handles errors if the document has parse errors.
 */
export function formatCst(tree: Tree, _content: string, hasErrors: boolean): string {
  if (hasErrors || tree.rootNode.hasError) {
    throw new Error('Cannot format a document with parse errors');
  }

  const root = tree.rootNode;
  const topElements: TopLevelElement[] = [];

  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (!child) continue;

    if (child.type === 'comment') {
      topElements.push({ type: 'comment', node: child, startIndex: child.startIndex });
    } else if (child.type === 'resource') {
      topElements.push({ type: 'resource', node: child, startIndex: child.startIndex });
    }
  }

  // topElements are already sorted by child index (lexical order)
  const lines: string[] = [];
  let lastWasResource = false;

  for (const element of topElements) {
    if (element.type === 'comment') {
      lines.push(formatCommentText(element.node.text));
      lastWasResource = false;
    } else if (element.type === 'resource') {
      if (lastWasResource) {
        lines.push(''); // blank line separation
      }
      const resourceLines = formatResource(element.node);
      lines.push(...resourceLines);
      lastWasResource = true;
    }
  }

  // File ends with a trailing newline if it has any statements.
  if (lines.length > 0) {
    return lines.join('\n') + '\n';
  }
  return '';
}
