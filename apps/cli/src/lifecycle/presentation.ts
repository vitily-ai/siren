import type { CliContext } from './context';

/**
 * Flush accumulated diagnostics to stderr. If any errors were accumulated, set
 * `process.exitCode = 1` and mark the lifecycle as aborted so downstream phases
 * (query, write) skip themselves.
 *
 * Called once, immediately after the diagnostics-accumulation phase and before
 * the query/write phases.
 */
export function presentDiagnostics(ctx: CliContext): void {
  for (const warning of ctx.warnings) {
    console.error(warning);
  }
  for (const error of ctx.errors) {
    console.error(error);
  }

  ctx.warningsFlushed = ctx.warnings.length;
  ctx.errorsFlushed = ctx.errors.length;

  if (ctx.errors.length > 0) {
    process.exitCode = 1;
  }

  ctx.phasesRun.add('diagnostics-presented');
}

/**
 * Flush the captured `QueryArtifact` (if any) to stdout / stderr and apply its
 * exit code. Also flushes any diagnostics that were accumulated after
 * `presentDiagnostics` ran (e.g. errors thrown from a query callback). Called
 * once at the end of the lifecycle. Stderr text from the artifact and a
 * non-zero artifact `exitCode` add to the existing process exit code — they
 * never lower it.
 */
export function presentQuery(ctx: CliContext): void {
  // Drain any diagnostics that arrived after diagnostics-presented ran.
  for (let i = ctx.warningsFlushed; i < ctx.warnings.length; i++) {
    console.error(ctx.warnings[i]);
  }
  for (let i = ctx.errorsFlushed; i < ctx.errors.length; i++) {
    console.error(ctx.errors[i]);
  }
  if (ctx.errors.length > ctx.errorsFlushed) {
    process.exitCode = 1;
  }
  ctx.warningsFlushed = ctx.warnings.length;
  ctx.errorsFlushed = ctx.errors.length;

  const artifact = ctx.query;
  if (artifact) {
    if (artifact.stdout !== undefined) {
      const lines = Array.isArray(artifact.stdout) ? artifact.stdout : [artifact.stdout];
      for (const line of lines) {
        console.log(line);
      }
    }
    if (artifact.stderr !== undefined) {
      const lines = Array.isArray(artifact.stderr) ? artifact.stderr : [artifact.stderr];
      for (const line of lines) {
        console.error(line);
      }
    }
    if (artifact.exitCode !== undefined && artifact.exitCode !== 0) {
      process.exitCode = artifact.exitCode;
    }
  }

  ctx.phasesRun.add('query-presented');
}
