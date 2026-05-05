# Agent rules for IR pipeline modules

## Operation ownership

A primary goal of the IR pipeline is to centralize where certain calculations and derivations
of the context occur, to prevent inefficient duplication of operations.
Pursuant to this, avoid defining modules as simple wrappers of extraneous utility methods.
Dangling utility methods may suggest to contributors that it is fair game to use, incurring
unnecessary recalculations.
If a new module essentially captures the full scope of an existing utility method, that
utility method should be folded into the same file, and not be exported.
If it is absolutely necessary for a module to wrap a utility this way, the module MUST
document why the utility must remain visible in the package.