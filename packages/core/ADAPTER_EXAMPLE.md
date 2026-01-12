/**
 * Example: Using the parser in an application
 * 
 * This demonstrates how apps/web or apps/cli would implement
 * a ParserAdapter using web-tree-sitter.
 */

import type { ParserAdapter, ParseResult } from '@siren/core';

/**
 * Browser/Node ParserAdapter using web-tree-sitter
 * 
 * NOTE: This is pseudo-code showing the pattern.
 * Real implementation requires web-tree-sitter package.
 */
class TreeSitterAdapter implements ParserAdapter {
  private constructor(
    private readonly parser: any,
    private readonly language: any
  ) {}

  /**
   * Create a fully-initialized TreeSitterAdapter
   * 
   * Use this async factory instead of a constructor.
   * The adapter is guaranteed ready to parse when returned.
   */
  static async create(): Promise<TreeSitterAdapter> {
    // Dynamic import to avoid bundling in core
    const TreeSitter = await import('web-tree-sitter');
    
    // Initialize WASM runtime
    await TreeSitter.init();
    
    // Create parser instance
    const parser = new TreeSitter();
    
    // Load Siren language from WASM binary
    // Path depends on bundler configuration
    const language = await TreeSitter.Language.load(
      '/path/to/tree-sitter-siren.wasm'
    );
    
    parser.setLanguage(language);
    
    // Return fully-initialized adapter
    return new TreeSitterAdapter(parser, language);
  }

  async parse(source: string): Promise<ParseResult> {
    const tree = this.parser.parse(source);
    const rootNode = tree.rootNode;

    // Convert tree-sitter CST to our CST types
    // This would be a full transformer function
    const documentNode = this.convertNode(rootNode);

    // Collect parse errors (tree-sitter tracks these)
    const errors = rootNode.hasError
      ? this.extractErrors(rootNode)
      : [];

    return {
      tree: documentNode,
      errors,
      success: !rootNode.hasError,
    };
  }

  private convertNode(node: any): any {
    // Transform tree-sitter node to our CSTNode types
    // This is where you map node.type to DocumentNode, ResourceNode, etc.
    // Implementation left as exercise for the app
    throw new Error('Not implemented - see decoder implementation');
  }

  private extractErrors(node: any): any[] {
    // Walk tree and collect ERROR nodes
    // Implementation left as exercise for the app
    return [];
  }
}

/**
 * Usage in an application
 */
async function example() {
  // Use factory to get fully-initialized adapter
  const adapter = await TreeSitterAdapter.create();

  const source = `
    task example {
      description = "Hello, Siren!"
    }
  `;

  // Adapter is guaranteed ready - no isReady() check needed
  const result = await adapter.parse(source);
  
  if (result.success) {
    console.log('Parsed successfully:', result.tree);
  } else {
    console.error('Parse errors:', result.errors);
  }
}
