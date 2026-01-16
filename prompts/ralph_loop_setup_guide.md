# Ralph Loop Setup Guide

Quick reference for setting up Ralph loops correctly. Copy this file to any project.

## Required Components

Every Ralph loop needs **two files**:

1. **Prompt file** (e.g., `.claude/my-task-loop.md`)
2. **Implementation plan file** (e.g., `.claude/my-task-plan.md`)

## Command Format

```bash
/ralph-loop:ralph-loop "$(cat .claude/my-task-loop.md)" --max-iterations 10 --completion-promise "TASK_COMPLETE"
```

**Never embed the prompt directly in quotes.** Always use `cat` to read from a file.

## Required Parameters

| Parameter | Required | Default | Notes |
|-----------|----------|---------|-------|
| `--max-iterations` | YES | None | Must be set. If unsure, use `10` |
| `--completion-promise` | YES | None | Exact string that signals completion |

## Prompt File Structure

The prompt file **must** start with `ultrathink:` as the very first characters:

```markdown
ultrathink:

# Task Name Loop

## Mission
Brief description of what needs to be accomplished.

## Files
- Implementation plan: `.claude/my-task-plan.md`

## Instructions
1. Read the implementation plan file FIRST
2. Check progress and notes from previous iterations
3. Complete the next incomplete task
4. Update progress and add notes to the plan file
5. Run tests and verify they pass
6. Continue until all tasks done and tests passing

## Completion Promise
Output `<promise>TASK_COMPLETE</promise>` when:
- All tasks in the implementation plan are done
- ALL tests have been run AND pass
- Changes are committed and pushed

This promise MUST match the --completion-promise parameter exactly.
```

## Implementation Plan File Structure (TDD Style)

The implementation plan **must** follow Test-Driven Development:

```markdown
# Task Implementation Plan

## Overview
What we're building and why.

---

## NOTES (Updated Each Iteration)

### What Has Been Tried
- (Record everything attempted, even failures)

### What Didn't Work & Why
- (Critical: prevents repeating failed approaches)

### Things To Research
- [ ] (Topics needing investigation)

### Research Completed
- (Findings from research - APIs, libraries, etc.)

### Current Blockers
- (What's preventing progress)

### Next Steps
- (What to try next iteration)

---

## Phase 0: Research (MUST COMPLETE BEFORE IMPLEMENTATION)

### Codebase Understanding
- [ ] Review existing code for similar/related functionality
- [ ] Identify what already exists (avoid duplicate work!)
- [ ] Understand current patterns and conventions
- [ ] Map integration points

### External Research
- [ ] Research required APIs/SDKs
- [ ] Review library documentation
- [ ] Check for existing solutions/examples

---

## Phase 1: Write Tests First (TDD)
- [ ] Write failing test for feature A
- [ ] Write failing test for feature B
- [ ] Verify all tests fail (red phase)

## Phase 2: Implementation
- [ ] Implement feature A (make test pass)
- [ ] Implement feature B (make test pass)
- [ ] Refactor if needed (tests still pass)

## Phase 3: Integration & Browser Testing
- [ ] Integration tests pass
- [ ] Browser tests pass (use browser tool if needed)
- [ ] All edge cases covered

## Phase 4: Documentation & Cleanup
- [ ] Update documentation
- [ ] Clean up temporary files
- [ ] Commit and push

---

## Completion Criteria
ALL of the following must be true:
1. All checkboxes marked [x]
2. ALL tests have been RUN
3. ALL tests PASS (not just run - they must be green)
4. Changes committed and pushed
```

## Critical Rules

### 1. Research Before Implementation

**ALWAYS complete Phase 0 before writing any code.**

Why this matters:
- Avoids duplicate work (something might already exist)
- Prevents bugs from conflicting implementations
- Saves time by understanding the landscape first
- Identifies the right approach before committing to it

Research includes:
- **Codebase**: What already exists? What patterns are used?
- **External**: APIs, SDKs, libraries, documentation

### 2. Test-Driven Development (TDD)

Follow the red-green-refactor cycle:
1. **Red**: Write a failing test first
2. **Green**: Write minimal code to make it pass
3. **Refactor**: Clean up while keeping tests green

### 3. Notes in the Implementation Plan

**This is critical for long-running loops.**

Ralph loops can run for many iterations, exceeding your context window. The implementation plan file is read every iteration, so it's your persistent memory.

**Always record in the NOTES section:**
- Things you've already tried
- Things that didn't work and WHY
- Things you want to try next
- Research findings
- Current blockers
- Hypotheses and observations

