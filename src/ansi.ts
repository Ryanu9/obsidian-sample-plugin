
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

// Color manipulation utilities
function parseColor(color: string): { r: number, g: number, b: number } | null {
    if (!color) return null;
    color = color.trim();
    if (color.startsWith("#")) {
        const hex = color.substring(1);
        if (hex.length === 3) {
            const r = hex[0];
            const g = hex[1];
            const b = hex[2];
            if (r && g && b) {
                return {
                    r: parseInt(r + r, 16),
                    g: parseInt(g + g, 16),
                    b: parseInt(b + b, 16)
                };
            }
        }
        if (hex.length === 6) {
            return {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16)
            };
        }
    } else if (color.startsWith("rgb")) {
        const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (match && match[1] && match[2] && match[3]) {
            return {
                r: parseInt(match[1], 10),
                g: parseInt(match[2], 10),
                b: parseInt(match[3], 10)
            };
        }
    }
    return null;
}

// VS Code-style Contrast Correction Implementation
// Ref: https://github.com/microsoft/vscode/blob/main/src/vs/base/common/color.ts (Simplified)

function getRelativeLuminance(r: number, g: number, b: number): number {
    // Current VS Code implementation uses sRGB -> Linear RGB -> Luminance
    const R = (r / 255) <= 0.03928 ? r / 255 / 12.92 : Math.pow(((r / 255) + 0.055) / 1.055, 2.4);
    const G = (g / 255) <= 0.03928 ? g / 255 / 12.92 : Math.pow(((g / 255) + 0.055) / 1.055, 2.4);
    const B = (b / 255) <= 0.03928 ? b / 255 / 12.92 : Math.pow(((b / 255) + 0.055) / 1.055, 2.4);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getContrastRatio(lum1: number, lum2: number): number {
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
}

// HSL conversion Utilities
function rgbToHsl(r: number, g: number, b: number): { h: number, s: number, l: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number, g: number, b: number } {
    let r, g, b;
    h /= 360;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function adjustColorForContrast(fgColor: string, bgColor: string, minContrast = 4.5): string {
    const fg = parseColor(fgColor);
    const bg = parseColor(bgColor);

    // Fallback if parsing fails
    if (!fg) return fgColor;
    const bgRgb = bg || { r: 31, g: 31, b: 31 }; // Use user-defined default BG if parsing fails

    const fgLum = getRelativeLuminance(fg.r, fg.g, fg.b);
    const bgLum = getRelativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
    const currentContrast = getContrastRatio(fgLum, bgLum);

    if (currentContrast >= minContrast) {
        return fgColor;
    }

    // Convert to HSL to adjust Luminance (Lightness)
    const hsl = rgbToHsl(fg.r, fg.g, fg.b);
    let { h, s, l } = hsl;

    // Determine if we need to lighten or darken
    // If background is dark (Low Lum), we need to LIGHTEN the text.
    // If background is light (High Lum), we need to DARKEN the text.
    const isDarkBg = bgLum < 0.5;

    // Loop to find valid Lightness
    // VS Code uses a more sophisticated binary search or incremental approach
    // We will use a simple incremental approach for clarity and stability

    const step = 0.05; // 5% increment

    // Limit max iterations
    let found = false;
    let bestRgb = fg;
    let maxContrast = currentContrast;

    // Try adjusting lightness in the required direction
    // Range of L is 0 to 1

    if (isDarkBg) {
        // Dark BG -> Increase L
        for (let newL = l + step; newL <= 1.0; newL += step) {
            const newRgb = hslToRgb(h, s, newL);
            const newLum = getRelativeLuminance(newRgb.r, newRgb.g, newRgb.b);
            const contrast = getContrastRatio(newLum, bgLum);
            if (contrast >= minContrast) {
                bestRgb = newRgb;
                found = true;
                break;
            }
            if (contrast > maxContrast) {
                maxContrast = contrast;
                bestRgb = newRgb;
            }
        }
    } else {
        // Light BG -> Decrease L
        for (let newL = l - step; newL >= 0.0; newL -= step) {
            const newRgb = hslToRgb(h, s, newL);
            const newLum = getRelativeLuminance(newRgb.r, newRgb.g, newRgb.b);
            const contrast = getContrastRatio(newLum, bgLum);
            if (contrast >= minContrast) {
                bestRgb = newRgb;
                found = true;
                break;
            }
            if (contrast > maxContrast) {
                maxContrast = contrast;
                bestRgb = newRgb;
            }
        }
    }

    // If we didn't strictly meet 4.5, bestRgb holds the best attempt.
    return `rgb(${bestRgb.r}, ${bestRgb.g}, ${bestRgb.b})`;
}

const DEFAULT_BG_COLOR = "rgb(31, 31, 31)";
const DEFAULT_FG_COLOR = "rgb(204, 204, 204)";

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
            // Store raw escape without logic modification (though for rendering we use tokens)
            // But we don't display escape tokens, so style doesn't matter there.
            tokens.push({ text: part, isEscape: true, style: { ...currentStyle }, raw: part });
        } else {
            // Content token
            // Apply Auto-Contrast here
            const effectiveBg = currentStyle.backgroundColor || DEFAULT_BG_COLOR;
            const effectiveFg = currentStyle.color || DEFAULT_FG_COLOR;

            const adjustedFg = adjustColorForContrast(effectiveFg, effectiveBg, 4.5);

            tokens.push({
                text: part,
                isEscape: false,
                style: {
                    ...currentStyle,
                    color: adjustedFg // Override with adjusted color for render
                },
                raw: part
            });
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

export function stripAnsi(text: string): string {
    return parseAnsi(text)
        .filter(t => !t.isEscape)
        .map(t => t.text)
        .join("");
}
