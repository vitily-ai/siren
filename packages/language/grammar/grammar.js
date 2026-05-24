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
    resource_modifier: ($) => $.identifier,

    resource_header: ($) =>
      seq(
        field('type', $.resource_type),
        field('id', $.identifier),
        optional(field('status_modifier', repeat($.resource_modifier))),
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

    // Comments: # or // style
    comment: ($) => token(choice(seq('#', /.*/), seq('//', /.*/))),

    // EXPRESSIONS and VALUES

    // Every value is a tuple
    tuple: ($) => seq(choice($._explicit_tuple, $._implicit_tuple)),

    // Recursion currently not supported, so tuples are flat currently
    _tuple_member: ($) => choice($.literal, $.bare_identifier),
    _implicit_tuple: ($) => seq($._tuple_member, repeat(seq(',', $._tuple_member))),
    _explicit_tuple: ($) => seq('[', optional($._implicit_tuple), ']'),

    // Currently, expressions are static, so they just wrap tuples.
    // Expression: any value type
    expression: ($) => choice($.tuple),

    // Literal values
    literal: ($) => choice($.string_literal, $.number_literal, $.boolean_literal),

    str_open: (_) => '"',
    // note: excluding braces is a compromise to make unclosed identifier strings easier to diagnose
    // however, this is not ideal long-term. the industry solution is a custom scanner.
    str_body: (_) => /[^"\n{}]*/,
    str_close: (_) => '"',

    // TODO - support multi-line strings
    string_literal: ($) => seq($.str_open, $.str_body, $.str_close),

    number_literal: ($) => /[0-9]+(\.[0-9]+)?/,

    boolean_literal: ($) => choice('true', 'false'),
  },
});
