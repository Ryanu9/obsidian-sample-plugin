
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect, Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { parseAnsi, stripAnsi } from "./ansi";

// Effect to toggle raw view for a specific block
export const toggleAnsiEffect = StateEffect.define<{ from: number, to: number, isRaw: boolean }>();

// State field to track which blocks are in "raw" mode
// Map<from, { isRaw, to }>
interface BlockState {
    isRaw: boolean;
    to: number;
}

const ansiToggleState = StateField.define<Map<number, BlockState>>({
    create() {
        return new Map();
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(toggleAnsiEffect)) {
                const newValue = new Map(value);
                newValue.set(effect.value.from, { isRaw: effect.value.isRaw, to: effect.value.to });
                return newValue;
            }
        }
        return value;
    }
});

class ToggleWidget extends WidgetType {
    constructor(private isRaw: boolean, private from: number, private to: number) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "ansi-toggle-button";
        // User request:
        // Edit Status (Highlight visible) -> Button should allow switching to Raw Source
        // Preview Status (Source visible) -> Button should allow switching to Highlight
        // My Logic:
        // isRaw = true (Source visible). Button: "Preview" (Switch to Highlight)
        // isRaw = false (Highlight visible). Button: "Edit" (Switch to Source)
        // This seems to align with standard UI patterns, but user phrased:
        // "Edit state shows ANSI highlight"
        // If "Edit state" means "When I am editing text", they want highlight.
        // That is the default (isRaw=false).

        span.textContent = this.isRaw ? "👁️ Preview" : "✏️ Edit";
        span.title = this.isRaw ? "Switch to Preview Mode" : "Switch to Edit Mode (Show ANSI codes)";
        span.style.cursor = "pointer";
        span.style.userSelect = "none";
        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch({
                effects: toggleAnsiEffect.of({ from: this.from, to: this.to, isRaw: !this.isRaw })
            });
        };
        return span;
    }

    eq(other: ToggleWidget) {
        return other.isRaw === this.isRaw && other.from === this.from && other.to === this.to;
    }
}

function ansiDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const { state } = view;
    const toggleState = state.field(ansiToggleState);
    const visibleRanges = view.visibleRanges;
    const tree = syntaxTree(state);

    const processedBlocks = new Set<number>();

    for (const { from, to } of visibleRanges) {
        let pos = from;
        while (pos < to) {
            const line = state.doc.lineAt(pos);
            const node = tree.resolve(line.from, 1);

            // Check if this line is part of a code block
            const isCode = node.name.includes("Code") || node.name.includes("code");

            if (isCode) {
                // Try to locate the start of the block
                let blockStart = line.from;
                let blockEnd = line.to;
                let foundStart = false;

                // Strategy 1: Tree Parent (FencedCode)
                if (node.name === "FencedCode") {
                    blockStart = node.from;
                    blockEnd = node.to;
                    foundStart = true;
                } else if (node.parent && node.parent.name === "FencedCode") {
                    blockStart = node.parent.from;
                    blockEnd = node.parent.to;
                    foundStart = true;
                }

                // Strategy 2: Scan Backwards (if standard tree node failed or is line-based)
                if (!foundStart || state.doc.lineAt(blockStart).number >= line.number) {
                    // If we didn't find a distinct parent, or result is just the current line
                    // We verify if current line is the start
                    const text = line.text;
                    if (/^```ansi\s*$/.test(text) || /^```ansi\s+/.test(text)) {
                        blockStart = line.from;
                        foundStart = true;
                    } else {
                        // Scan backwards
                        let curLine = line;
                        // Limit scan depth to avoid hanging
                        let linesBack = 0;
                        while (curLine.number > 1 && linesBack < 500) {
                            const prevLine = state.doc.line(curLine.number - 1);
                            const text = prevLine.text;
                            // Heuristic: If we hit another fence ``` without ansi, we might have crossed out?
                            // Standard markdown does not allow nested blocks.
                            if (/^```ansi\s*$/.test(text) || /^```ansi\s+/.test(text)) {
                                blockStart = prevLine.from;
                                foundStart = true;
                                break;
                            }
                            if (/^```/.test(text) && !text.includes("ansi")) {
                                // Likely start/end of another block.
                                // Stop.
                                break;
                            }
                            curLine = prevLine;
                            linesBack++;
                        }
                    }
                }

                if (foundStart && !processedBlocks.has(blockStart)) {
                    processedBlocks.add(blockStart);

                    // Now find End
                    // If we found via FencedCode, blockEnd is already correct.
                    // But if we scanned manually, we need to scan forward.
                    let foundEnd = false;
                    // Check if blockEnd is already set correctly?
                    // If foundStart via tree, blockEnd via tree is likely correct.

                    if (foundEnd) {
                        // good
                    } else {
                        // Scan forward
                        const startLineText = state.doc.lineAt(blockStart).text;
                        if (state.doc.sliceString(blockEnd - 3, blockEnd) !== "```") {
                            // Scan
                            let curLineFwd = state.doc.lineAt(blockStart);
                            let linesFwd = 0;
                            while (curLineFwd.number < state.doc.lines && linesFwd < 2000) {
                                try {
                                    curLineFwd = state.doc.line(curLineFwd.number + 1);
                                } catch (e) { break; }

                                if (/^```\s*$/.test(curLineFwd.text)) {
                                    blockEnd = curLineFwd.to;
                                    foundEnd = true;
                                    break;
                                }
                                linesFwd++;
                            }
                            if (!foundEnd) {
                                blockEnd = state.doc.length; // Limit to end of doc
                            }
                        }
                    }

                    const start = blockStart;
                    const end = blockEnd;

                    // Verify "ansi" again just in case
                    const startLineText = state.doc.lineAt(start).text;
                    if (!startLineText.trim().startsWith("```ansi")) {
                        pos = line.to + 1;
                        continue;
                    }

                    const blockState = toggleState.get(start);
                    const isRaw = blockState ? blockState.isRaw : false;

                    // Add Widget
                    builder.add(start + startLineText.length, start + startLineText.length, Decoration.widget({
                        widget: new ToggleWidget(isRaw, start, end),
                        side: 1
                    }));

                    if (!isRaw) {
                        // Decoration Logic
                        const contentStart = start + startLineText.length + 1;
                        const contentEnd = end - 3;

                        if (contentStart < contentEnd) {
                            const content = state.sliceDoc(contentStart, contentEnd);
                            const tokens = parseAnsi(content);

                            let p = contentStart;

                            for (const token of tokens) {
                                const tStart = p;
                                const tEnd = p + token.raw.length;

                                // Visibility Optimization:
                                // Only add decorations if they intersect with *some* visible range.
                                // We are outer loop over visibleRanges.
                                // But we process the whole block once.
                                // We can just check intersection with `from, to` inside the builder logic (automatic?)
                                // No, builder adds blindly.
                                // We should check against `visibleRanges` for optimal performance.

                                let intersects = false;
                                {
                                    // Quick check against current loop range first
                                    if (tStart < to && tEnd > from) intersects = true;
                                    else {
                                        // Check others
                                        for (const r of visibleRanges) {
                                            if (tStart < r.to && tEnd > r.from) { intersects = true; break; }
                                        }
                                    }
                                }

                                if (intersects) {
                                    if (token.isEscape) {
                                        builder.add(tStart, tEnd, Decoration.replace({}));
                                    } else {
                                        const styles: any = {};
                                        if (token.style.color) styles.color = token.style.color;
                                        if (token.style.backgroundColor) styles["background-color"] = token.style.backgroundColor;
                                        if (token.style.bold) styles["font-weight"] = "bold";
                                        if (token.style.italic) styles["font-style"] = "italic";

                                        let decor = [];
                                        if (token.style.underline) decor.push("underline");
                                        if (token.style.strikethrough) decor.push("line-through");
                                        if (decor.length > 0) styles["text-decoration"] = decor.join(" ");

                                        if (Object.keys(styles).length > 0) {
                                            const styleStr = Object.entries(styles).map(([k, v]) => `${k}: ${v}`).join("; ");
                                            builder.add(tStart, tEnd, Decoration.mark({
                                                attributes: { style: styleStr }
                                            }));
                                        }
                                    }
                                }
                                p = tEnd;
                            }
                        }
                    }
                    // Skip loop to end of block
                    // Ensure we loop text pos correctly
                    pos = blockEnd; // continue outer loop
                } else {
                    // Already processed or invalid, skip line
                    pos = line.to + 1;
                }
            } else {
                pos = line.to + 1;
            }
        }
    }

    return builder.finish();
}

export const ansiPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = ansiDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.state.field(ansiToggleState) !== update.startState.field(ansiToggleState)) {
            this.decorations = ansiDecorations(update.view);

            // Check for auto-reset on selection change
            if (update.selectionSet) {
                const state = update.view.state;
                const toggleMap = state.field(ansiToggleState);
                const selection = state.selection;

                // Find blocks that are RAW but do not intersect with ANY selection range
                const effects: StateEffect<any>[] = [];

                for (const [start, blockState] of toggleMap.entries()) {
                    if (blockState.isRaw) {
                        let intersects = false;
                        for (const range of selection.ranges) {
                            if (range.from <= blockState.to && range.to >= start) {
                                intersects = true;
                                break;
                            }
                        }

                        if (!intersects) {
                            // Cursor left the block -> Reset to Preview (isRaw = false)
                            effects.push(toggleAnsiEffect.of({ from: start, to: blockState.to, isRaw: false }));
                        }
                    }
                }

                if (effects.length > 0) {
                    // Dispatch effects in a separate microtask or immediately?
                    // We are inside update(). Dispatching within update might cause loops / warnings.
                    // But State update inside ViewPlugin update is usually frowned upon if it triggers re-layout.
                    // However, we are changing a Field, which will trigger another update.
                    // CodeMirror warns about this.
                    // Better to schedule it.
                    setTimeout(() => {
                        update.view.dispatch({ effects });
                    }, 0);
                }
            }
        }
    }
}, {
    decorations: v => v.decorations,
    eventHandlers: {
        copy(event, view) {
            const state = view.state;
            const text = state.doc.toString();
            const ranges = state.selection.ranges;
            const toggleState = state.field(ansiToggleState);
            const selectedTextParts: string[] = [];

            // Identify all ANSI blocks first (simplistic scan)
            // Note: For huge docs this regex scan might be heavy on every copy.
            // But usually copy happens on user interaction which is infrequent.
            const blocks: { start: number, end: number, isRaw: boolean }[] = [];
            const regex = /^```ansi\s*$/gm;
            const endRegex = /^```$/gm;
            let match;
            while ((match = regex.exec(text)) !== null) {
                const start = match.index;
                const lineEnd = start + match[0].length;
                endRegex.lastIndex = lineEnd;
                const endMatch = endRegex.exec(text);
                if (endMatch) {
                    const end = endMatch.index + endMatch[0].length;
                    const blockState = toggleState.get(start);
                    const isRaw = blockState ? blockState.isRaw : false;
                    blocks.push({ start, end, isRaw });
                    // Optimization: move regex index?
                    regex.lastIndex = end;
                }
            }

            for (const range of ranges) {
                if (range.empty) continue;
                let currentPos = range.from;
                const rangeEnd = range.to;
                let chunk = "";

                while (currentPos < rangeEnd) {
                    // Find first block that starts after currentPos OR contains currentPos
                    // We only care about blocks that intersect [currentPos, rangeEnd]

                    const intersectingBlock = blocks.find(b =>
                        (b.start <= currentPos && b.end > currentPos) || // contains current
                        (b.start > currentPos && b.start < rangeEnd)     // starts inside
                    );

                    if (!intersectingBlock) {
                        // No more blocks in this range. Copy rest.
                        chunk += text.slice(currentPos, rangeEnd);
                        currentPos = rangeEnd;
                    } else {
                        // If there is gap before block
                        if (intersectingBlock.start > currentPos) {
                            chunk += text.slice(currentPos, intersectingBlock.start);
                            currentPos = intersectingBlock.start;
                        }

                        // Process block intersection
                        const blockEndInSelection = Math.min(intersectingBlock.end, rangeEnd);

                        const rawSegment = text.slice(currentPos, blockEndInSelection);

                        if (!intersectingBlock.isRaw) {
                            chunk += stripAnsi(rawSegment).split(/\r?\n/).map(line => line.trimEnd()).join("\n");
                        } else {
                            chunk += rawSegment;
                        }

                        currentPos = blockEndInSelection;
                    }
                }
                selectedTextParts.push(chunk);
            }

            const finalText = selectedTextParts.join(state.selection.main.empty ? "" : "\n");

            if (event.clipboardData) {
                event.clipboardData.setData('text/plain', finalText);
                event.preventDefault();
            }
        },
        paste(event, view) {
            const originalText = event.clipboardData?.getData("text/plain");
            if (!originalText || !originalText.includes("\x1b[")) return;

            // Regex to detect trailing spaces (Padding) before optional ANSI codes
            const paddingRegex = /[ \t]+((?:\x1b\[[0-9;]*[mK])*)$/;

            const lines = originalText.split(/\r?\n/);
            const processedLines = lines.map(line => {
                // Trim trailing spaces but keep ansi codes
                return line.replace(paddingRegex, "$1");
            });

            const finalText = processedLines.join("\n");

            if (finalText !== originalText) {
                event.preventDefault();
                view.dispatch(view.state.replaceSelection(finalText));
            }
        }
    }
});

export const ansiEditorExtension: Extension = [
    ansiToggleState,
    ansiPlugin
];
