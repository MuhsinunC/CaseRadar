# CaseRadar Architecture Documentation

This directory contains comprehensive system architecture documentation for CaseRadar, with extensive Mermaid diagrams that can be rendered to images.

## Documentation Files

| File | Description |
|------|-------------|
| `00-overview.md` | High-level system overview and tech stack |
| `01-database-schema.md` | Complete ERD with all tables and relationships |
| `02-api-routes.md` | All API endpoints with sequence diagrams |
| `03-frontend-components.md` | React component hierarchy |
| `04-authentication.md` | Clerk integration, auth flows, and RBAC |
| `05-data-flow.md` | End-to-end data flows through the system |
| `06-file-structure.md` | Complete file tree with descriptions |
| `07-dependencies.md` | All npm packages and external services |
| `08-deployment.md` | Vercel deployment and infrastructure |

## Mermaid Diagram Scripts

Two scripts are provided to export Mermaid diagrams from the markdown files to PNG images. This enables visual inspection of diagrams to check for overlapping text, layout issues, and overall readability.

### export-diagrams.sh

One-time export of all diagrams to PNG images.

```bash
# Run from this directory
./export-diagrams.sh

# Or specify a directory
./export-diagrams.sh /path/to/docs/architecture
```

**What it does:**
- Scans all numbered markdown files (00-*.md, 01-*.md, etc.)
- Extracts Mermaid code blocks
- Exports each diagram as a PNG to `./images/`
- Uses `@mermaid-js/mermaid-cli` via npx (auto-installed)

### watch-diagrams.sh

Continuously watches for changes and auto-exports diagrams.

```bash
# Run from this directory (keeps running)
./watch-diagrams.sh

# Or specify a directory
./watch-diagrams.sh /path/to/docs/architecture
```

**What it does:**
- Performs initial export of all diagrams
- Watches for file changes using `fswatch` (or polling fallback)
- Re-exports diagrams when markdown files are modified
- Press `Ctrl+C` to stop

**Requirements:**
- Node.js (for npx)
- Optional: `fswatch` for efficient file watching (`brew install fswatch`)

## Images Directory

The `./images/` directory contains rendered PNG images of all Mermaid diagrams:

```
images/
  00-overview-1.png
  00-overview-2.png
  01-database-schema-1.png
  ...
```

**Why images matter:**
- Visual inspection catches overlapping text that's hard to spot in code
- Easier to review diagram layout and flow
- Can be referenced in other documentation
- Useful for iterating on diagram design

## Workflow for Iterating on Diagrams

When making changes to architecture diagrams:

1. **Start the watcher** (in a separate terminal):
   ```bash
   cd docs/architecture
   ./watch-diagrams.sh
   ```

2. **Edit markdown files** - diagrams auto-export on save

3. **Review rendered images** in `./images/` to check for:
   - Overlapping text or labels
   - Arrows crossing inappropriately
   - Layout balance and readability
   - Consistent styling

4. **Iterate** until diagrams render cleanly

## Best Practices for Mermaid Diagrams

- Keep diagrams focused (15-20 nodes max)
- Use subgraphs to group related items
- Add descriptive labels on arrows
- Break large diagrams into multiple smaller ones
- Test rendering after each significant change
