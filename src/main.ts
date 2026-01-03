import { Plugin } from 'obsidian';
import { renderAnsi } from './ansi';
import { ansiEditorExtension } from './editor';

export default class MyPlugin extends Plugin {
	async onload() {
		// Register the Markdown post processor for Reading Mode
		// We use a PostProcessor instead of a CodeBlockProcessor to avoid Obsidian "swallowing" the block
		// in Live Preview (which creates the "Click to Edit" overlay).
		// By not registering a specific CodeBlockProcessor, Live Preview defaults to the Editor View (handled by our extension),
		// while Reading Mode (which runs PostProcessors) will still render the ANSI.
		this.registerMarkdownPostProcessor((element, context) => {
			const codeBlocks = element.querySelectorAll("pre > code.language-ansi");
			codeBlocks.forEach((codeBlock) => {
				const pre = codeBlock.parentElement;
				if (!pre) return;

				const text = codeBlock.textContent || "";
				const ansiEl = renderAnsi(text);

				pre.empty();
				pre.appendChild(ansiEl);
				pre.addClass("ansi-block");
			});
		});

		// Register the Editor Extension for Live Preview (Editing Mode)
		this.registerEditorExtension(ansiEditorExtension);
	}

	onunload() {
	}
}
