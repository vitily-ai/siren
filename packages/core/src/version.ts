/**
 * Package version, injected at build time via a `define` macro
 * (`import.meta.env.PACKAGE_VERSION`) sourced from `package.json`.
 * Falls back to an empty string when the macro is not defined.
 */
export const version: string = import.meta.env.PACKAGE_VERSION ?? '';
