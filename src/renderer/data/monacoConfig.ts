/**
 * Monaco Editor language and theme configuration for LaTeX/BibTeX.
 * Extracted from EditorPane.tsx to reduce component size.
 */

type MonacoInstance = typeof import('monaco-editor')

/** Register LaTeX and BibTeX languages with Monarch tokenizers and define custom themes. */
export function configureMonacoLanguages(monaco: MonacoInstance): void {
  // Register LaTeX language with Monarch tokenizer for syntax highlighting
  monaco.languages.register({ id: 'latex' })
  monaco.languages.setMonarchTokensProvider('latex', {
    defaultToken: '',
    tokenPostfix: '.latex',

    brackets: [
      { open: '{', close: '}', token: 'delimiter.curly' },
      { open: '[', close: ']', token: 'delimiter.square' },
      { open: '(', close: ')', token: 'delimiter.parenthesis' }
    ],

    tokenizer: {
      root: [
        // Comments
        [/%.*$/, 'comment'],

        // Begin/end environments
        [
          /(\\(?:begin|end))(\{)([^}]*)(\})/,
          ['keyword', 'delimiter.curly', 'variable', 'delimiter.curly']
        ],

        // Section commands
        [/\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\b\*?/, 'keyword'],

        // Common keyword commands
        [
          /\\(?:documentclass|usepackage|input|include|bibliography|bibliographystyle|newcommand|renewcommand|newenvironment|renewenvironment|def|let|newtheorem|theoremstyle|makeatletter|makeatother|maketitle|tableofcontents|listoffigures|listoftables)\b\*?/,
          'keyword'
        ],

        // Formatting commands
        [
          /\\(?:textbf|textit|texttt|textsc|textrm|textsf|textup|textmd|emph|underline|sout|textsubscript|textsuperscript|footnote|endnote|caption|label|ref|eqref|cite|citep|citet|citeauthor|citeyear|nocite|pageref|autoref|nameref|href|url)\b\*?/,
          'keyword'
        ],

        // Math environment commands
        [/\\(?:left|right|big|Big|bigg|Bigg)\b/, 'keyword.math'],

        // Control sequences (general commands)
        [/\\[a-zA-Z@]+\*?/, 'tag'],

        // Control symbols (single char after backslash)
        [/\\[^a-zA-Z]/, 'tag'],

        // Inline math $...$
        [/\$\$/, { token: 'string.math', next: '@displaymath' }],
        [/\$/, { token: 'string.math', next: '@inlinemath' }],

        // Braces and brackets
        [/[{}]/, 'delimiter.curly'],
        [/\[/, 'delimiter.square'],
        [/\]/, 'delimiter.square'],

        // Special characters
        [/[&~#^_]/, 'keyword'],

        // Numbers
        [/\d+(\.\d+)?/, 'number']
      ],

      inlinemath: [
        [/[^\\$]+/, 'string.math'],
        [/\\[a-zA-Z@]+\*?/, 'string.math'],
        [/\\[^a-zA-Z]/, 'string.math'],
        [/\$/, { token: 'string.math', next: '@pop' }]
      ],

      displaymath: [
        [/[^\\$]+/, 'string.math'],
        [/\\[a-zA-Z@]+\*?/, 'string.math'],
        [/\\[^a-zA-Z]/, 'string.math'],
        [/\$\$/, { token: 'string.math', next: '@pop' }]
      ]
    }
  })

  // Also register bibtex language
  monaco.languages.register({ id: 'bibtex' })
  monaco.languages.setMonarchTokensProvider('bibtex', {
    defaultToken: '',
    tokenPostfix: '.bibtex',

    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [/@[a-zA-Z]+/, 'keyword'],
        [/[{}]/, 'delimiter.curly'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'string'],
        [/\{[^}]*\}/, 'string'],
        [/,/, 'delimiter'],
        [/\d+/, 'number']
      ]
    }
  })

  // Set LaTeX language configuration (comment toggling, brackets, etc.)
  monaco.languages.setLanguageConfiguration('latex', {
    comments: {
      lineComment: '%'
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' }
    ]
  })

  monaco.editor.defineTheme('ivory-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '3b3530', background: 'faf6f0' },
      { token: 'comment', foreground: '8a7e6e', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7a4a2a' },
      { token: 'keyword.math', foreground: '7a4a2a' },
      { token: 'tag', foreground: '2a6a7a' },
      { token: 'variable', foreground: '6a3a7a' },
      { token: 'string', foreground: '5a7a3a' },
      { token: 'string.math', foreground: '5a7a3a' },
      { token: 'number', foreground: '6a5a8a' },
      { token: 'delimiter', foreground: '6b6158' },
      { token: 'delimiter.curly', foreground: '6b6158' },
      { token: 'delimiter.square', foreground: '6b6158' }
    ],
    colors: {
      'editor.background': '#faf6f0',
      'editor.foreground': '#3b3530',
      'editor.lineHighlightBackground': '#f3ece2',
      'editor.selectionBackground': '#ddd5c8',
      'editor.inactiveSelectionBackground': '#eae3d8',
      'editorCursor.foreground': '#7a6240',
      'editorLineNumber.foreground': '#b0a698',
      'editorLineNumber.activeForeground': '#7a6240',
      'editorIndentGuide.background': '#e5ddd2',
      'editorWidget.background': '#f3ece2',
      'editorWidget.border': '#ddd5c8',
      'editorSuggestWidget.background': '#f3ece2',
      'editorSuggestWidget.border': '#ddd5c8',
      'editorSuggestWidget.selectedBackground': '#ddd5c8',
      'input.background': '#fdf9f4',
      'input.border': '#ddd5c8',
      'scrollbarSlider.background': '#c8bfb260',
      'scrollbarSlider.hoverBackground': '#b0a698',
      'scrollbarSlider.activeBackground': '#9a8e82'
    }
  })
}

/** Map the app theme setting to the corresponding Monaco theme name. */
export function getMonacoTheme(theme: string): string {
  switch (theme) {
    case 'light':
    case 'glass':
      return 'ivory-light'
    case 'high-contrast':
      return 'hc-black'
    default:
      return 'vs-dark'
  }
}
