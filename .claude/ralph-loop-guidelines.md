# Ralph Loop Setup Guidelines

Quick reference for setting up Ralph loops correctly.

## Required Components

Every Ralph loop needs **two files**:

1. **Prompt file** (e.g., `.claude/my-task-loop.md`)
2. **Implementation plan file** (e.g., `.claude/my-task-plan.md`)

## Command Format

```bash
/ralph-loop "$(cat .claude/my-task-loop.md)" --max-iterations 10 --completion-promise "TASK_COMPLETE"
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
- Progress tracking: `.claude/my-task-progress.md`
- Other relevant files...

## Instructions
1. Read the implementation plan
2. Check progress file for current status
3. Complete the next incomplete task
4. Update progress file
5. Continue until all tasks done

## Completion Promise
Output `<promise>TASK_COMPLETE</promise>` when:
- All tasks in the implementation plan are done
- Tests pass
- Changes are committed and pushed

This promise MUST match the --completion-promise parameter exactly.
```

## Implementation Plan File Structure

```markdown
# Task Implementation Plan

## Overview
What we're building and why.

## Phase 1: Setup
- [ ] Task 1.1
- [ ] Task 1.2

## Phase 2: Core Implementation
- [ ] Task 2.1
- [ ] Task 2.2

## Phase 3: Testing & Validation
- [ ] Task 3.1
- [ ] Task 3.2

## Phase 4: Documentation & Cleanup
- [ ] Task 4.1
- [ ] Task 4.2

## Completion Criteria
All of the following must be true:
1. All checkboxes marked [x]
2. Tests passing
3. Changes committed and pushed
```

## Example: Complete Setup

### Step 1: Create the implementation plan

```bash
# .claude/feature-x-plan.md
```

```markdown
# Feature X Implementation Plan

## Phase 1: Research
- [ ] Understand existing codebase
- [ ] Identify integration points

## Phase 2: Implementation
- [ ] Create main module
- [ ] Add tests

## Phase 3: Finalize
- [ ] Documentation
- [ ] Commit and push

## Completion Criteria
1. All phases complete
2. Tests passing
3. PR ready
```

### Step 2: Create the prompt file

```bash
# .claude/feature-x-loop.md
```

```markdown
ultrathink:

# Feature X Development Loop

## Mission
Implement Feature X following the implementation plan.

## Files
- Plan: `.claude/feature-x-plan.md`

## Instructions
1. Read `.claude/feature-x-plan.md`
2. Find the first incomplete task (marked with `- [ ]`)
3. Complete that task
4. Mark it done with `- [x]`
5. Continue to next task

## Completion Promise
Output `<promise>FEATURE_X_DONE</promise>` when all tasks in the plan are complete.
```

### Step 3: Run the Ralph loop

```bash
/ralph-loop "$(cat .claude/feature-x-loop.md)" --max-iterations 10 --completion-promise "FEATURE_X_DONE"
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

## Checklist Before Starting

- [ ] Created implementation plan file with phases and checkboxes
- [ ] Created prompt file starting with `ultrathink:`
- [ ] Prompt references the implementation plan file
- [ ] Prompt defines the completion promise with `<promise>` tags
- [ ] `--max-iterations` is set (minimum 10)
- [ ] `--completion-promise` matches what's in the prompt file
- [ ] Using `cat` to read prompt file, not inline quotes
