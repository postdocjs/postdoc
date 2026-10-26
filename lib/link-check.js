/**
 * Finds links between the pages of a site that lead nowhere: to a page that doesn't
 * exist, or to an id that the page doesn't have, and pictures that aren't files of the
 * site. It reads the compiled pages, so it needs no browser and no build.
 */
import { extname } from 'node:path';

import { collectAttributeValues, mapHtmlUrls } from './html-urls.js';

// A scheme, such as https: or mailto:, or a protocol-relative URL: not the site's own.
const OTHER_SITE_RE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const ORIGIN = 'https://postdoc.invalid';

const LINK_TAGS = ['a', 'area'];
const FILE_TAGS = ['img', 'source', 'video', 'audio', 'track'];

/**
 * The ids of the elements of a page, which links can point at with a fragment.
 *
 * @ignore
 */
export function collectIds(html) {
  return new Set(collectAttributeValues(html, ['id', 'name']));
}

// The links and the pictures of a page, by the URLs written in it.
function collectUrls(html) {
  const urls = [];

  mapHtmlUrls(html, (url, { tagName, attribute }) => {
    if (LINK_TAGS.includes(tagName) && attribute === 'href') {
      urls.push({ kind: 'link', url: url.trim() });
    } else if (FILE_TAGS.includes(tagName) && attribute === 'src') {
      urls.push({ kind: 'file', url: url.trim() });
    }
  });

  return urls;
}

const decode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

// The pages a path can mean: a folder means its index, and a path without an extension
// can be a page without its .html, as most hosts serve it.
function getCandidatePages(path) {
  if (path.endsWith('/')) {
    return [path + 'index.html'];
  }

  return extname(path) ? [path] : [path + '.html', path + '/index.html'];
}

/**
 * Checks the links of compiled pages. `pages` maps each page's URL to its HTML.
 * `fileExists(path)` says whether a path of the site is a file, such as a public file.
 * `base` is the site's base path, which a link may have written out. `isIgnored(path)`
 * says whether a path of the site is served by another site, so links to it aren't
 * checked or counted. Returns the problems, each with the page it's on, the URL as
 * it's written and what's wrong.
 *
 * @ignore
 */
export function checkLinks(pages, { fileExists = () => false, base = '/', isIgnored = () => false } = {}) {
  const idsOfPages = new Map();
  const problems = [];
  let linkCount = 0;

  const getIds = (pageUrl) => {
    if (!idsOfPages.has(pageUrl)) {
      idsOfPages.set(pageUrl, collectIds(pages.get(pageUrl)));
    }

    return idsOfPages.get(pageUrl);
  };

  for (const [pageUrl, html] of pages) {
    const seen = new Set();

    for (const { kind, url } of collectUrls(html)) {
      if (!url || url === '#' || OTHER_SITE_RE.test(url) || seen.has(url)) {
        continue;
      }

      seen.add(url);

      const resolved = new URL(url, ORIGIN + pageUrl);
      let path = decode(resolved.pathname);
      const fragment = decode(resolved.hash.slice(1));

      if (base !== '/' && path.startsWith(base)) {
        path = path.slice(base.length - 1);
      }

      if (isIgnored(path)) {
        continue;
      }

      linkCount++;

      if (kind === 'file') {
        if (!fileExists(path) && !pages.has(path)) {
          problems.push({ page: pageUrl, url, message: `shows ${url}, which isn't a file of the site` });
        }

        continue;
      }

      const target = getCandidatePages(path).find((candidate) => pages.has(candidate));

      if (!target) {
        if (!fileExists(path)) {
          problems.push({ page: pageUrl, url, message: `links to ${url}, which isn't a page of the site` });
        }

        continue;
      }

      // A text fragment, #:~:text=, is for the browser to find.
      if (fragment && !fragment.startsWith(':~:') && !getIds(target).has(fragment)) {
        problems.push({
          page: pageUrl,
          url,
          message: target === pageUrl
            ? `links to #${fragment}, but the page has no element with that id`
            : `links to ${url}, but ${target} has no element with the id "${fragment}"`
        });
      }
    }
  }

  return { problems, linkCount };
}
