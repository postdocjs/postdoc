/**
 * The colours of a panel, read from its CSS custom properties, so that a site themes
 * the editor and the terminal along with the rest of the panel from its stylesheet.
 * The defaults, in playground.css, are those of VS Code's Dark Modern theme.
 */

const COLORS = {
  background: '--pg-background',
  editor: '--pg-editor',
  border: '--pg-border',
  text: '--pg-text',
  dim: '--pg-dim',
  hover: '--pg-hover',
  selected: '--pg-selected',
  accent: '--pg-accent',
  input: '--pg-input',
  selection: '--pg-selection',
  lineNumbers: '--pg-line-numbers',
  codeFont: '--pg-code-font',
  keyword: '--pg-syntax-keyword',
  string: '--pg-syntax-string',
  number: '--pg-syntax-number',
  comment: '--pg-syntax-comment',
  function: '--pg-syntax-function',
  type: '--pg-syntax-type',
  variable: '--pg-syntax-variable',
  tag: '--pg-syntax-tag',
  attribute: '--pg-syntax-attribute'
};

export function readTheme(panel) {
  const style = getComputedStyle(panel);
  const theme = {};

  for (const [name, property] of Object.entries(COLORS)) {
    theme[name] = style.getPropertyValue(property).trim();
  }

  return theme;
}

// A colour as Monaco's theme rules want it: hex digits without the #.
const hex = (color) => color.replace('#', '');

// Monaco's theme for the panel's colours: the editor's own colours, and the colours of
// the kinds of code that its tokenizers tell apart.
export function monacoTheme(theme) {
  return {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: hex(theme.keyword) },
      { token: 'string', foreground: hex(theme.string) },
      { token: 'string.key.json', foreground: hex(theme.variable) },
      { token: 'string.value.json', foreground: hex(theme.string) },
      { token: 'string.link.md', foreground: hex(theme.function) },
      { token: 'number', foreground: hex(theme.number) },
      { token: 'comment', foreground: hex(theme.comment) },
      { token: 'type', foreground: hex(theme.type) },
      { token: 'tag', foreground: hex(theme.tag) },
      { token: 'metatag', foreground: hex(theme.tag) },
      { token: 'attribute.name', foreground: hex(theme.attribute) },
      { token: 'attribute.value', foreground: hex(theme.string) },
      { token: 'variable', foreground: hex(theme.variable) },
      { token: 'regexp', foreground: hex(theme.string) },
      { token: 'emphasis', fontStyle: 'italic' },
      { token: 'strong', fontStyle: 'bold' }
    ],
    colors: {
      'editor.background': theme.editor,
      'editor.foreground': theme.text,
      'editorLineNumber.foreground': theme.lineNumbers,
      'editorLineNumber.activeForeground': theme.text,
      'editorLineNumber.dimmedForeground': theme.lineNumbers,
      'editor.lineHighlightBorder': theme.hover,
      'editorCursor.foreground': theme.text,
      'editor.selectionBackground': theme.selection,
      'editorIndentGuide.background1': theme.border,
      'editorIndentGuide.activeBackground1': theme.dim,
      'editorWidget.background': theme.background,
      'editorWidget.border': theme.border,
      'editorSuggestWidget.selectedBackground': theme.selected,
      'focusBorder': theme.accent,
      'minimap.background': theme.editor,
      'input.background': theme.input,
      'input.foreground': theme.text,
      'input.border': theme.border,
      'list.hoverBackground': theme.hover,
      'editorHoverWidget.background': theme.background,
      'editorHoverWidget.border': theme.border,
      'editorSuggestWidget.background': theme.background,
      'editorSuggestWidget.border': theme.border,
      'editorSuggestWidget.foreground': theme.text,
      'quickInput.background': theme.background,
      'quickInput.foreground': theme.text,
      'quickInputList.focusBackground': theme.selected,
      'quickInputList.focusForeground': '#ffffff',
      'menu.background': theme.background,
      'menu.foreground': theme.text,
      'menu.selectionBackground': theme.selected,
      'menu.selectionForeground': '#ffffff',
      'menu.separatorBackground': theme.border,
      'menu.border': theme.border,
      'scrollbarSlider.background': `${theme.dim}40`,
      'scrollbarSlider.hoverBackground': `${theme.dim}66`
    }
  };
}
