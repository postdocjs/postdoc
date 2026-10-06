/**
 * The problems that the page checks found, grouped: a problem in a header or a footer
 * shows up on every page, and is reported once, with the pages it's on.
 */

const MAX_LISTED_PAGES = 5;
const MAX_LISTED_ELEMENTS = 5;

/**
 * Groups problems that have the same message, elements and check. Each group lists
 * the pages and widths it was found at, in the order they were checked.
 *
 * @ignore
 */
export function groupProblems(problems) {
  const groups = new Map();

  for (const { page, width, check, message, elements = [], link = null } of problems) {
    const key = JSON.stringify([check, message, elements]);
    const group = groups.get(key) ?? { check, message, elements, link, pages: [] };

    if (!group.pages.some((found) => found.page === page && found.width === width)) {
      group.pages.push({ page, width });
    }

    groups.set(key, group);
  }

  return [...groups.values()];
}

const listWidths = (pages) => {
  const widths = [...new Set(pages.map(({ width }) => width).filter(Boolean))].sort((a, b) => b - a);

  return widths.length ? ` at ${widths.map((width) => `${width}px`).join(' and ')}` : '';
};

// Where a problem was found: the page, or how many pages, with the first few of them.
function describePlaces(pages) {
  const pageUrls = [...new Set(pages.map(({ page }) => page).filter(Boolean))];

  if (!pageUrls.length) {
    return 'in the navigation check';
  }

  if (pageUrls.length === 1) {
    return `on ${pageUrls[0]}${listWidths(pages)}`;
  }

  const remainingCount = pageUrls.length - MAX_LISTED_PAGES;

  return `on ${pageUrls.length} pages${listWidths(pages)}: ${pageUrls.slice(0, MAX_LISTED_PAGES).join(', ')}` +
    (remainingCount > 0 ? ` and ${remainingCount} more` : '');
}

/**
 * The summary that `postdoc test` prints after the checks: each problem once, with
 * where it was found.
 *
 * @ignore
 */
export function formatSummary(groups, typography) {
  const lines = [`Page checks: ${groups.length} problem${groups.length === 1 ? '' : 's'}`];

  for (const group of groups) {
    lines.push('', `  ${typography.red('✖')} ${group.message}`);
    lines.push(...group.elements.slice(0, MAX_LISTED_ELEMENTS).map((element) => `      ${typography.dim(element)}`));
    lines.push(`    ${describePlaces(group.pages)}`);
  }

  return lines.join('\n');
}
