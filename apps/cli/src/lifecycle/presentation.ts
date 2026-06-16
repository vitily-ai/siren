import type { CliContext, DeepReadonly } from './context';

export interface PresentationArtifact {
  warningsFlushed?: number;
  errorsFlushed?: number;
}

export function presentDiagnostics(ctx: DeepReadonly<CliContext>): PresentationArtifact {
  for (const warning of ctx.warnings) {
    console.error(warning);
  }
  for (const error of ctx.errors) {
    console.error(error);
  }

  if (ctx.errors.length > 0) {
    process.exitCode = 1;
  }

  return {
    warningsFlushed: ctx.warnings.length,
    errorsFlushed: ctx.errors.length,
  };
}

export function presentQuery(ctx: DeepReadonly<CliContext>): PresentationArtifact {
  for (let i = ctx.warningsFlushed; i < ctx.warnings.length; i++) {
    console.error(ctx.warnings[i]);
  }
  for (let i = ctx.errorsFlushed; i < ctx.errors.length; i++) {
    console.error(ctx.errors[i]);
  }
  if (ctx.errors.length > ctx.errorsFlushed) {
    process.exitCode = 1;
  }

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

  return {
    warningsFlushed: ctx.warnings.length,
    errorsFlushed: ctx.errors.length,
  };
}
