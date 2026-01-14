#!/bin/bash

# Mermaid Diagram Exporter
#
# Scans markdown files in the current directory for Mermaid code blocks
# and exports them as PNG images to the ./images/ subdirectory.
#
# Usage:
#   ./export-diagrams.sh [directory]
#
# If no directory is specified, uses current working directory.
#
# Requirements:
#   - Node.js (npx will auto-install @mermaid-js/mermaid-cli)

set -e

# Get target directory (default to current directory)
TARGET_DIR="${1:-.}"
cd "$TARGET_DIR"
TARGET_DIR="$(pwd)"

echo ""
echo "Mermaid Diagram Exporter"
echo "========================"
echo "Scanning: $TARGET_DIR"
echo ""

# Create images directory
IMAGES_DIR="$TARGET_DIR/images"
mkdir -p "$IMAGES_DIR"

# Find all markdown files (exclude README, PROGRESS, etc.)
MD_FILES=$(find . -maxdepth 1 -name "*.md" -type f | grep -E "^./[0-9]" | sort)

if [ -z "$MD_FILES" ]; then
    echo "No numbered markdown files found."
    exit 0
fi

TOTAL=0
SUCCESS=0
FAILED=0

for MD_FILE in $MD_FILES; do
    BASENAME=$(basename "$MD_FILE" .md)
    echo "Processing: $BASENAME.md"

    # Count mermaid blocks in file
    COUNT=$(grep -c '```mermaid' "$MD_FILE" 2>/dev/null || echo "0")

    if [ "$COUNT" -eq 0 ]; then
        echo "  No mermaid diagrams found"
        continue
    fi

    echo "  Found $COUNT diagram(s)"
    TOTAL=$((TOTAL + COUNT))

    # Use mmdc to process the markdown file directly
    # It outputs diagrams as basename-1.png, basename-2.png, etc.
    OUTPUT_FILE="$IMAGES_DIR/${BASENAME}.png"

    if npx -y @mermaid-js/mermaid-cli \
        -i "$MD_FILE" \
        -o "$OUTPUT_FILE" \
        -b white \
        -t default \
        -w 1200 \
        -q 2>/dev/null; then

        # Count exported files
        EXPORTED=$(ls -1 "$IMAGES_DIR/${BASENAME}"*.png 2>/dev/null | wc -l | tr -d ' ')
        echo "  Exported $EXPORTED image(s)"
        SUCCESS=$((SUCCESS + EXPORTED))
    else
        echo "  Export failed"
        FAILED=$((FAILED + COUNT))
    fi
done

echo ""
echo "========================"
echo "Summary:"
echo "  Total diagrams: $TOTAL"
echo "  Exported: $SUCCESS"
echo "  Failed: $FAILED"
echo "  Output: $IMAGES_DIR/"
echo ""

# List exported files
if [ -d "$IMAGES_DIR" ]; then
    FILE_COUNT=$(ls -1 "$IMAGES_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ')
    if [ "$FILE_COUNT" -gt 0 ]; then
        echo "Exported files:"
        ls -1 "$IMAGES_DIR"/*.png | while read f; do
            echo "  - $(basename "$f")"
        done
    fi
fi
