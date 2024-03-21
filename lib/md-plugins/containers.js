export const alertContainerExtension = {
  extensions: [{
    name: 'alertContainer',
    level: 'block',
    start(src) {
      return src.match(/::: (info|warning|success|danger|note)/)?.index;
    },

    tokenizer(src, tokens) {
      const rule = /^::: (info|warning|success|danger|note)\s*(?:([^\n]+)\n)?([\s\S]*?)\n:::/;
      const match = rule.exec(src);
      if (match) {
        const token = {
          type: 'alertContainer',
          raw: match[0],
          alertType: match[1],
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
  }],

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

    default:
      return '';
  }
}
