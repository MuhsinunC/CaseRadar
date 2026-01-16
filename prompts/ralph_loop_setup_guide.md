# Ralph Loop Setup Guide

Quick reference for setting up Ralph loops correctly. Copy this file to any project.

---

## Quick Reference

```bash
# Command format
/ralph-loop:ralph-loop "$(cat .claude/task-loop.md)" --max-iterations 10 --completion-promise "TASK_DONE"

# Cancel a loop
/ralph-loop:cancel-ralph

# Required files
1. Prompt file (.claude/task-loop.md) - starts with "ultrathink:"
2. Implementation plan (.claude/task-plan.md) - TDD structure with notes

# Order of operations
Research → Failing Tests → Implementation → Playwright Tests → Integration → Commit+Push

# Key rules
- Tests must FAIL before implementing
- Notes go under each task
- Must commit AND push
- Playwright before browser tool
```

---

## How This Guide Is Used

When you want to implement a feature:

1. **You describe the feature**: "Make a Ralph loop to implement caching for the most commonly requested database operations"

2. **Claude reads this guide and creates TWO files**:
   - **Implementation plan** (`.claude/caching-plan.md`) - Comprehensive, meant to be iterated on
   - **Prompt file** (`.claude/caching-loop.md`) - Starts with `ultrathink:`

3. **The Ralph loop runs**, iterating on the implementation plan until complete

4. **The research phase can improve the plan itself** - It's not just about understanding code, but also refining the implementation approach

---

## Prompt Engineering Phrases

Use these in the prompt file to improve reasoning:

**For step-by-step thinking:**
- "Think through this step by step"
- "Don't skip steps - walk through the full logic"
- "Verify your assumptions before proceeding"

**For analysis and planning:**
- "Before implementing, analyze the existing code patterns first"
- "List the pros and cons of each approach"
- "What could go wrong with this approach?"
- "Consider at least 3 different ways to solve this"

**For thoroughness:**
- "Check for edge cases"
- "Consider edge cases carefully"
- "Double-check this against the existing codebase"

**For depth:**
- "Explain your reasoning"
- "Why is this the best approach?"
- "What are the tradeoffs?"
- "Reason through the tradeoffs before deciding"
- "Think about maintainability and future changes"

**For caution:**
- "Be careful not to break existing functionality"
- "Consider backwards compatibility"
- "What dependencies might this affect?"

---

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

---

## Context Window Warning

**Your context window WILL reset during long loops.**

The implementation plan is your ONLY persistent memory. Every iteration, you start fresh with no memory of previous iterations except what's written in files.

**If you don't write it down, you WILL forget it.**

This is why:
- Notes go under each task
- You track iteration numbers
- You document what worked AND what didn't
- You log errors with full details

---

## Do NOT

- Implement before tests fail (TDD red phase first)
- Skip the research phase
- Add features not in the plan (scope creep)
- Mark complete with failing tests
- Forget to push
- Repeat approaches that already failed (check notes!)
- Use browser tool before Playwright tests pass
- Output the completion promise until Definition of Done is verified

---

## Prompt File Structure

The prompt file **must** start with `ultrathink:` as the very first characters:

```markdown
ultrathink:

# Task Name Loop

## Mission
Brief description of what needs to be accomplished.

## Files
- Implementation plan: `.claude/my-task-plan.md`

## Thinking Guidelines
- Think through each step carefully before acting
- Consider edge cases and what could go wrong
- Analyze existing code patterns before implementing
- Reason through tradeoffs before deciding
- Be careful not to break existing functionality

## Instructions
1. Read the relevant section of the implementation plan
2. Check notes under that section for previous attempts
3. Complete the next incomplete task
4. Add notes under that task (include iteration number)
5. Run tests and verify they pass
6. Continue until all tasks done
7. Commit and push all changes
8. Verify Definition of Done checklist

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
- ALL tests have been run AND pass (Playwright + unit + integration)
- All changes are committed AND pushed to remote
- Definition of Done checklist is complete

## Completion Promise
Output `<promise>TASK_COMPLETE</promise>` only when ALL completion criteria are met.

This promise MUST match the --completion-promise parameter exactly.
```

