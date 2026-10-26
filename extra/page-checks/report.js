import { appendFileSync } from 'node:fs';

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

// The report that `postdoc test` reads afterwards, one JSON record a line, written as the
// checks go, so that it keeps what they found if Nightwatch stops on the way. And what
// is being checked: the page, the window width and the check.
let reportFile = null;
let reportBrowser = null;
let context = {};

function record(entry) {
  if (reportFile) {
    appendFileSync(reportFile, JSON.stringify(entry) + '\n', 'utf8');
  }
}

// With the browser, when the checks run in more than one, so the report can tell them apart.
export function startReport(filePath, browser) {
  reportFile = filePath;
  reportBrowser = browser ?? null;
}

export function setReportContext(nextContext) {
  context = { page: null, width: null, check: null, ...nextContext };
}

export function setReportCheck(check) {
  context = { ...context, check };
}

// Fails the test case with the error, and records the problem in the report.
export function reportProblem(browser, error) {
  const [message, ...lines] = error.message.split('\n');

  record({
    type: 'problem',
    ...context,
    message: message.trim(),
    elements: lines.map((line) => line.trim()).filter(Boolean),
    link: error.link ?? null,
    ...(reportBrowser && { browser: reportBrowser })
  });

  browser.verify.fail(error);
}

// A page that has been checked at a width, so the report can say how far the checks got.
export function recordChecked(page, width) {
  record({ type: 'checked', page, width, ...(reportBrowser && { browser: reportBrowser }) });
}

export function finishReport() {
  record({ type: 'finished' });
}
