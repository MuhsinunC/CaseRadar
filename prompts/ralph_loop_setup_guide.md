# Ralph Loop Setup Guide

Quick reference for setting up Ralph loops correctly. Copy this file to any project.

---

## Quick Reference

```bash
# Command format
/ralph-loop:ralph-loop "$(cat .claude/<feature>-loop.md)" --max-iterations 10 --completion-promise "<FEATURE>_COMPLETE"

# Cancel a loop
/ralph-loop:cancel-ralph

# Required files
1. Prompt file (.claude/<feature>-loop.md) - starts with "ultrathink:"
2. Implementation plan (.claude/<feature>-implementation-plan.md) - TDD structure with notes

# Order of operations
Research → Failing Tests → Implementation → Playwright Tests → Integration → Commit+Push

# Key rules
- Create to-do list (TodoWrite) when starting each task
- Save to-do items as children in the plan
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
   - **Implementation plan** (`.claude/caching-implementation-plan.md`) - Comprehensive, meant to be iterated on
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

1. **Prompt file** (e.g., `.claude/<feature>-loop.md`)
2. **Implementation plan file** (e.g., `.claude/<feature>-implementation-plan.md`)

## Command Format

```bash
/ralph-loop:ralph-loop "$(cat .claude/<feature>-loop.md)" --max-iterations 10 --completion-promise "<FEATURE>_COMPLETE"
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

## First Iteration vs Later Iterations

### Iteration 1 (Start of Loop)
On the first iteration:
1. Read the **entire** implementation plan to understand full scope
2. Check Progress Summary for current phase and blockers
3. Identify the first incomplete task
4. Create to-do list for that task using TodoWrite
5. Save to-do items to the plan
6. Begin working

