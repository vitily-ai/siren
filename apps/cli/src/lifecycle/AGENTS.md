# CLI Lifecycle Design

## Execution Model

The CLI operates on a **single-pass, linear execution model**. The Node process evaluates the user's command, runs the project phases in sequence, outputs the results (or errors), and terminates. Context is fully discarded when the process exits.

## Core Rules

1. **Assumed Uniqueness**: Each segment of the lifecycle (e.g., initialization, discovery, decoding, building, finalization) should be assumed to run exactly ONE time during the lifecycle of the process.
2. **No Re-entrancy Defenses**: Avoid guarding against multiple executions of the same lifecycle function (such as caching results or throwing "already finalized" errors) unless specifically needed for testing constraints or a known programmatic edge case. 
3. **YAGNI (You Aren't Gonna Need It)**: Do not add state-management defenses intended for hypothetical persistent environments (like watch modes or daemons) unless explicitly requested and designed for. Keep the CLI's state flow strictly simple and short-lived.
