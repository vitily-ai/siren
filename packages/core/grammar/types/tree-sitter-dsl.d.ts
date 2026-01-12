// Minimal tree-sitter DSL shims for editor type-checking.
// Runtime DSL helpers are injected by tree-sitter-cli.

type DSLRule =
  | string
  | RegExp
  | number
  | boolean
  | null
  | undefined
  | { __rule: true };

interface DSLGrammarSymbols {
  [name: string]: DSLRule;
}

type DSLRuleBuilder<T = DSLRule> = (grammar: DSLGrammarSymbols) => T;

interface DSLGrammarSpec {
  name: string;
  extras?: DSLRule[] | DSLRuleBuilder<DSLRule[]>;
  rules: Record<string, DSLRule | DSLRuleBuilder>;
  conflicts?: Array<DSLRule[] | DSLRuleBuilder<DSLRule[]>>;
}

declare function grammar<T = unknown>(spec: DSLGrammarSpec): T;
declare function seq(...rules: Array<DSLRule | string | RegExp>): DSLRule;
declare function choice(...rules: Array<DSLRule | string | RegExp>): DSLRule;
declare function repeat(rule: DSLRule): DSLRule;
declare function optional(rule: DSLRule): DSLRule;
declare function token(rule: DSLRule): DSLRule;
declare function field(name: string, rule: DSLRule): DSLRule;
