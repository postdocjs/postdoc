/**
 * Links to Markdown files lead to the pages made from them: [Setup](../setup.md#node)
 * becomes a link to ../setup.html#node. Each Markdown file becomes a page at the same
 * path with .html, so the link works in the built site as well as in an editor or on
 * GitHub. Links to other sites are left alone.
 */

const SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;
const MARKDOWN_PATH_RE = /^([^?#]*)\.md(?=[?#]|$)/i;

export function toPageUrl(href) {
  if (!href || SCHEME_RE.test(href) || href.startsWith('//')) {
    return href;
  }

  return href.replace(MARKDOWN_PATH_RE, '$1.html');
}

export const markdownLinksExtension = {
  walkTokens(token) {
    if (token.type === 'link') {
      token.href = toPageUrl(token.href);
    }
  }
};
