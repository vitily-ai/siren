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

  word: ($) => $.bare_identifier,

  rules: {
    // Top-level document: zero or more resources
    document: ($) => repeat($.resource),

    resource_type: ($) => choice('task', 'milestone'),
    resource_modifier: ($) => 'complete',

    resource_header: ($) =>
      seq(
        field('type', $.resource_type),
        field('id', $.identifier),
        optional(field('complete_modifier', $.resource_modifier)),
      ),

    block_open: ($) => '{',
    block_close: ($) => '}',

    block: ($) => seq($.block_open, repeat($.attribute), $.block_close),

    // Resource block: task/milestone + identifier + optional 'complete' + body
    resource: ($) => seq($.resource_header, field('body', $.block)),

    // Identifier: bare or quoted
    identifier: ($) => choice($.bare_identifier, $.string_literal),

    // Bare identifier: alphanumeric, underscore, hyphen
    // Must start with letter or underscore
    bare_identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_-]*/,

    // Attribute: key = value
    attribute: ($) => seq(field('key', $.bare_identifier), '=', field('value', $.expression)),

    // Expression: any value type
    expression: ($) => choice($.literal, $.reference, $.array),

    // Literal values
    literal: ($) => choice($.string_literal, $.number_literal, $.boolean_literal, $.null_literal),

    str_open: (_) => '"',
    str_body: (_) => /[^"\n]*/,
    str_close: (_) => '"',

    // TODO - support multi-line strings
    string_literal: ($) => seq($.str_open, field('body', $.str_body), $.str_close),

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
