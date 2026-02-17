
import prettier from 'prettier/standalone';
// @ts-ignore
import * as latexPlugin from 'prettier-plugin-latex';

export interface FormatOptions {
    printWidth?: number;
    tabWidth?: number;
    useTabs?: boolean;
}

/**
 * Formats LaTeX source code using Prettier.
 * This is an async operation to allow for future worker offloading.
 */
export const formatLatex = async (
    code: string,
    options: FormatOptions = {}
): Promise<string> => {
    try {
        return await prettier.format(code, {
            parser: 'latex-parser',
            plugins: [latexPlugin],
            // Enforce consistent style (Opinionated)
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
            ...options,
        });
    } catch (error) {
        console.warn('[Formatter] Failed to format code:', error);
        // Graceful fallback: return original code so the user loses nothing
        return code;
    }
};