---

## Implementation Plan File Structure

The implementation plan follows **Test-Driven Development (TDD)** with **hierarchical notes under each task**.

The plan is meant to be **iterated on and improved** during the loop. The research phase can refine the plan itself.

### Key Principles

1. **Notes go under each task, not in a separate section**
   - Each task can have sub-notes (1.a., 1.a.i., etc.)
   - Include iteration numbers in notes
   - This keeps context close to the work
   - You only need to read the relevant section, not the whole file

2. **Tests must be FAILING before implementation**
   - Write the test first
   - Verify it fails (red phase)
   - Only then implement to make it pass (green phase)

3. **Playwright before browser tool**
   - Use Playwright for programmatic browser testing (faster, repeatable)
   - Playwright tests must pass first
   - Browser tool only if manual verification needed after Playwright passes

4. **End with commit and push**
   - Loop is NOT complete until changes are pushed

5. **Checkpoints for long tasks**
   - Commit at logical checkpoints
   - Don't wait until the end to commit

6. **No scope creep**
   - Only implement what's in the plan
   - Note "Future Work" ideas but don't implement them

### Template

```markdown
# Task Implementation Plan

## Overview
What we're building and why.

## Progress Summary
- Current Phase: (1. Research / 2. Tests / 3. Implementation / etc.)
- Tasks Complete: X/Y
- Last Updated: Iteration N
- Blockers: (None / description)

## Files Changed
- Created: (list new files)
- Modified: (list changed files)
- Deleted: (list removed files)

## Future Work (Out of Scope)
- (Ideas discovered but NOT implementing in this loop)

---

## 0. Environment Setup (If Needed)

- [ ] Environment variables configured
  - Notes: (which env vars needed)
- [ ] Dependencies installed
  - Notes: (npm install, pip install, etc.)
- [ ] Services running
  - Notes: (databases, APIs, etc.)

---

## 1. Research Phase (COMPLETE BEFORE ANY IMPLEMENTATION)

Research serves two purposes:
1. Understand the codebase and external tools
2. **Refine and improve this implementation plan**

### 1.1. Codebase Understanding
- [ ] Review existing code for similar/related functionality
  - Notes: (what you found, what already exists)
  - Iteration N: (findings)
  - Consider: What patterns does this codebase use?
- [ ] Identify what already exists to avoid duplicate work
  - Notes: (existing implementations discovered)
  - Double-check against existing code before proceeding
- [ ] Understand current patterns and conventions
  - Notes: (patterns to follow)
- [ ] Map integration points
  - Notes: (where this connects to existing code)
  - What dependencies might this affect?

### 1.2. External Research
- [ ] Research required APIs/SDKs
  - Notes: (API docs reviewed, key findings)
  - 1.2.a. What worked: (successful approaches)
  - 1.2.b. What didn't work: (failed approaches and why)
- [ ] Review library documentation
  - Notes: (library versions, key methods)
- [ ] Check for existing solutions/examples
  - Notes: (examples found, repos referenced)

### 1.3. Plan Refinement
- [ ] Update this plan based on research findings
  - Notes: (what was changed in the plan)
  - List pros and cons of the chosen approach
  - Why is this the best approach?

---

## 2. Write Failing Tests First (TDD Red Phase)

### 2.1. Feature A Tests
- [ ] Write test for feature A
  - Notes: (test file location, what it tests)
  - Think through edge cases carefully
- [ ] Verify test FAILS before implementation
  - Notes: (failure message observed)
  - 2.1.a. If test passes unexpectedly: investigate why (might already be implemented)

### 2.2. Feature B Tests
- [ ] Write test for feature B
  - Notes: (test file location, what it tests)
- [ ] Verify test FAILS before implementation
  - Notes: (failure message observed)

### 2.3. Playwright Tests (If UI/Browser Needed)
- [ ] Write Playwright test for browser functionality
  - Notes: (test file, what it tests)
  - Playwright is faster and programmatic - use it before browser tool
- [ ] Verify Playwright test FAILS before implementation
  - Notes: (failure message)

### 2.4. Checkpoint: Tests Written
- [ ] All tests written and verified failing
- [ ] Commit checkpoint: `test: add failing tests for [feature]`
  - Notes: (commit hash)

---

## 3. Implementation (TDD Green Phase)

### 3.1. Implement Feature A
- [ ] Write minimal code to make test pass
  - Notes: (approach taken)
  - Be careful not to break existing functionality
  - 3.1.a. Attempts:
    - 3.1.a.i. Iteration N - First attempt: (what you tried)
    - 3.1.a.ii. Result: (passed/failed, why)
  - 3.1.b. What didn't work: (failed approaches)
  - 3.1.c. What worked: (successful approach)
  - 3.1.d. Errors encountered:
    - Error: `ErrorMessage here`
    - File: `path/to/file.ts:lineNumber`
    - Cause: (why it happened)
    - Fix: (how you fixed it)
- [ ] Verify test passes
  - Notes: (test output)

### 3.2. Implement Feature B
- [ ] Write minimal code to make test pass
  - Notes: (approach taken)
  - Consider backwards compatibility
- [ ] Verify test passes
  - Notes: (test output)

### 3.3. Refactor (TDD Refactor Phase)
- [ ] Clean up code while keeping tests green
  - Notes: (refactoring done)
  - Think about maintainability and future changes
- [ ] All tests still pass after refactor
  - Notes: (test results)

### 3.4. Checkpoint: Implementation Complete
- [ ] All features implemented
- [ ] All unit tests pass
- [ ] Commit checkpoint: `feat: implement [feature]`
  - Notes: (commit hash)

---

## 4. Integration & Browser Testing

### 4.1. Unit Tests
- [ ] Run all unit tests
  - Notes: (results)
- [ ] All unit tests pass
  - Notes: (final count)

### 4.2. Playwright Tests (Browser - Programmatic)
- [ ] Run Playwright tests
  - Notes: (results)
  - Playwright is faster and repeatable - run these first
- [ ] All Playwright tests pass
  - Notes: (final count)

### 4.3. Integration Tests
- [ ] Run all integration tests
  - Notes: (results, any failures)
- [ ] All integration tests pass
  - Notes: (final results)

### 4.4. Browser Tool Verification (Only If Needed)
Only use browser tool if:
- Playwright tests all pass AND
- Manual verification is needed for something Playwright can't test

- [ ] Use browser tool to verify UI functionality
  - Notes: (what was tested, why browser tool was needed)
- [ ] Browser verification complete
  - Notes: (results)

### 4.5. Manual Verification (If Applicable)
- [ ] Verify feature works as expected manually
  - Notes: (what was verified, how)
- [ ] Edge cases checked
  - Notes: (edge cases tested)

### 4.6. If Existing Tests Break
- [ ] Document which tests broke
  - Notes: (test names, error messages)
- [ ] Investigate why
  - Notes: (root cause)
  - What dependencies did this affect?
- [ ] Fix without breaking functionality
  - Notes: (approach taken)
  - 4.6.a. If rollback needed: `git stash` or `git checkout -- <file>`

---

## 5. Finalize

### 5.1. Documentation
- [ ] Update relevant documentation
  - Notes: (docs updated)

### 5.2. Commit and Push
- [ ] Stage all changes
  - Notes: (files staged)
- [ ] Commit with descriptive message
  - Notes: (commit hash)
- [ ] Push to remote
  - Notes: (push confirmed, branch name)

---

## Validation Commands

```bash
# Run these to verify completion
npm test              # or: pytest, go test, etc.
npm run test:e2e      # Playwright tests
npm run lint          # Linting
npm run typecheck     # Type checking (if applicable)
git status            # Should be clean
git push              # Should succeed
```

---

## Definition of Done (Check ALL Before Promise)

- [ ] All task checkboxes marked [x]
- [ ] All unit tests pass
- [ ] All Playwright tests pass
- [ ] All integration tests pass
- [ ] No linter errors
- [ ] `git status` shows clean working tree
- [ ] `git push` succeeded
- [ ] No skipped or ignored tests

Only output the completion promise when ALL boxes above are checked.

---

## Stuck Protocol

If after multiple iterations you're not making progress:

### Document the Blocker
```markdown
### BLOCKER (Iteration N)
- **What's blocked**: (specific task)
- **Attempts made**:
  - Iteration X: Tried A, failed because B
  - Iteration Y: Tried C, failed because D
