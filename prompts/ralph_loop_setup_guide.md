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

## Instructions
1. Read the relevant section of the implementation plan
2. Check notes under that section for previous attempts
3. Complete the next incomplete task
4. Add notes under that task about what you tried/learned
5. Run tests and verify they pass
6. Continue until all tasks done
7. Commit and push all changes

## Completion Criteria
- All tasks in the implementation plan are done
- ALL tests have been run AND pass
- All changes are committed AND pushed to remote

## Completion Promise
Output `<promise>TASK_COMPLETE</promise>` only when ALL completion criteria are met.

This promise MUST match the --completion-promise parameter exactly.
```

---

## Implementation Plan File Structure

The implementation plan follows **Test-Driven Development (TDD)** with **hierarchical notes under each task**.

### Key Principles

1. **Notes go under each task, not in a separate section**
   - Each task can have sub-notes (1.a., 1.a.i., etc.)
   - This keeps context close to the work
   - You only need to read the relevant section, not the whole file

2. **Tests must be FAILING before implementation**
   - Write the test first
   - Verify it fails (red phase)
   - Only then implement to make it pass (green phase)

3. **End with commit and push**
   - Loop is NOT complete until changes are pushed

### Template

```markdown
# Task Implementation Plan

## Overview
What we're building and why.

---

## 1. Research Phase (COMPLETE BEFORE ANY IMPLEMENTATION)

### 1.1. Codebase Understanding
- [ ] Review existing code for similar/related functionality
  - Notes: (what you found, what already exists)
- [ ] Identify what already exists to avoid duplicate work
  - Notes: (existing implementations discovered)
- [ ] Understand current patterns and conventions
  - Notes: (patterns to follow)
- [ ] Map integration points
  - Notes: (where this connects to existing code)

### 1.2. External Research
- [ ] Research required APIs/SDKs
  - Notes: (API docs reviewed, key findings)
  - 1.2.a. What worked: (successful approaches)
  - 1.2.b. What didn't work: (failed approaches and why)
- [ ] Review library documentation
  - Notes: (library versions, key methods)
- [ ] Check for existing solutions/examples
  - Notes: (examples found, repos referenced)

---

## 2. Write Failing Tests First (TDD Red Phase)

### 2.1. Feature A Tests
- [ ] Write test for feature A
  - Notes: (test file location, what it tests)
- [ ] Verify test FAILS before implementation
  - Notes: (failure message observed)
  - 2.1.a. If test passes unexpectedly: investigate why (might already be implemented)

### 2.2. Feature B Tests
- [ ] Write test for feature B
  - Notes: (test file location, what it tests)
- [ ] Verify test FAILS before implementation
  - Notes: (failure message observed)

---

## 3. Implementation (TDD Green Phase)

### 3.1. Implement Feature A
- [ ] Write minimal code to make test pass
  - Notes: (approach taken)
  - 3.1.a. Attempts:
    - 3.1.a.i. First attempt: (what you tried)
    - 3.1.a.ii. Result: (passed/failed, why)
  - 3.1.b. What didn't work: (failed approaches)
  - 3.1.c. What worked: (successful approach)
- [ ] Verify test passes
  - Notes: (test output)

### 3.2. Implement Feature B
- [ ] Write minimal code to make test pass
  - Notes: (approach taken)
- [ ] Verify test passes
  - Notes: (test output)

### 3.3. Refactor (TDD Refactor Phase)
- [ ] Clean up code while keeping tests green
  - Notes: (refactoring done)
- [ ] All tests still pass after refactor
  - Notes: (test results)

---

## 4. Integration & Browser Testing

### 4.1. Integration Tests
- [ ] Run all integration tests
  - Notes: (results, any failures)
- [ ] All integration tests pass
  - Notes: (final results)

### 4.2. Browser Tests (if applicable)
- [ ] Use browser tool to verify UI functionality
  - Notes: (what was tested)
- [ ] All browser tests pass
  - Notes: (results)

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
  - Notes: (push confirmed)

---

## Completion Criteria
ALL of the following must be true:
1. All checkboxes marked [x]
2. All tests have been RUN
3. All tests PASS (green, not red)
4. All changes COMMITTED
5. All changes PUSHED to remote
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

Research includes:
- **Codebase**: What already exists? What patterns are used?
- **External**: APIs, SDKs, libraries, online documentation

### 2. Tests Must FAIL First (TDD)

This is non-negotiable:

1. **Write the test** for the feature
2. **Run the test** - it MUST fail
3. **If test passes**: Stop! Investigate why. The feature might already exist.
4. **Only after confirming failure**: Implement the feature
5. **Run test again** - it should now pass

The "red" phase (failing test) proves your test actually tests something.

### 3. Hierarchical Notes Under Each Task

**Why this structure?**

