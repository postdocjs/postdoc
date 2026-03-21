export const mermaidExtension = {
  extensions: [{
    name: 'mermaid',
    level: 'block',
    start(src) {
      return src.match(/^```mermaid/m)?.index;
    },

    tokenizer(src) {
      const rule = /^```mermaid\n([\s\S]*?)```/;
      const match = rule.exec(src);
      if (match) {
        return {
          type: 'mermaid',
          raw: match[0],
          text: match[1].trim()
        };
      }
    },

    renderer(token) {
      return `<pre class="mermaid">${token.text}</pre>`;
    }
  }],

  async: false
};