- **What could go wrong?**: (analysis of failure modes)
- **Hypotheses for failure**:
  1. (why it might not be working)
  2. (alternative theory)
- **At least 3 different approaches to try**:
  1. (approach 1)
  2. (approach 2)
  3. (approach 3)
- **Pros and cons of each approach**:
  - Approach 1: pros/cons
  - Approach 2: pros/cons
  - Approach 3: pros/cons
- **Should this task be broken down?**: Yes/No
  - If yes: (proposed subtasks)
```

---

## Critical Rules

### 1. Research Before Implementation

**ALWAYS complete Section 1 before writing any code.**

Why this matters:
- Avoids duplicate work (something might already exist!)
- Prevents bugs from conflicting implementations
- Saves time by understanding the landscape first
- Identifies the right approach before committing to it
- **Refines the implementation plan itself**

Research includes:
- **Codebase**: What already exists? What patterns are used?
- **External**: APIs, SDKs, libraries, online documentation
- **Plan refinement**: Update the plan based on what you learn

### 2. Tests Must FAIL First (TDD)

This is non-negotiable:

1. **Write the test** for the feature
2. **Run the test** - it MUST fail
3. **If test passes**: Stop! Investigate why. The feature might already exist.
4. **Only after confirming failure**: Implement the feature
5. **Run test again** - it should now pass

The "red" phase (failing test) proves your test actually tests something.

### 3. Playwright Before Browser Tool

For UI/browser testing:

1. **Write Playwright tests first** - programmatic, fast, repeatable
2. **Run Playwright tests** - they must pass
3. **Only then** use browser tool IF manual verification is needed
4. Browser tool is slower and not repeatable - use sparingly

Playwright can do almost everything browser tool can, but faster and programmatically.

### 4. Hierarchical Notes Under Each Task

**Why this structure?**

Ralph loops can run for many iterations, exceeding your context window. The implementation plan is your persistent memory, but it might get large.

By putting notes **under each task**:
- You only read the section you're working on
- Notes stay close to the relevant context
- You don't need to load the entire file to understand one task

**Note format with iteration tracking:**
```markdown
- [ ] Task description
  - Notes: (general notes about this task)
  - Iteration 1: Tried X, result Y
  - Iteration 2: Tried Z, result W
  - 1.a. Sub-note: (more detail)
    - 1.a.i. Even more detail
  - 1.b. What didn't work: (failed approach and why)
  - 1.c. What worked: (successful approach)