Ralph loops can run for many iterations, exceeding your context window. The implementation plan is your persistent memory, but it might get large.

By putting notes **under each task**:
- You only read the section you're working on
- Notes stay close to the relevant context
- You don't need to load the entire file to understand one task

**Note format:**
```markdown
- [ ] Task description
  - Notes: (general notes about this task)
  - 1.a. Sub-note: (more detail)
    - 1.a.i. Even more detail
  - 1.b. What didn't work: (failed approach and why)
  - 1.c. What worked: (successful approach)
```

This prevents:
- Trying the same failed approach repeatedly
- Forgetting what you learned
- Losing context between iterations

### 4. Tests Must PASS (Not Just Run)

The loop is **NOT complete** until:
- All tests have been executed
- All tests are GREEN (passing)
- No skipped or ignored tests
- No failing tests

Running tests that fail does not count as completion.

### 5. Must Commit AND Push

The loop is **NOT complete** until:
- All changes are staged
- All changes are committed
- All changes are pushed to remote

This is often forgotten! Add it to your completion criteria.

### 6. Browser Testing Available

For UI or web-related tasks:
- The **browser tool** is available for actual browser tests
- Use it to verify UI functionality works in a real browser
- Include browser tests in Section 4

---

## Complete Example

### Step 1: Create the implementation plan

File: `.claude/feature-x-plan.md`

```markdown
# Feature X Implementation Plan

## Overview
Add user authentication with JWT tokens.

---

## 1. Research Phase

### 1.1. Codebase Understanding
- [ ] Check if auth already exists
  - Notes:
- [ ] Review existing user model
  - Notes:
- [ ] Check API patterns used
  - Notes:

### 1.2. External Research
- [ ] Research JWT library options
  - Notes:
  - 1.2.a. Libraries considered:
  - 1.2.b. Library chosen and why:

---

## 2. Write Failing Tests (TDD Red)

### 2.1. Registration Test
- [ ] Write test: user can register
  - Notes:
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

---

## 3. Implementation (TDD Green)

### 3.1. Implement Registration
- [ ] Make registration test pass
  - Notes:
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

---

## 4. Integration Testing

### 4.1. All Tests
- [ ] Run full test suite
  - Notes:
- [ ] All tests pass
  - Notes:

### 4.2. Browser Testing
- [ ] Test login flow in browser
  - Notes:

---

## 5. Finalize

### 5.1. Documentation
- [ ] Update API docs
  - Notes:

### 5.2. Commit and Push
- [ ] Commit all changes
  - Notes:
- [ ] Push to remote
  - Notes:

---

## Completion Criteria
1. All tasks [x]
2. All tests passing
3. Committed and pushed
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
1. Read the current section of `.claude/feature-x-plan.md`
2. Check notes under that section for previous attempts
3. Find the first incomplete task (marked with `- [ ]`)
4. Complete that task
5. Mark it done with `- [x]`
6. Add notes under that task about what you tried/learned
7. If writing tests: verify they FAIL before implementing
8. Run tests after implementation changes
9. Continue to next task
10. When all tasks done: commit and push

## Important Rules
- Complete Section 1 (Research) before any implementation
- Tests must FAIL before you implement (TDD red phase)
- Add notes under each task, not in a separate section
- Do NOT mark complete until all tests PASS
- Do NOT mark complete until changes are PUSHED

## Completion Promise
Output `<promise>FEATURE_X_DONE</promise>` when:
- All tasks complete
- All tests pass (green)
- All changes committed and pushed
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
| Tests run but fail | Premature completion | Tests must PASS, not just run |
| Changes not pushed | Incomplete work | Must commit AND push |
| Forgetting browser tests | UI bugs missed | Use browser tool for UI tasks |

---

## Pre-Flight Checklist

Before starting a Ralph loop, verify:

- [ ] Created implementation plan with TDD structure
- [ ] Plan has Section 1 for research (codebase + external)
- [ ] Plan has Section 2 for writing FAILING tests first
- [ ] Plan has Section 5 for commit AND push
- [ ] Notes go under each task (hierarchical: 1.a., 1.a.i., etc.)
- [ ] Created prompt file starting with `ultrathink:`
- [ ] Prompt instructs to read plan file section by section
- [ ] Prompt instructs to verify tests FAIL before implementing
- [ ] Prompt instructs to add notes under each task
- [ ] Prompt specifies tests must PASS (not just run)
- [ ] Prompt specifies must commit AND push
- [ ] `--max-iterations` is set (minimum 10)
- [ ] `--completion-promise` matches what's in the prompt file
- [ ] Using `cat` to read prompt file, not inline quotes

---

## Cancelling a Loop

```bash
/cancel-ralph
```

---

## Related

See `ralph_loop_best_practices.md` for philosophy and advanced usage.
