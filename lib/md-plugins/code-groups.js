import crypto from 'crypto';

export const codeGroupExtension = {
  extensions: [{
    name: 'codeGroup',
    level: 'block',
    start(src) {
      return src.match(/::: code-group/)?.index;
    },

    tokenizer(src, tokens) {
      const rule = /^::: code-group\n([\s\S]*?)\n:::/;
      const match = rule.exec(src);
      if (match) {
        const token = {
          type: 'codeGroup',
          raw: match[0],
          text: match[1],
          tokens: []
        };
        this.lexer.blockTokens(token.text, token.tokens);
        return token;
      }
    },

    renderer(token) {
      let tabContent = '';
      let tabTitles = '';

      const items = token.tokens.reduce((acc, t) => {
        if (t.type === 'code') {
          acc.push(t);
        }
        return acc;
      }, []);

      const prefix = generateRandomString(5);

      items.forEach((t, i) => {
        const index = i + 1;
        const matches = t.lang.match(/\[(.*?)\]/);

        const title = matches && matches.length > 0 ? matches[1] : t.lang;
        // The first tab is shown until a theme script switches tabs.
        const isActive = index === 1;
        const activeClass = isActive ? ' active' : '';

        tabTitles += `<li class="nav-item" role="presentation">
                      <button class="nav-link${activeClass}" data-bs-toggle="tab" id="${prefix}tab${index}" data-bs-target="#${prefix}tab${index}pane" type="button" role="tab" aria-controls="${prefix}tab${index}pane" aria-selected="${isActive}">${title}</button>
                    </li>`;

        tabContent += `<div class="tab-pane${activeClass}" id="${prefix}tab${index}pane" aria-labelledby="${prefix}tab${index}" tabIndex="0" role="tabpanel">
                       ${t.text}
                     </div>`;

      });

      return `<div class="code-group">
      <ul class="nav nav-tabs" role="tablist">${tabTitles}</ul>
      <div class="tab-content">${tabContent}</div>
      </div>
    `;
    }
  }],

  async: false
};

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}
