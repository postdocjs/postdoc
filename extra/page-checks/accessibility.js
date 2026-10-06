import { createReportError, MAX_LISTED_ELEMENTS, reportProblem } from './report.js';

// aXe rules about missing names. The keyboard check leaves out the elements they
// report, so each element is reported once.
const AXE_NAME_RULES = [
  'aria-command-name', 'aria-input-field-name', 'aria-toggle-field-name', 'button-name',
  'frame-title', 'input-button-name', 'label', 'link-name', 'select-name'
];

const getViolationKey = (violation, node) => `${violation.id}|${node.target.join(' ')}`;

async function injectAxe(browser) {
  const isInjected = await browser.execute(function () {
    return typeof window.axe === 'object';
  });

  if (!isInjected) {
    await browser.axeInject();
  }
}

/**
 * Runs aXe on the current page. Returns its results, or null after reporting that it
 * couldn't run.
 */
export async function runAxe(browser, context, options) {
  await injectAxe(browser);

  const results = await browser.axeRun(context, { ...options, runAssertions: false });

  // axeRun reports a failed run as its result instead of throwing.
  if (!Array.isArray(results?.violations)) {
    reportProblem(browser, createReportError(`aXe could not check the page: ${results?.error ?? 'it returned no results'}`));

    return null;
  }

  return results;
}

function createViolationError(violation, nodes, prefix) {
  const targets = nodes.map((node) => node.target.join(' '));
  const listedTargets = targets.slice(0, MAX_LISTED_ELEMENTS).join(', ');
  const remainingCount = targets.length - MAX_LISTED_ELEMENTS;

  return createReportError(
    `${prefix}aXe rule ${violation.id} (${violation.impact}): ${violation.help}\n` +
    `\tIn ${targets.length} element(s): ${listedTargets}${remainingCount > 0 ? ` and ${remainingCount} more` : ''}`,
    violation.helpUrl
  );
}

/**
 * Reports aXe's violations, leaving out the elements in `knownKeys`, which were
 * reported already. Returns how many it reported.
 */
export function reportViolations(browser, violations, { prefix = '', knownKeys = new Set() } = {}) {
  let reportedCount = 0;

  for (const violation of violations) {
    const nodes = violation.nodes.filter((node) => !knownKeys.has(getViolationKey(violation, node)));

    if (nodes.length) {
      reportedCount++;
      reportProblem(browser, createViolationError(violation, nodes, prefix));
    }
  }

  return reportedCount;
}

// The elements aXe reported as having no name. A target with more than one selector
// is inside a frame or a shadow root, which the keyboard check can't look into.
export const getUnnamedSelectors = (results) => results.violations
  .filter((violation) => AXE_NAME_RULES.includes(violation.id))
  .flatMap((violation) => violation.nodes.map((node) => node.target))
  .filter((target) => target.length === 1)
  .map(([selector]) => selector);

/**
 * Checks the page with aXe. Returns what the other checks need: the elements that
 * were reported, the elements reported for having no name, and the rules that ran.
 */
export async function checkAccessibility(browser, a11y) {
  const results = await runAxe(browser, a11y.context, a11y.options);

  if (!results) {
    return { violationKeys: new Set(), unnamedSelectors: [], ranRules: new Set() };
  }

  reportViolations(browser, results.violations);

  if (!results.violations.length) {
    browser.assert.ok(true, `No accessibility violations (${results.passes.length} aXe rules passed)`);
  }

  const allRules = [results.violations, results.passes, results.incomplete, results.inapplicable].flatMap((rules) => rules ?? []);

  return {
    violationKeys: new Set(results.violations.flatMap((violation) => violation.nodes.map((node) => getViolationKey(violation, node)))),
    unnamedSelectors: getUnnamedSelectors(results),
    ranRules: new Set(allRules.map((rule) => rule.id))
  };
}