This prevents:
- Trying the same failed approach repeatedly
- Forgetting what you learned
- Losing context between iterations

### 4. Tests Must Pass (Not Just Run)

The loop is **NOT complete** until:
- All tests have been executed
- All tests are GREEN (passing)
- No skipped or ignored tests

Running tests that fail does not count as completion.

### 5. Browser Testing

For UI or web-related tasks, remember:
- The **browser tool** is available for actual browser tests
- Use it to verify UI functionality
- Include browser tests in Phase 3

## Complete Example

### Step 1: Create the implementation plan

File: `.claude/feature-x-plan.md`

```markdown
# Feature X Implementation Plan

## Overview
Add user authentication with JWT tokens.

---

## NOTES (Updated Each Iteration)

### What Has Been Tried
- (nothing yet)

### What Didn't Work & Why
- (nothing yet)

### Research Completed
- (nothing yet)

### Next Steps
- Start with Phase 0 research

---

## Phase 0: Research
- [ ] Check if auth already exists in codebase
- [ ] Review existing user model
- [ ] Research JWT library options
- [ ] Check API patterns used in project

## Phase 1: Write Tests (TDD)
- [ ] Write test: user can register
- [ ] Write test: user can login
- [ ] Write test: invalid credentials rejected
- [ ] Verify all tests fail

## Phase 2: Implementation
- [ ] Implement registration (test passes)
- [ ] Implement login (test passes)
- [ ] Implement validation (test passes)

## Phase 3: Integration Testing
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Browser login flow works (use browser tool)

## Phase 4: Finalize
- [ ] Documentation updated
- [ ] Commit and push

## Completion Criteria
1. All phases complete
2. All tests passing
3. Browser tests passing
4. PR ready
```

### Step 2: Create the prompt file

File: `.claude/feature-x-loop.md`

```markdown
ultrathink:

# Feature X Development Loop

## Mission
Implement user authentication following TDD methodology.

## Files
- Plan: `.claude/feature-x-plan.md`

## Instructions
1. Read `.claude/feature-x-plan.md` completely
2. Check the NOTES section for previous attempts
3. Find the first incomplete task (marked with `- [ ]`)
4. Complete that task
5. Mark it done with `- [x]`
6. Update the NOTES section with what you tried/learned
7. Run tests after implementation changes
8. Continue to next task

## Important Rules
- Complete Phase 0 (Research) before any implementation
- Write tests BEFORE implementation (TDD)
- Update NOTES every iteration to track progress
- Do NOT mark complete until ALL tests PASS

## Completion Promise
Output `<promise>FEATURE_X_DONE</promise>` when:
- All tasks complete
- All tests run AND pass
- Changes committed and pushed
```

### Step 3: Run the Ralph loop

```bash
/ralph-loop:ralph-loop "$(cat .claude/feature-x-loop.md)" --max-iterations 15 --completion-promise "FEATURE_X_DONE"
```

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No `--max-iterations` | Loop runs forever | Always set, default to 10 |
| No `--completion-promise` | Loop never ends cleanly | Always set a promise |
| Prompt in quotes | Hard to maintain, escaping issues | Use `cat` to read file |
| Missing `ultrathink:` | Suboptimal reasoning | Start prompt with `ultrathink:` |
| Promise mismatch | Loop never detects completion | Ensure prompt defines exact same promise |
| No plan file | Unstructured work | Always create implementation plan |
| Skipping research | Duplicate work, bugs | Complete Phase 0 first |
| Implementation before tests | Not TDD | Write failing tests first |
| Not updating notes | Repeating failed attempts | Update NOTES every iteration |
| Tests run but fail | Premature completion | Tests must PASS, not just run |
| Forgetting browser tests | UI bugs missed | Use browser tool for UI tasks |

## Pre-Flight Checklist

Before starting a Ralph loop, verify:

- [ ] Created implementation plan with TDD phases
- [ ] Plan has NOTES section for tracking attempts
- [ ] Plan has Phase 0 for research (codebase + external)
- [ ] Created prompt file starting with `ultrathink:`
- [ ] Prompt instructs to read plan file first
- [ ] Prompt instructs to update NOTES each iteration
- [ ] Prompt specifies tests must PASS (not just run)
- [ ] Prompt defines completion promise with `<promise>` tags
- [ ] `--max-iterations` is set (minimum 10)
- [ ] `--completion-promise` matches what's in the prompt file
- [ ] Using `cat` to read prompt file, not inline quotes

## Cancelling a Loop

```bash
/cancel-ralph
```

## Related

See `ralph_loop_best_practices.md` for philosophy and advanced usage.
