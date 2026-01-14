#!/bin/bash

# Mermaid Diagram Watcher
#
# Watches markdown files for changes and automatically re-exports
# mermaid diagrams to PNG images.
#
# Usage:
#   ./watch-diagrams.sh [directory]
#
# Requirements:
#   - Node.js (uses npx for dependencies)
#   - fswatch (brew install fswatch) OR falls back to polling
#
# Press Ctrl+C to stop watching.

set -e

TARGET_DIR="${1:-.}"
cd "$TARGET_DIR"
TARGET_DIR="$(pwd)"
IMAGES_DIR="$TARGET_DIR/images"

echo ""
echo "Mermaid Diagram Watcher"
echo "======================="
echo "Watching: $TARGET_DIR"
echo "Output:   $IMAGES_DIR"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Create images directory if needed
mkdir -p "$IMAGES_DIR"

# Function to export a single file
export_file() {
    local MD_FILE="$1"
    local BASENAME=$(basename "$MD_FILE" .md)

    # Skip non-numbered files
    if [[ ! "$BASENAME" =~ ^[0-9] ]]; then
        return
    fi

    echo "[$(date +%H:%M:%S)] Change detected: $BASENAME.md"

    # Count diagrams
    local COUNT=$(grep -c '```mermaid' "$MD_FILE" 2>/dev/null || echo "0")

    if [ "$COUNT" -eq 0 ]; then
        echo "  No mermaid diagrams found"
        return
    fi

    # Remove old images for this file
    rm -f "$IMAGES_DIR/${BASENAME}"*.png 2>/dev/null || true

    # Export diagrams
    local OUTPUT_FILE="$IMAGES_DIR/${BASENAME}.png"

    if npx -y @mermaid-js/mermaid-cli \
        -i "$MD_FILE" \
        -o "$OUTPUT_FILE" \
        -b white \
        -t default \
        -w 1200 \
        -q 2>/dev/null; then

        local EXPORTED=$(ls -1 "$IMAGES_DIR/${BASENAME}"*.png 2>/dev/null | wc -l | tr -d ' ')
        echo "  Exported $EXPORTED image(s)"
    else
        echo "  Export failed - check mermaid syntax"
    fi
}

# Export all files initially
echo "Initial export..."
for MD_FILE in ./*.md; do
    [ -f "$MD_FILE" ] && export_file "$MD_FILE"
done
echo ""
echo "Watching for changes..."
echo ""

# Check if fswatch is available
if command -v fswatch &> /dev/null; then
    # Use fswatch (macOS/Linux)
    fswatch -0 --event Updated --include '\.md$' --exclude '.*' . | while read -d "" event; do
        export_file "$event"
    done
else
    # Fallback: use polling with find
    echo "Note: Install fswatch for better performance (brew install fswatch)"
    echo "Using polling fallback (checks every 2 seconds)..."
    echo ""

    # Store initial modification times
    declare -A MTIMES
    for f in ./*.md; do
        [ -f "$f" ] && MTIMES["$f"]=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)
    done

    while true; do
        sleep 2
        for f in ./*.md; do
            if [ -f "$f" ]; then
                NEW_MTIME=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)
                if [ "${MTIMES[$f]}" != "$NEW_MTIME" ]; then
                    MTIMES["$f"]="$NEW_MTIME"
                    export_file "$f"
                fi
            fi
        done
    done
fi
