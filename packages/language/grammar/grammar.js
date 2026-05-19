/**
 * @file Siren grammar for tree-sitter
 * @license GPL-3.0
 *
 * Minimal grammar based on HCL syntax:
 * - Resources: task/milestone blocks with identifiers
 * - Attributes: key = value assignments
 * - Values: strings, numbers, booleans, identifiers (references), arrays
 */

/// <reference path="./types/tree-sitter-dsl.d.ts" />
// @ts-check

module.exports = grammar({
  name: 'siren',

  extras: ($) => [
    $.comment,
    /\s/, // whitespace
  ],

  rules: {
    // Top-level document: zero or more resources
    document: ($) => repeat($.resource),

    // Resource block: task/milestone + identifier + open status modifier slot + body
    //
    // The modifier slot accepts ZERO or more bare identifiers (e.g. `draft`,
    // `complete`, or any future status token). The grammar is intentionally
    // permissive — semantic validation of which tokens are meaningful lives in
    // the downstream lint pass, not in the grammar.
    //
    // `task` and `milestone` string literals take natural lexical priority over
    // the bare_identifier regex in tree-sitter, so they are never absorbed into
    // the repeat(status_modifier) slot when the next resource starts.
    resource: ($) =>
      seq(
        field('type', choice('task', 'milestone')),
        field('id', $.identifier),
        repeat(field('status_modifier', $.bare_identifier)),
        '{',
        field('body', repeat($.attribute)),
        '}',
      ),

    // Identifier: bare or quoted
    identifier: ($) => choice($.bare_identifier, $.quoted_identifier),

    // Bare identifier: alphanumeric, underscore, hyphen
    // Must start with letter or underscore
    bare_identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_-]*/,

    // Quoted identifier: anything within double quotes
    quoted_identifier: ($) => seq('"', /[^"]*/, '"'),

    // Attribute: key = value
    attribute: ($) => seq(field('key', $.bare_identifier), '=', field('value', $.expression)),

    // Expression: any value type
    expression: ($) => choice($.literal, $.reference, $.array),

    // Literal values
    literal: ($) => choice($.string_literal, $.number_literal, $.boolean_literal, $.null_literal),

    string_literal: ($) => seq('"', /[^"]*/, '"'),

    number_literal: ($) => /[0-9]+(\.[0-9]+)?/,

    boolean_literal: ($) => choice('true', 'false'),

    null_literal: ($) => 'null',

    // Reference to another resource (bare identifier only)
    reference: ($) => $.bare_identifier,

    // Array of expressions
    array: ($) =>
      seq(
        '[',
        optional(
          seq(
            $.expression,
            repeat(seq(',', $.expression)),
            optional(','), // trailing comma allowed
          ),
        ),
        ']',
      ),

    // Comments: # or // style
    comment: ($) => token(choice(seq('#', /.*/), seq('//', /.*/))),
  },
});
