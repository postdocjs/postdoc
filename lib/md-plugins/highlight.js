import { codeToHtml } from 'shiki';

const LIGHT_THEME_RE = /light-theme\s*=\s*(\S+)/;
const DARK_THEME_RE = /dark-theme\s*=\s*(\S+)/;

export async function createHighlightPlugin(configuration) {

  const options = configuration.markdown.syntaxHighlight || {};

  const highlight = async function(code, lang, title) {
    // For code blocks the first line may be a comment that
    // contains light and dark theme names. We are going to parse that
    // line and discard it, since its purpose is solely to tune
    // the shiki highlighter.
    const lines = code.split('\n');

    const firstContentfulLine = lines.find((line) => line.length)?.trim();
    const firstContentfulLineIndex = lines.findIndex((line) => line.length);


    let lightTheme = options?.theme?.light ?? 'github-light-high-contrast';
    let darkTheme = options?.theme?.dark ?? 'github-dark-high-contrast';
    let shouldSkipShikiSettingsComment = false;

    if (firstContentfulLine?.startsWith('//')) {
      const lightThemeMatch = LIGHT_THEME_RE.exec(firstContentfulLine);
      const darkThemeMatch = DARK_THEME_RE.exec(firstContentfulLine);

      if (lightThemeMatch) {
        lightTheme = lightThemeMatch[1];
        shouldSkipShikiSettingsComment = true;
      }

      if (darkThemeMatch) {
        darkTheme = darkThemeMatch[1];
        shouldSkipShikiSettingsComment = true;
      }
    }

    if (shouldSkipShikiSettingsComment) {
      lines.splice(firstContentfulLineIndex, 1);
    }

    const finalCode = lines.join('\n');

    const rawCode = await codeToHtml(finalCode, {
      lang,
      themes: {
        light: lightTheme,
        dark: darkTheme
      }
    });

    // A file name, ```js [postdoc.config.js], comes before the copy button, which the
    // client expects to be followed by the language and the code.
    const titleElement = title ? `<span class="code-title">${escape(title, true)}</span>` : '';

    return `<div class="language-${lang}">${titleElement}<button title="Copy Code" class="copy"></button><span class="lang">${lang}</span>${rawCode}</div>`;
  };

  return {
    async walkTokens(token) {
      if (token.type !== 'code') {
        return;
      }

      const lang = getLang(token.lang);
      const code = await highlight(token.text, lang, getTitle(token.lang));

      return updateToken(token)(code);
    },

    renderer: {
      code({ text: code, lang: infoString, escaped }) {
        const lang = getLang(infoString);
        const classAttr = lang
          ? ` ${escape(lang)}`
          : '';
        code = code.replace(/\n$/, '');
        code = code.replace(/^<div class="code-block">/, `<div class="code-block${classAttr}">`);

        return `${escaped ? code : escape(code, true)}\n`;
      }
    }
  };
}

function getLang(lang) {
  return (lang || '').match(/\S*/)[0];
}

// The name in square brackets after the language: the file name of a block, or the tab
// name of a block in a code group.
function getTitle(infoString) {
  return (infoString || '').match(/\[(.+?)\]/)?.[1] ?? null;
}

function updateToken(token) {
  return (code) => {
    if (typeof code === 'string' && code !== token.text) {
      token.escaped = true;
      token.text = code;
    }
  };
}

// copied from marked helpers
const escapeTest = /[&<>"']/;
const escapeReplace = new RegExp(escapeTest.source, 'g');
const escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
const escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, 'g');
const escapeReplacements = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;'
};
const getEscapeReplacement = (ch) => escapeReplacements[ch];
function escape(html, encode) {
  if (encode) {
    if (escapeTest.test(html)) {
      return html.replace(escapeReplace, getEscapeReplacement);
    }
  } else {
    if (escapeTestNoEncode.test(html)) {
      return html.replace(escapeReplaceNoEncode, getEscapeReplacement);
    }
  }

  return html;
}