```

**Error logging format:**
```markdown
  - Error: `TypeError: Cannot read property 'x' of undefined`
    - File: `src/auth.ts:42`
    - Cause: Missing null check
    - Fix: Added optional chaining `user?.profile`
```

This prevents:
- Trying the same failed approach repeatedly
- Forgetting what you learned
- Losing context between iterations

### 5. Tests Must PASS (Not Just Run)

The loop is **NOT complete** until:
- All tests have been executed
- All tests are GREEN (passing)
- No skipped or ignored tests
- No failing tests

Running tests that fail does not count as completion.

### 6. Must Commit AND Push

The loop is **NOT complete** until:
- All changes are staged
- All changes are committed
- All changes are pushed to remote
- `git status` shows clean working tree

This is often forgotten! Add it to your completion criteria.

### 7. Checkpoint Commits

For long tasks, commit at logical checkpoints:
- After writing failing tests
- After implementing each major feature
- Before refactoring
- After fixing bugs

This creates a safety net and makes rollbacks easier.

### 8. No Scope Creep

Do NOT add features not in the original plan.

If you discover something that "should" be added:
1. Note it in "Future Work (Out of Scope)" section
2. Do NOT implement it in this loop
3. Stay focused on the defined tasks

### 9. Rollback Protocol

If your implementation breaks existing tests:

1. **Don't panic** - document what broke
2. **Stash or revert**: `git stash` or `git checkout -- <file>`
3. **Investigate**: Why do existing tests depend on this?
4. **Adjust approach**: Maintain backwards compatibility
5. **Document**: Note this in the task so you don't repeat it

---

## Complete Example

### Step 1: Create the implementation plan

File: `.claude/feature-x-plan.md`

```markdown
# Feature X Implementation Plan

