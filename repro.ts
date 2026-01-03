
import { renderAnsi } from './src/ansi.ts';

// Identify potential issues with specific ansi sequences provided by user.

const normal = "\x1b[0m\x1b[38;2;36;114;200m┌──(root\x1b[0m";
const user_case = "\x1b[0m\x1b[38;2;36;114;200m┌──(你好\x1b[0m"; // Contains Chinese
const k_case = "\x1b[0m\x1b[38;2;36;114;200m┌──(K-case\x1b[K"; // Contains [K
const style_case = "\x1b[4mUnderline\x1b[0m \x1b[3mItalic\x1b[0m \x1b[9mStrike\x1b[0m";

// Mock document for compilation if needed
if (typeof document === 'undefined') {
    (global as any).document = {
        createElement: (tag: string) => {
            const el = {
                style: {} as any,
                appendChild: (child: any) => { el.children.push(child); },
                children: [] as any[],
                textContent: "",
                tagName: tag.toUpperCase()
            };
            return el;
        }
    };
}

console.log("Testing User Case (Chinese):");
const elUser = renderAnsi(user_case);
function printStructure(el: any, depth = 0) {
    const indent = "  ".repeat(depth);
    if (el.textContent) {
        console.log(`${indent}Text: "${el.textContent}" Style: ${JSON.stringify(el.style)}`);
    }
    if (el.children) {
        for (const child of el.children) {
            printStructure(child, depth + 1);
        }
    }
}
printStructure(elUser);

console.log("Testing K Case:");
const elK = renderAnsi(k_case);
printStructure(elK);

console.log("Testing Style Case:");
const elStyle = renderAnsi(style_case);
printStructure(elStyle);
