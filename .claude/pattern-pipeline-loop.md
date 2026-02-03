ultrathink:

# Pattern Detection Pipeline Improvement Loop

## Mission
Validate complete NHTSA data ingestion (2 million+ records), verify GPU embedding service integration with correct text formatting, and iteratively improve the pattern detection algorithm through exploratory data analysis until patterns are accurate and complaints genuinely belong to their assigned patterns.

## Files
- Implementation plan: `.claude/pattern-pipeline-implementation-plan.md`
- EDA notes (create during work): `.claude/pattern-eda-notes.md`

## Thinking Guidelines
- Think through each step carefully before acting
- Consider edge cases and what could go wrong
- Analyze existing code patterns before implementing
- Reason through tradeoffs before deciding
- Be careful not to break existing functionality
- Consider backwards compatibility
- What dependencies might this affect?
- Verify your assumptions before proceeding
- Don't skip steps - walk through the full logic

## Instructions

### First Iteration
1. Read the ENTIRE `.claude/pattern-pipeline-implementation-plan.md` to understand scope
2. Check Progress Summary for current phase
3. Go to step 4 below

### Later Iterations (after context reset)
1. Check Progress Summary: What phase? What iteration?
2. Read only the current section (use offset/limit if plan is large)
3. Check notes for previous attempts
4. Read `.claude/pattern-eda-notes.md` if it exists for context
5. Continue from step 4 below

### Every Task
4. For the next incomplete task:
   a. Think through and create a to-do list using TodoWrite
   b. Save the exact to-do items as children in the plan
   c. Work through completing each to-do item
   d. Mark items complete in BOTH TodoWrite AND the plan
5. Add notes under that task (include iteration number)
6. If writing tests: verify they FAIL before implementing
7. Run tests after implementation changes
8. After task to-do list is done, move to next task
9. Commit at checkpoints
10. When all tasks done: final commit and push
11. Verify Definition of Done checklist

## When Stuck
If you've tried multiple approaches without progress:
1. Document the blocker clearly in notes
2. List all approaches attempted with iteration numbers
3. Hypothesize why they failed - what could go wrong?
4. Consider at least 3 different ways to solve this
5. Suggest alternative approaches for next iteration
6. Consider if the task needs to be broken down further

## Completion Criteria
- All tasks in the implementation plan are done
- ALL tests have been run AND pass
- All changes are committed AND pushed to remote
- Definition of Done checklist is complete

## On Completion
When all criteria are met:
1. Output the completion promise
2. List all items from "Future Work (Out of Scope)" section
3. This gives the user visibility into what came up during development

## Important Rules
- Complete Section 1 (Research) before any implementation
- Research can also refine the implementation plan itself
- Tests must FAIL before you implement (TDD red phase)
- Playwright tests before browser tool
- Add notes under each task with iteration numbers
- Log errors with file, line, cause, fix
- Commit at checkpoints, not just at the end
- Do NOT add features not in the plan (scope creep)
- Do NOT mark complete until all tests PASS
- Do NOT mark complete until changes are PUSHED
- Verify Definition of Done before outputting promise

## Completion Promise
Output `<promise>PATTERN_PIPELINE_COMPLETE</promise>` when:
- All tasks complete
- All tests pass (unit + integration + Playwright if applicable)
- All changes committed and pushed
- Definition of Done verified

This promise MUST match the --completion-promise parameter exactly.

After the promise, output a "## Future Work Discovered" section listing all items from Future Work (or "None" if empty).
