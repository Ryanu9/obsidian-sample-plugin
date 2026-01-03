
export interface AnsiToken {
    text: string;
    style: {
        color: string;
        backgroundColor: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        strikethrough: boolean;
    };
    isEscape: boolean;
    raw: string; // The raw escape sequence if it is one, or the text
}

export const palette: { [key: number]: string } = {
    30: "#000000", 31: "#cd3131", 32: "#0dbc79", 33: "#e5e510",
    34: "#2472c8", 35: "#bc3fbc", 36: "#11a8cd", 37: "#e5e5e5",
    90: "#666666", 91: "#f14c4c", 92: "#23d18b", 93: "#f5f543",
    94: "#3b8eea", 95: "#d670d6", 96: "#29b8db", 97: "#e5e5e5",
};

export const bgPalette: { [key: number]: string } = {
    40: "#000000", 41: "#cd3131", 42: "#0dbc79", 43: "#e5e510",
    44: "#2472c8", 45: "#bc3fbc", 46: "#11a8cd", 47: "#e5e5e5",
    100: "#666666", 101: "#f14c4c", 102: "#23d18b", 103: "#f5f543",
    104: "#3b8eea", 105: "#d670d6", 106: "#29b8db", 107: "#e5e5e5",
};

export function parseAnsi(text: string): AnsiToken[] {
    const parts = text.split(/(\x1b\[[0-9;]*[mK])/g);
    const tokens: AnsiToken[] = [];

    let currentStyle = {
        color: "",
        backgroundColor: "",
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
    };

    for (const part of parts) {
        if (!part) continue;

        if (part.startsWith("\x1b[")) {
            // Process ANSI code
            const content = part.slice(2);
            const suffix = content.slice(-1);
            const args = content.slice(0, -1);

            if (suffix === 'm') {
                const codes = args.split(";").map(c => parseInt(c, 10) || 0);
                for (let i = 0; i < codes.length; i++) {
                    const code = codes[i];
                    if (code === undefined) continue;

                    if (code === 0) {
                        currentStyle = {
                            color: "", backgroundColor: "",
                            bold: false, italic: false, underline: false, strikethrough: false
                        };
                    } else if (code === 1) {
                        currentStyle.bold = true;
                    } else if (code === 3) {
                        currentStyle.italic = true;
                    } else if (code === 4) {
                        currentStyle.underline = true;
                    } else if (code === 9) {
                        currentStyle.strikethrough = true;
                    } else if (code === 22) {
                        currentStyle.bold = false;
                    } else if (code === 23) {
                        currentStyle.italic = false;
                    } else if (code === 24) {
                        currentStyle.underline = false;
                    } else if (code === 29) {
                        currentStyle.strikethrough = false;
                    } else if (code >= 30 && code <= 37) {
                        if (currentStyle.bold && palette[code + 60]) {
                            currentStyle.color = palette[code + 60] || "";
                        } else {
                            currentStyle.color = palette[code] || "";
                        }
                    } else if (code >= 90 && code <= 97) {
                        currentStyle.color = palette[code] || "";
                    } else if (code === 38) {
                        // Advanced FG
                        const type = codes[i + 1];
                        if (type === 2) {
                            const r = codes[i + 2];
                            const g = codes[i + 3];
                            const b = codes[i + 4];
                            if (r !== undefined && g !== undefined && b !== undefined) {
                                currentStyle.color = `rgb(${r}, ${g}, ${b})`;
                            }
                            i += 4;
                        } else if (type === 5) {
                            i += 2;
                        }
                    } else if (code === 39) {
                        currentStyle.color = "";
                    } else if (code >= 40 && code <= 47) {
                        currentStyle.backgroundColor = bgPalette[code] || "";
                    } else if (code >= 100 && code <= 107) {
                        currentStyle.backgroundColor = bgPalette[code] || "";
                    } else if (code === 48) {
                        // Advanced BG
                        const type = codes[i + 1];
                        if (type === 2) {
                            const r = codes[i + 2];
                            const g = codes[i + 3];
                            const b = codes[i + 4];
                            if (r !== undefined && g !== undefined && b !== undefined) {
                                currentStyle.backgroundColor = `rgb(${r}, ${g}, ${b})`;
                            }
                            i += 4;
                        } else if (type === 5) {
                            i += 2;
                        }
                    } else if (code === 49) {
                        currentStyle.backgroundColor = "";
                    }
                }
            }
            tokens.push({ text: part, isEscape: true, style: { ...currentStyle }, raw: part });
        } else {
            tokens.push({ text: part, isEscape: false, style: { ...currentStyle }, raw: part });
        }
    }
    return tokens;
}

export function renderAnsi(text: string): HTMLElement {
    const span = document.createElement("span");
    const tokens = parseAnsi(text);

    for (const token of tokens) {
        if (token.isEscape) continue; // Skip raw codes in rendered output
        const spanPart = document.createElement("span");
        spanPart.textContent = token.text;
        if (token.style.color) spanPart.style.color = token.style.color;
        if (token.style.backgroundColor) spanPart.style.backgroundColor = token.style.backgroundColor;
        if (token.style.bold) spanPart.style.fontWeight = "bold";
        if (token.style.italic) spanPart.style.fontStyle = "italic";

        let decor = [];
        if (token.style.underline) decor.push("underline");
        if (token.style.strikethrough) decor.push("line-through");
        if (decor.length > 0) spanPart.style.textDecoration = decor.join(" ");

        span.appendChild(spanPart);
    }
    return span;
}