## Overview
Add user authentication with JWT tokens.

## Progress Summary
- Current Phase: 1. Research
- Tasks Complete: 0/20
- Last Updated: Iteration 0
- Blockers: None

## Files Changed
- Created: (none yet)
- Modified: (none yet)

## Future Work (Out of Scope)
- (none yet)

---

## 0. Environment Setup

- [ ] JWT_SECRET env var configured
  - Notes:

---

## 1. Research Phase

### 1.1. Codebase Understanding
- [ ] Check if auth already exists
  - Notes:
  - Double-check before implementing
- [ ] Review existing user model
  - Notes:
- [ ] Check API patterns used
  - Notes:

### 1.2. External Research
- [ ] Research JWT library options
  - Notes:
  - 1.2.a. Libraries considered:
  - 1.2.b. Library chosen and why:
  - List pros and cons of each

### 1.3. Plan Refinement
- [ ] Update plan based on research
  - Notes:

---

## 2. Write Failing Tests (TDD Red)

### 2.1. Registration Test
- [ ] Write test: user can register
  - Notes:
  - Check for edge cases
- [ ] Verify test fails
  - Notes:

### 2.2. Login Test
- [ ] Write test: user can login
  - Notes:
- [ ] Verify test fails
  - Notes:

### 2.3. Validation Test
- [ ] Write test: invalid credentials rejected
  - Notes:
- [ ] Verify test fails
  - Notes:

### 2.4. Playwright Test
- [ ] Write Playwright test for login UI
  - Notes:
- [ ] Verify test fails
  - Notes:

### 2.5. Checkpoint
- [ ] Commit: `test: add failing auth tests`
  - Notes:

---

## 3. Implementation (TDD Green)

### 3.1. Implement Registration
- [ ] Make registration test pass
  - Notes:
  - Be careful not to break existing functionality
  - 3.1.a. Approach:
  - 3.1.b. Issues encountered:
- [ ] Test passes
  - Notes:

### 3.2. Implement Login
- [ ] Make login test pass
  - Notes:
- [ ] Test passes
  - Notes:

### 3.3. Implement Validation
- [ ] Make validation test pass
  - Notes:
- [ ] Test passes
  - Notes:

### 3.4. Checkpoint
- [ ] Commit: `feat: implement JWT authentication`
  - Notes:

---

## 4. Integration Testing

### 4.1. Unit Tests
- [ ] All unit tests pass
  - Notes:

### 4.2. Playwright Tests
- [ ] All Playwright tests pass
  - Notes:

### 4.3. Integration Tests
- [ ] All integration tests pass
  - Notes:

### 4.4. Browser Tool (Only If Needed)
- [ ] Manual browser verification (if Playwright insufficient)
  - Notes:

---

## 5. Finalize

### 5.1. Documentation
- [ ] Update API docs
  - Notes:

### 5.2. Commit and Push
- [ ] Final commit
  - Notes:
- [ ] Push to remote
  - Notes:

---

## Validation Commands

```bash
npm test
npm run test:e2e
npm run lint
git status
git push
```

---

## Definition of Done

- [ ] All tasks [x]
- [ ] All unit tests pass
- [ ] All Playwright tests pass
- [ ] All integration tests pass
- [ ] No linter errors
- [ ] git status clean
- [ ] git push succeeded
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

## Thinking Guidelines
- Think through each step carefully before acting
- Consider edge cases and what could go wrong
- Before implementing, analyze existing code patterns first
- List pros and cons of approaches before deciding
- Be careful not to break existing functionality
- Consider backwards compatibility
- What dependencies might this affect?

