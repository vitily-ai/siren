import type { CliContext, PresentationArtifact } from './context';

export function surfaceDiagnostics(ctx: CliContext): PresentationArtifact {
  for (const warning of ctx.warnings) {
    console.error(warning);
  }
  for (const error of ctx.errors) {
    console.error(error);
  }

  if (ctx.errors.length > 0) {
    process.exitCode = 1;
  }

  const artifact: PresentationArtifact = {
    diagnosticsSurfaced: true,
    warningCount: ctx.warnings.length,
    errorCount: ctx.errors.length,
    exitCode: process.exitCode,
  };
  ctx.presentation = artifact;
  ctx.phasesRun.add('presentation');
  return artifact;
}
