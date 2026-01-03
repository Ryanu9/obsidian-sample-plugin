import { Plugin } from 'obsidian';
import { renderAnsi } from './ansi';
import { ansiEditorExtension } from './editor';

export default class MyPlugin extends Plugin {
	async onload() {
		// Register the Markdown post processor for Reading Mode
		this.registerMarkdownCodeBlockProcessor("ansi", (source, el, ctx) => {
			const ansiEl = renderAnsi(source);
			const container = el.createEl("pre", { cls: "ansi-block" });
			container.appendChild(ansiEl);
		});

		// Register the Editor Extension for Live Preview (Editing Mode)
		this.registerEditorExtension(ansiEditorExtension);
	}

	onunload() {
	}
}
