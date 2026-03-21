const SUPPORTED_TYPES = ['info', 'warning', 'success', 'danger', 'note', 'tip', 'abstract', 'bug', 'example', 'quote'];
const TYPES_RE = SUPPORTED_TYPES.join('|');

// Map MkDocs admonition types to CSS class names
const TYPE_ALIASES = {
  tip: 'tip',
  abstract: 'info',
  bug: 'danger',
  example: 'info',
  quote: 'note',
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
  note: 'note'
};

export const alertContainerExtension = {
  extensions: [
    // Postdoc ::: syntax
    {
      name: 'alertContainer',
      level: 'block',
      start(src) {
        return src.match(new RegExp(`^::: (${TYPES_RE})`, 'm'))?.index;
      },

      tokenizer(src) {
        const rule = new RegExp(`^::: (${TYPES_RE})\\s*(?:([^\\n]+)\\n)?([\\s\\S]*?)\\n:::`);
        const match = rule.exec(src);
        if (match) {
          const token = {
            type: 'alertContainer',
            raw: match[0],
            alertType: TYPE_ALIASES[match[1]] || match[1],
            headline: match[2],
            text: match[3],
            tokens: []
          };

          token.tokens = this.lexer.inlineTokens(token.text, []);
          return token;
        }
      },

      renderer(token) {
        const headline = token.headline ? token.headline : getDefaultHeadline(token.alertType);
        const content = token.tokens.map(t => this.parser.parseInline([t])).join('');

        return `<div class="admonition ${token.alertType}"><p class="admonition-title">${headline}</p><p class="content">${content}</p></div>`;
      }
    },
    // MkDocs !!! syntax
    {
      name: 'mkdocsAdmonition',
      level: 'block',
      start(src) {
        return src.match(new RegExp(`^!!! (${TYPES_RE})`, 'm'))?.index;
      },

      tokenizer(src) {
        const rule = new RegExp(`^!!! (${TYPES_RE})(?:\\s+"([^"]*)")?\\n((?:    [^\\n]*\\n?|\\n)*)`);
        const match = rule.exec(src);
        if (match) {
          const text = match[3].replace(/^    /gm, '').trimEnd();
          const token = {
            type: 'mkdocsAdmonition',
            raw: match[0],
            alertType: TYPE_ALIASES[match[1]] || match[1],
            headline: match[2] || null,
            text,
            tokens: []
          };

          token.tokens = this.lexer.inlineTokens(token.text, []);
          return token;
        }
      },

      renderer(token) {
        const headline = token.headline ? token.headline : getDefaultHeadline(token.alertType);
        const content = token.tokens.map(t => this.parser.parseInline([t])).join('');

        return `<div class="admonition ${token.alertType}"><p class="admonition-title">${headline}</p><p class="content">${content}</p></div>`;
      }
    }
  ],

  async: false
};

function getDefaultHeadline(type) {
  switch (type) {
    case 'info':
      return '<strong>Info:</strong><br/>';

    case 'warning':
      return '<strong>Warning:</strong><br/>';

    case 'success':
      return '<strong>Success:</strong><br/>';

    case 'danger':
      return '<strong>Danger:</strong><br/>';

    case 'note':
      return '<strong>Note:</strong><br/>';

    case 'tip':
      return '<strong>Tip:</strong><br/>';

    default:
      return '';
  }
}
