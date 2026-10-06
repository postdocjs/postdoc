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
        // The headline is optional and only read from the opening line.
        const rule = new RegExp(`^::: (${TYPES_RE})[ \\t]*([^\\n]*)\\n([\\s\\S]*?)\\n:::`);
        const match = rule.exec(src);
        if (match) {
          const token = {
            type: 'alertContainer',
            raw: match[0],
            alertType: TYPE_ALIASES[match[1]] || match[1],
            headline: match[2].trim() || null,
            text: match[3],
            tokens: []
          };

          this.lexer.blockTokens(token.text, token.tokens);
          return token;
        }
      },

      renderer(token) {
        return renderAdmonition(token, this.parser.parse(token.tokens));
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

          this.lexer.blockTokens(token.text, token.tokens);
          return token;
        }
      },

      renderer(token) {
        return renderAdmonition(token, this.parser.parse(token.tokens));
      }
    }
  ],

  async: false
};

function renderAdmonition(token, content) {
  const headline = token.headline || DEFAULT_HEADLINES[token.alertType] || '';

  return `<div class="admonition ${token.alertType}"><p class="admonition-title">${headline}</p><div class="content">${content}</div></div>`;
}

const DEFAULT_HEADLINES = {
  info: 'Info',
  warning: 'Warning',
  success: 'Success',
  danger: 'Danger',
  note: 'Note',
  tip: 'Tip'
};
