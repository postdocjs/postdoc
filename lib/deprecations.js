// Settings and template variables of older versions that PostDoc still reads. Each one is
// recorded once, when it is first met. The commands print them as warnings, and
// `postdoc check` lists them without failing. Nothing here goes through the logger, so a
// deprecation met while a page compiles isn't taken for one of that page's problems.

const deprecations = new Map();

let reporter = null;

/**
 * Records that the project uses something of an older version. Only the first message
 * of each key is kept, and passed on to the reporter, if there is one.
 *
 * @ignore
 */
export function deprecate(key, message) {
  if (deprecations.has(key)) {
    return;
  }

  deprecations.set(key, message);
  reporter?.(key, message);
}

/**
 * The deprecations recorded so far, in the order they were met.
 *
 * @ignore
 */
export function getDeprecations() {
  return [...deprecations].map(([key, message]) => ({ key, message }));
}

/**
 * Passes every recorded deprecation to `report(key, message)`, and the ones recorded
 * later as they come.
 *
 * @ignore
 */
export function reportDeprecations(report) {
  reporter = report;

  for (const [key, message] of deprecations) {
    report(key, message);
  }
}

/**
 * Forgets the deprecations and the reporter. The configuration does it when it's read.
 *
 * @ignore
 */
export function clearDeprecations() {
  deprecations.clear();
  reporter = null;
}
