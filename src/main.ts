
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
	}

	onunload() {
	}
}
