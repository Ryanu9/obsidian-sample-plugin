
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect, Extension } from "@codemirror/state";
import { parseAnsi } from "./ansi";

// Effect to toggle raw view for a specific block
export const toggleAnsiEffect = StateEffect.define<{ from: number, to: number, isRaw: boolean }>();

// State field to track which blocks are in "raw" mode
const ansiToggleState = StateField.define<Map<number, boolean>>({
    create() {
        return new Map();
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(toggleAnsiEffect)) {
                const newValue = new Map(value);
                newValue.set(effect.value.from, effect.value.isRaw);
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
    const text = state.doc.toString();
    const visibleRanges = view.visibleRanges;

    const regex = /^```ansi\s*$/gm;
    const endRegex = /^```$/gm;

    let match;
    while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const lineEnd = start + match[0].length;

        // Find closing ```
        endRegex.lastIndex = lineEnd;
        const endMatch = endRegex.exec(text);

        let end = text.length;
        if (endMatch) {
            end = endMatch.index + endMatch[0].length;
        } else {
            continue; // improperly closed
        }

        // Check visibility optimization
        let isVisible = false;
        for (const r of visibleRanges) {
            if (start < r.to && end > r.from) {
                isVisible = true;
                break;
            }
        }
        if (!isVisible) continue;

        const isRaw = toggleState.get(start) ?? false;

        // Place widget at the end of the first line (```ansi)
        builder.add(start + match[0].length, start + match[0].length, Decoration.widget({
            widget: new ToggleWidget(isRaw, start, end),
            side: 1
        }));

        if (isRaw) {
            continue;
        }

        const contentStart = lineEnd + 1; // +1 for newline
        const contentEnd = endMatch ? endMatch.index : text.length;

        if (contentStart >= contentEnd) continue;

        const content = text.slice(contentStart, contentEnd);
        const tokens = parseAnsi(content);

        let pos = contentStart;
        for (const token of tokens) {
            const tokenEnd = pos + token.raw.length;

            if (pos >= tokenEnd) continue;

            if (token.isEscape) {
                // Hide escape sequences
                builder.add(pos, tokenEnd, Decoration.replace({}));
            } else {
                // Apply styles
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
                    builder.add(pos, tokenEnd, Decoration.mark({
                        attributes: { style: styleStr }
                    }));
                }
            }
            pos = tokenEnd;
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
        if (update.docChanged || update.viewportChanged || update.state.field(ansiToggleState) !== update.startState.field(ansiToggleState)) {
            this.decorations = ansiDecorations(update.view);
        }
    }
}, {
    decorations: v => v.decorations
});

export const ansiEditorExtension: Extension = [
    ansiToggleState,
    ansiPlugin
];
