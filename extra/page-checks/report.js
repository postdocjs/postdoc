import { writeFileSync } from 'node:fs';

export const MAX_LISTED_ELEMENTS = 5;

// The report shows the message and, if given, a "Read More" link. A stack would only
// point at the page checks, which tells the reader nothing: showTrace hides it in the
// live report, and an empty stack in the final summary.
export function createReportError(message, link) {
  const error = new Error(message);

  error.showTrace = false;
  error.stack = '';

  if (link) {
    error.link = link;
  }

  return error;
}

// A problem with the elements it was found in, one per line.
export function createListError(message, elements, link) {
  const remainingCount = elements.length - MAX_LISTED_ELEMENTS;

  return createReportError(
    `${message} (${elements.length})\n` +
    elements.slice(0, MAX_LISTED_ELEMENTS).map((element) => `\t${element}`).join('\n') +
    (remainingCount > 0 ? `\n\tand ${remainingCount} more` : ''),
    link
  );
}

// The problems found so far, for the report that `postdoc test` reads afterwards, and
// what is being checked: the page, the window width and the check.
const problems = [];
let context = {};

export function setReportContext(nextContext) {
  context = { page: null, width: null, check: null, ...nextContext };
}

export function setReportCheck(check) {
  context = { ...context, check };
}

// Fails the test case with the error, and keeps the problem for the report.
export function reportProblem(browser, error) {
  const [message, ...lines] = error.message.split('\n');

  problems.push({
    ...context,
    message: message.trim(),
    elements: lines.map((line) => line.trim()).filter(Boolean),
    link: error.link ?? null
  });

  browser.verify.fail(error);
}

// With the browser, when the checks ran in more than one, so the report can tell them apart.
export function writeReport(filePath, browser) {
  writeFileSync(filePath, JSON.stringify(browser ? problems.map((problem) => ({ ...problem, browser })) : problems), 'utf8');
}