## Instructions
1. Read the current section of `.claude/feature-x-plan.md`
2. Check notes under that section for previous attempts
3. Find the first incomplete task (marked with `- [ ]`)
4. Complete that task
5. Mark it done with `- [x]`
6. Add notes under that task (include iteration number)
7. If writing tests: verify they FAIL before implementing
8. Run tests after implementation changes
9. Commit at checkpoints
10. When all tasks done: final commit and push
11. Verify Definition of Done checklist

## When Stuck
If multiple iterations without progress:
1. Document blocker with iteration numbers
2. List all approaches tried
3. What could go wrong with each approach?
4. Consider at least 3 different ways to solve this
5. List pros and cons of each approach
6. Suggest the best alternative
7. Consider breaking down the task

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
Output `<promise>FEATURE_X_DONE</promise>` when:
- All tasks complete
- All tests pass (unit + Playwright + integration)
- All changes committed and pushed
- Definition of Done verified
```

### Step 3: Run the Ralph loop

```bash
/ralph-loop:ralph-loop "$(cat .claude/feature-x-loop.md)" --max-iterations 15 --completion-promise "FEATURE_X_DONE"
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No `--max-iterations` | Loop runs forever | Always set, default to 10 |
| No `--completion-promise` | Loop never ends cleanly | Always set a promise |
| Prompt in quotes | Hard to maintain, escaping issues | Use `cat` to read file |
| Missing `ultrathink:` | Suboptimal reasoning | Start prompt with `ultrathink:` |
| Promise mismatch | Loop never detects completion | Ensure prompt defines exact same promise |
| No plan file | Unstructured work | Always create implementation plan |
| Skipping research | Duplicate work, bugs | Complete Section 1 first |
| Implementation before failing tests | Not TDD | Write test, verify it FAILS, then implement |
| Notes in separate section | Hard to find context | Put notes under each task |
| No iteration numbers | Can't track progress | Include iteration N in notes |
| Tests run but fail | Premature completion | Tests must PASS, not just run |
| Browser tool before Playwright | Slower, not repeatable | Playwright tests first, browser tool only if needed |
| Changes not pushed | Incomplete work | Must commit AND push |
| No checkpoint commits | Hard to rollback | Commit at logical checkpoints |
| Scope creep | Feature bloat | Only implement what's in the plan |
| Repeating failed approaches | Wasted iterations | Document what didn't work and why |
| No error details | Can't debug later | Log error, file, line, cause, fix |

---

## Pre-Flight Checklist

Before starting a Ralph loop, verify:

- [ ] Created implementation plan with TDD structure
- [ ] Plan has Progress Summary section
- [ ] Plan has Files Changed tracking
- [ ] Plan has Future Work section (for scope creep prevention)
- [ ] Plan has Section 0 for environment setup (if needed)
- [ ] Plan has Section 1 for research (codebase + external + plan refinement)
- [ ] Plan has Section 2 for writing FAILING tests first (including Playwright)
- [ ] Plan has checkpoint commits throughout
- [ ] Plan has Playwright tests before browser tool
- [ ] Plan has Section 5 for commit AND push
- [ ] Plan has Validation Commands
- [ ] Plan has Definition of Done checklist
- [ ] Notes go under each task (hierarchical: 1.a., 1.a.i., etc.)
- [ ] Created prompt file starting with `ultrathink:`
- [ ] Prompt has Thinking Guidelines with reasoning prompts
- [ ] Prompt instructs to read plan file section by section
- [ ] Prompt instructs to include iteration numbers in notes
- [ ] Prompt instructs to verify tests FAIL before implementing
- [ ] Prompt instructs to log errors with full details
- [ ] Prompt has "When Stuck" protocol
- [ ] Prompt specifies tests must PASS (not just run)
- [ ] Prompt specifies Playwright before browser tool
- [ ] Prompt specifies no scope creep
- [ ] Prompt specifies must commit AND push
- [ ] Prompt specifies to verify Definition of Done
- [ ] `--max-iterations` is set (minimum 10)
- [ ] `--completion-promise` matches what's in the prompt file
- [ ] Using `cat` to read prompt file, not inline quotes

---

## Cancelling a Loop

```bash
/ralph-loop:cancel-ralph
```

---

## Related

See `ralph_loop_best_practices.md` for philosophy and advanced usage.
