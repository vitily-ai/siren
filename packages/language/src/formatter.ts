import type { Node, Tree } from 'web-tree-sitter';

interface FormatElement {
  type: 'comment' | 'attribute';
  node: Node;
  startIndex: number;
  row: number;
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

/** Build a sorted list of block-content elements (attributes + comments) from a node. */
function collectAndSortBlockElements(node: Node): FormatElement[] {
  const elements: FormatElement[] = [];
  collectResourceElements(node, elements);
  elements.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.type === 'comment' && b.type !== 'comment') return -1;
    if (b.type === 'comment' && a.type !== 'comment') return 1;
    return a.startIndex - b.startIndex;
  });
  return elements;
}

function findChildByType(node: Node, type: string): Node | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return undefined;
}

/**
 * Recursive CST formatter. Dispatches on node type to the appropriate
 * formatting logic. Unknown node types throw loudly so the compiler or
 * grammar author is immediately aware of missing coverage.
 */
function formatNode(node: Node, indent = 0): string[] {
  const pad = '  '.repeat(indent);

  switch (node.type) {
    case 'document': {
      // Root node: format children, insert blank lines between sibling resources.
      const lines: string[] = [];
      let lastChildType: string | undefined;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        const childLines = formatNode(child, indent);
        if (childLines.length === 0) continue;
        if (child.type === 'resource' && lastChildType === 'resource') {
          lines.push(''); // blank line between resources
        }
        lines.push(...childLines);
        lastChildType = child.type;
      }
      return lines;
    }

    case 'doc_header': {
      // "document" keyword followed by a block node.
      const block = findChildByType(node, 'block');
      if (!block) return [`${pad}document {}`];
      const blockLines = formatNode(block, indent);
      return [`${pad}document${blockLines[0]}`, ...blockLines.slice(1)];
    }

    case 'resource': {
      // resource_header child + body (block) child.
      const header = findChildByType(node, 'resource_header');
      if (!header) return [];
      const headerLines = formatNode(header, indent);
      const body = node.childForFieldName('body');
      if (!body) return headerLines;
      const blockLines = formatNode(body, indent);
      return [`${headerLines[0]}${blockLines[0]}`, ...blockLines.slice(1)];
    }

    case 'resource_header': {
      const typeName = node.childForFieldName('type')?.text ?? '';
      const id = node.childForFieldName('id')?.text ?? '';
      const modifiers: string[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c?.type === 'resource_modifier') modifiers.push(c.text);
      }
      const modStr = modifiers.length > 0 ? ` ${modifiers.join(' ')}` : '';
      return [`${pad}${typeName} ${id}${modStr}`];
    }

    case 'block': {
      // Collect and sort content children (comments before attributes on same row).
      const elements = collectAndSortBlockElements(node);
      if (elements.length === 0) return [' {}'];
      const lines: string[] = [' {'];
      for (const el of elements) {
        const elLines = formatNode(el.node, indent + 1);
        lines.push(...elLines);
      }
      lines.push(`${pad}}`);
      return lines;
    }

    case 'attribute': {
      const key = node.childForFieldName('key');
      const value = node.childForFieldName('value');
      if (!key || !value) return [];
      return [`${pad}${formatAttribute(key, value)}`];
    }

    case 'comment': {
      return [`${pad}${formatCommentText(node.text)}`];
    }

    default:
      throw new Error(`Formatter: unhandled CST node type "${node.type}"`);
  }
}

/**
 * CST-backed formatter for Siren AST / CST.
 *
 * Walks the private tree-sitter CST to emit canonical, deterministic Siren text.
 * Throws or handles errors if the document has parse errors.
 */
export function formatCst(tree: Tree, _content: string): string {
  if (tree.rootNode.hasError) {
    throw new Error('Cannot format a document with parse errors');
  }

  const lines = formatNode(tree.rootNode);

  if (lines.length > 0) {
    return `${lines.join('\n')}\n`;
  }
  return '';
}
