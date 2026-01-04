
import { Plugin, Menu, MarkdownView } from 'obsidian';
import { renderAnsi } from './ansi';
import { ansiEditorExtension } from './editor';

export default class MyPlugin extends Plugin {
	async onload() {
		// Register the Markdown Code Block Processor.
		// Use CodeBlockProcessor to enable standard Obsidian Live Preview behavior:
		// - Inactive: Rendered Preview (State 3 - "Block Mode").
		// - Active: Editable Editor View (which our extension turns into State 2).
		this.registerMarkdownCodeBlockProcessor("ansi", (source, el, ctx) => {
			const ansiEl = renderAnsi(source);
			const container = el.createEl("pre", { cls: "ansi-block" });
			container.appendChild(ansiEl);

			// Add right-click listener to switch to edit mode
			container.addEventListener("contextmenu", (event) => {
				const menu = new Menu();

				menu.addItem((item) => {
					item
						.setTitle("✏️ Edit Code Block")
						.setIcon("pencil")
						.onClick(() => {
							// Find the position of this block
							const sectionInfo = ctx.getSectionInfo(el);
							if (sectionInfo) {
								// Logic to focus editor
								const view = this.app.workspace.getActiveViewOfType(MarkdownView);
								if (view) {
									// Move cursor to start of block + 1 line (inside content)
									// sectionInfo.lineStart is the ```ansi line.
									const visibleLine = sectionInfo.lineStart + 1;
									// Set cursor
									view.editor.setCursor({ line: visibleLine, ch: 0 });
									view.editor.focus();
								}
							}
						});
				});

				// Show the menu at mouse position
				menu.showAtPosition({ x: event.pageX, y: event.pageY });

				// Prevent default to show our custom menu
				event.preventDefault();
			});
		});

		// Register the Editor Extension for Live Preview (Editing Mode)
		this.registerEditorExtension(ansiEditorExtension);

		// Add Command to Join Lines (Smart ANSI Merge)
		this.addCommand({
			id: "join-ansi-lines",
			name: "Join lines (Smart ANSI merge)",
			editorCallback: (editor) => {
				this.joinAnsiLines(editor);
			},
		});

		// Add context menu item for the same action
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				if (editor.getSelection().length > 0) {
					menu.addItem((item) => {
						item
							.setTitle("Join ANSI lines")
							.setIcon("merge")
							.onClick(() => {
								this.joinAnsiLines(editor);
							});
					});
				}
			})
		);
	}

	joinAnsiLines(editor: any) {
		const selection = editor.getSelection();
		if (!selection) return;

		// Regex to find newlines, optionally preceded by ANSI Reset (\x1b[0m) and whitespace.
		// We replace them with empty string to merge lines.
		// Logic:
		// 1. (\x1b\[0m)? : Optional ANSI Reset code before newline
		// 2. \s* : Optional whitespace before newline (and before reset)
		// 3. [\r\n]+ : The newline(s)
		// 4. \s* : Optional whitespace after newline (indentation of next line)

		// To be safe and target the user's specific case (Word broken by newline + reset):
		// Case: "DO [0m\nWN" -> "DOWN"
		// We want to remove the [0m and the newline.

		const merged = selection.replace(/(\x1b\[0m)?\s*[\r\n]+\s*/g, "");
		editor.replaceSelection(merged);
	}

	onunload() {
	}
}