### Later Iterations (After Context Reset)
When context resets:
1. Check Progress Summary: What phase are we in? What's the last iteration number?
2. Read **only the current section** (use offset/limit for large plans)
3. Check notes under the current task for previous attempts
4. Continue where you left off (don't restart from beginning)
5. Update Progress Summary with new iteration number

**How to detect context reset**: If you don't remember previous work but Progress Summary shows iteration > 1, context has reset.

---

## TodoWrite vs Implementation Plan

**TodoWrite** (real-time visibility):
- User sees progress immediately in their terminal
- Provides satisfying "checking off" experience
- Resets on context window reset
- For the current iteration only

**Implementation Plan** (persistence):
- Survives context window resets
- Your only memory between iterations
- Must stay in sync with TodoWrite
- For all iterations

**Keep them in sync**: When marking TodoWrite complete, also mark the plan complete.

---

## Iteration Expectations

| Iterations | Status | Action |
|------------|--------|--------|
| 1-3 | Normal | Keep working |
| 4-5 | Slow | Review approach, check notes |
| 6-10 | Potentially stuck | Consider Stuck Protocol |
| 10+ on same task | Stuck | Definitely invoke Stuck Protocol |

**If stuck for 3+ iterations on the same task:**
1. Stop attempting the same approach
2. Document what's tried in notes
3. Follow Stuck Protocol (document blocker, list alternatives)
4. Consider breaking down the task

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
- Implementation plan: `.claude/<feature>-implementation-plan.md`

## Thinking Guidelines
- Think through each step carefully before acting
- Consider edge cases and what could go wrong
- Analyze existing code patterns before implementing
- Reason through tradeoffs before deciding
- Be careful not to break existing functionality

## Instructions

### First Iteration
1. Read the ENTIRE implementation plan to understand scope
2. Check Progress Summary for current phase
3. Go to "Every Task" step 4 below

### Later Iterations (after context reset)
1. Check Progress Summary: What phase? What iteration?
2. Read only the current section (use offset/limit if plan is large)
3. Check notes for previous attempts
4. Go to "Every Task" step 4 below

### Every Task
4. For the next incomplete task:
   a. Think through and create a to-do list using TodoWrite
   b. Save the exact to-do items as children in the plan
   c. Work through completing each to-do item
   d. Mark items complete in BOTH TodoWrite AND the plan
5. Add notes under the task (include iteration number)
6. Run tests and verify they pass
7. After task to-do list is done, move to the next task
8. Continue until all tasks done
9. Commit and push all changes
10. Verify Definition of Done checklist

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

## On Completion
When all criteria are met:
1. Output the completion promise
2. List all items from "Future Work (Out of Scope)" section
3. This gives the user visibility into what came up during development

## Completion Promise
Output `<promise><FEATURE>_COMPLETE</promise>` only when ALL completion criteria are met.

This promise MUST match the --completion-promise parameter exactly.

After the promise, output a "## Future Work Discovered" section listing all items from Future Work (or "None" if empty).
```

---

## Implementation Plan File Structure

The implementation plan follows **Test-Driven Development (TDD)** with **hierarchical notes under each task**.

The plan is meant to be **iterated on and improved** during the loop. The research phase can refine the plan itself.

### Key Principles

1. **Research before implementation**
   - ALWAYS complete Section 1 before writing any code
   - Check what already exists to avoid duplicate work
   - Research can refine the implementation plan itself

2. **Task-level to-do lists**
   - When starting a task, create a to-do list using TodoWrite
   - Save items as children under that task in the plan
   - Mark complete in both TodoWrite AND the plan

3. **Notes go under each task** (not in a separate section)
   - Include iteration numbers: `Iteration N: tried X, result Y`
   - Log errors with detail: `Error: message` → `File: path:line` → `Cause` → `Fix`
   - Document what worked AND what didn't

4. **Tests must FAIL before implementation** (TDD)
   - Write the test first, verify it fails (red phase)
   - If test passes unexpectedly: stop and investigate
   - Only then implement to make it pass (green phase)

5. **Tests must PASS before completion**
   - All tests executed and GREEN
   - No skipped or ignored tests

6. **Playwright before browser tool**
   - Playwright is faster and repeatable
   - Browser tool only if manual verification needed after Playwright passes

7. **End with commit AND push**
   - Loop is NOT complete until changes are pushed to remote

8. **Checkpoints for long tasks**
   - Commit at logical checkpoints, not just at the end

9. **No scope creep**
   - Only implement what's in the plan
   - Note "Future Work" ideas but don't implement them

### Task-Level To-Do List Workflow Example

When you start working on a task like "3.1. Implement Feature A":

**Step 1: Create to-do list with TodoWrite**
```
TodoWrite: [
  { content: "Read existing auth code patterns", activeForm: "Reading existing auth code patterns", status: "pending" },
  { content: "Create AuthService class", activeForm: "Creating AuthService class", status: "pending" },
  { content: "Add login method", activeForm: "Adding login method", status: "pending" },
  { content: "Add logout method", activeForm: "Adding logout method", status: "pending" },
  { content: "Run tests to verify", activeForm: "Running tests to verify", status: "pending" }
]
```

Note: `content` is what to do (imperative), `activeForm` is what you're doing (present continuous). Both are required.

**Step 2: Save these items as children in the implementation plan**
```markdown
### 3.1. Implement Feature A
- [ ] Read existing auth code patterns
- [ ] Create AuthService class
- [ ] Add login method
- [ ] Add logout method
- [ ] Run tests to verify
```

**Step 3: Work through each item**
- Mark items `in_progress` in TodoWrite as you work
- Mark items `[x]` in the plan when complete
- Add notes under each item as you go

**Step 4: When task to-do list is complete, move to next task**

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

Customize these for your project's test/build setup:

```bash
# Example commands - replace with your project's actual commands
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

## Rollback Protocol

If your implementation breaks existing tests:

1. **Don't panic** - document what broke
2. **Stash or revert**: `git stash` or `git checkout -- <file>`
3. **Investigate**: Why do existing tests depend on this?
4. **Adjust approach**: Maintain backwards compatibility
5. **Document**: Note this in the task so you don't repeat it

---

## Complete Example

### Step 1: Create the implementation plan

File: `.claude/feature-x-implementation-plan.md`

Use the template from the "Implementation Plan File Structure" section above, customized for your feature. The plan should include:
- Overview describing JWT authentication
- Progress Summary
- Section 0: Environment setup (JWT_SECRET)
- Section 1: Research (existing auth, user model, JWT libraries)
- Section 2: Failing tests (registration, login, validation, Playwright)
- Section 3: Implementation
- Section 4: Integration testing
- Section 5: Finalize (commit and push)
- Validation Commands and Definition of Done

### Step 2: Create the prompt file

File: `.claude/feature-x-loop.md`

```markdown
ultrathink:

# Feature X Development Loop

## Mission
Implement user authentication following TDD methodology.

## Files
- Plan: `.claude/feature-x-implementation-plan.md`

## Thinking Guidelines
- Think through each step carefully before acting
- Consider edge cases and what could go wrong
- Before implementing, analyze existing code patterns first
- List pros and cons of approaches before deciding
- Be careful not to break existing functionality
- Consider backwards compatibility
- What dependencies might this affect?

## Instructions

### First Iteration
1. Read the ENTIRE `.claude/feature-x-implementation-plan.md` to understand scope
2. Check Progress Summary for current phase
3. Go to step 4 below

### Later Iterations (after context reset)
1. Check Progress Summary: What phase? What iteration?
2. Read only the current section (use offset/limit if plan is large)
3. Check notes for previous attempts
4. Continue from step 4 below

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
Output `<promise>FEATURE_X_COMPLETE</promise>` when:
- All tasks complete
- All tests pass (unit + Playwright + integration)
- All changes committed and pushed
- Definition of Done verified

After the promise, output "## Future Work Discovered" listing items from Future Work section (or "None").
```

### Step 3: Run the Ralph loop

```bash
/ralph-loop:ralph-loop "$(cat .claude/feature-x-loop.md)" --max-iterations 15 --completion-promise "FEATURE_X_COMPLETE"
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
| No TodoWrite for tasks | User can't see progress | Create to-do list at start of each task |
| TodoWrite/plan out of sync | Confusion, lost progress | Mark complete in BOTH |

---

## Pre-Flight Checklist

Before starting a Ralph loop, verify:

- [ ] Implementation plan exists: `.claude/<feature>-implementation-plan.md`
- [ ] Prompt file exists: `.claude/<feature>-loop.md`
- [ ] Prompt starts with `ultrathink:`
- [ ] Plan follows the template (Progress Summary, Definition of Done, etc.)
- [ ] `--max-iterations` is set (default: 10)
- [ ] `--completion-promise` matches the promise in the prompt file
- [ ] Command uses `cat` to read prompt file (not inline quotes)

---

## Cancelling a Loop

```bash
/ralph-loop:cancel-ralph
```

---

## Related

See `ralph_loop_best_practices.md` for philosophy and advanced usage.
