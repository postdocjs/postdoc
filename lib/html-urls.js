// Finds the URLs in HTML and CSS that point at other files, and lets a function
// replace them. Only markup is touched: text, code samples and script bodies keep
// their URLs as written.

const URL_ATTRIBUTES = ['src', 'href', 'srcset', 'poster', 'action'];

// A <script> or <style> element with its body, a comment, or any other opening tag.
// Quoted attribute values may contain ">".
const TAG = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const HTML_TOKEN_RE = new RegExp(
  String.raw`(<script\b${TAG}>)([\s\S]*?)(<\/script\s*>)` +
  String.raw`|(<style\b${TAG}>)([\s\S]*?)(<\/style\s*>)` +
  String.raw`|<!--[\s\S]*?-->` +
  String.raw`|<([a-zA-Z][\w:-]*)(${TAG})>`,
  'g'
);
const ATTRIBUTE_RE = /(\s)([a-zA-Z:-]+)(\s*=\s*)(["'])([\s\S]*?)\4/g;
const CSS_URL_RE = /(url\(\s*)(["']?)([^"')]+?)\2(\s*\))|(@import\s+)(["'])([^"']+)\6/g;

/**
 * True for a path from the root of the site, such as `/guide/index.html`,
 * but not for a protocol-relative URL such as `//example.com`.
 *
 * @ignore
 */
export function isRootRelative(url) {
  return url.startsWith('/') && !url.startsWith('//');
}

/**
 * Calls `mapUrl(url)` for every `url()` and `@import` in a stylesheet, and replaces
 * the URL with the result unless it is undefined.
 *
 * @ignore
 */
export function mapCssUrls(css, mapUrl) {
  return css.replace(CSS_URL_RE, (match, urlStart, urlQuote, url, urlEnd, importStart, importQuote, importUrl) => {
    if (urlStart) {
      return urlStart + urlQuote + (mapUrl(url) ?? url) + urlQuote + urlEnd;
    }

    return importStart + importQuote + (mapUrl(importUrl) ?? importUrl) + importQuote;
  });
}

function mapSrcset(srcset, mapUrl) {
  return srcset
    .split(',')
    .map((candidate) => candidate.replace(/^(\s*)(\S+)/, (match, space, url) => space + (mapUrl(url) ?? url)))
    .join(',');
}

function mapAttributes(tagName, attributes, mapUrl) {
  return attributes.replace(ATTRIBUTE_RE, (match, space, name, equals, quote, value) => {
    const attribute = name.toLowerCase();
    let mappedValue = value;

    if (attribute === 'style') {
      mappedValue = mapCssUrls(value, (url) => mapUrl(url, { tagName, attribute }));
    } else if (attribute === 'srcset') {
      mappedValue = mapSrcset(value, (url) => mapUrl(url, { tagName, attribute }));
    } else if (URL_ATTRIBUTES.includes(attribute)) {
      mappedValue = mapUrl(value, { tagName, attribute }) ?? value;
    }

    return space + name + equals + quote + mappedValue + quote;
  });
}

/**
 * Calls `mapUrl(url, { tagName, attribute })` for every URL in the markup of a page:
 * link and source attributes, inline styles and `<style>` elements. The URL is
 * replaced with the result unless it is undefined.
 *
 * @ignore
 */
export function mapHtmlUrls(html, mapUrl) {
  return html.replace(HTML_TOKEN_RE, (
    match,
    scriptTag, scriptBody, scriptEnd,
    styleTag, styleBody, styleEnd,
    tagName, attributes
  ) => {
    if (scriptTag) {
      return mapAttributes('script', scriptTag, mapUrl) + scriptBody + scriptEnd;
    }

    if (styleTag) {
      return styleTag + mapCssUrls(styleBody, (url) => mapUrl(url, { tagName: 'style', attribute: null })) + styleEnd;
    }

    if (tagName) {
      return '<' + tagName + mapAttributes(tagName.toLowerCase(), attributes, mapUrl) + '>';
    }

    // A comment.
    return match;
  });
}

/**
 * The values of the given attributes, such as `id`, in the tags of a page. Text, code
 * samples and script bodies are left out, as they are by `mapHtmlUrls`.
 *
 * @ignore
 */
export function collectAttributeValues(html, names) {
  const values = [];

  for (const [, scriptTag, , , , , , tagName, attributes] of html.matchAll(HTML_TOKEN_RE)) {
    const tagAttributes = scriptTag ?? (tagName ? attributes : '');

    for (const [, , name, , , value] of tagAttributes.matchAll(ATTRIBUTE_RE)) {
      if (names.includes(name.toLowerCase())) {
        values.push(value);
      }
    }
  }

  return values;
}

/**
 * Returns a function for `mapHtmlUrls` and `mapCssUrls` that adds the base path
 * to root-relative URLs that don't have it yet.
 *
 * @ignore
 */
export function prefixBase(base) {
  return (url) => {
    if (isRootRelative(url) && !url.startsWith(base)) {
      return base + url.slice(1);
    }
  };
}
