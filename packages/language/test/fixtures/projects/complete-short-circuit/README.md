# Purpose
Minimally replicates a (fixed) defect where having a dependency structure like this:

          incomplete-task
         /               \
milestone --------------- complete-task

would result in `incomplete-task` incorrectly not being collected and reported in dependency trees for `milestone`