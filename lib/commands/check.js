/**
 * Checks the project in seconds, without a browser or a build: the configuration, every
 * page, and every link between the pages. Run it after each change, and `postdoc test`
 * before you publish.
 *
 * It finds:
 *
 * - settings that PostDoc no longer reads, such as `directories.content`
 * - an output directory that holds the project's own files, which a build would delete
 * - pages that can't be compiled: a missing layout, front matter or a storymap that
 *   isn't valid, or an error in a layout
 * - links to pages that don't exist, and to ids that their page doesn't have
 * - pictures that aren't files of the site
 *
 * Drafts are checked too.
 *
 * Options:
 *
 * - `--json [file]` - prints the problems as JSON instead, or writes them to the file:
 *   each with its kind, the page it's on and what's wrong.
 *
 * The command exits with 1 when it finds a problem, so it can stop a CI job, or tell
 * an AI agent that its change isn't done.
 *
 * @example
 * ```sh
 * npx postdoc check --json
 * ```
 *
 * @name check
 * @since 0.3.0
 */

import process from 'node:process';
import { existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import Logger from '../logger.js';
import Collector from '../collector.js';
import Configuration, { findOutputDirectoryProblem, resolvePublicDirectory } from '../configuration.js';
import PostDocCommand from '../command.js';
import { checkLinks } from '../link-check.js';

// Whether a path of the site is a file of the project: in its public folder, in the
// theme's, or anywhere in the project, as a layout's own files are.
function createFileCheck(configuration) {
  const roots = [
    resolvePublicDirectory(configuration),
    configuration._resolvedThemePaths?.public,
    process.cwd()
  ].filter(Boolean);

  return (path) => roots.some((root) => {
    const filePath = join(root, ...path.split('/'));

    return existsSync(filePath) && statSync(filePath).isFile();
  });
}

// An error as a line or two: without the stack, which points into PostDoc and not at the
// page, without marked's request to report errors that are the page's, and with paths
// from the project's root.
function summariseError(text) {
  const root = process.cwd() + sep;

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('at ') && !line.startsWith('Please report this to https://github.com/markedjs/marked'))
    .map((line) => line.replaceAll(root, '').replace(/^Error: /, ''))
    .join(' ');
}

/**
 * Runs every check, and returns the problems and how much was checked.
 *
 * @ignore
 */
export async function checkProject() {
  const configuration = Configuration.get();

  // Nothing else can be checked without the configuration.
  if (configuration._loadError) {
    return { pageCount: 0, linkCount: 0, problems: [{ kind: 'configuration', page: null, message: configuration._loadError }] };
  }
  const problems = [...(configuration._problems ?? []), findOutputDirectoryProblem(configuration)]
    .filter(Boolean)
    .map((message) => ({ kind: 'configuration', page: null, message }));
  const collector = new Collector(true);

  // A page that can't be made, such as one without a layout, is left out and logged.
  const collectionMessages = await Logger.capture(() => collector.collectPages());

  problems.push(...collectionMessages.map(({ text }) => ({ kind: 'page', page: null, message: summariseError(text) })));

  const compiledPages = new Map();

  for (const page of collector.pages) {
    let html;
    let thrown = null;

    const messages = await Logger.capture(async () => {
      try {
        html = await page.compile(collector.pages, true);
      } catch (error) {
        thrown = error;
      }
    });

    if (html) {
      compiledPages.set(page.url, html);
    } else {
      const message = messages.map(({ text }) => summariseError(text)).join(' ') ||
        (thrown && summariseError(thrown.message)) ||
        'The page could not be compiled.';

      problems.push({ kind: 'page', page: page.url, message });
    }
  }

  const { problems: linkProblems, linkCount } = checkLinks(compiledPages, {
    fileExists: createFileCheck(configuration),
    base: configuration.base
  });

  problems.push(...linkProblems.map(({ page, url, message }) => ({ kind: 'link', page, url, message })));

  return { pageCount: collector.pages.length, linkCount, problems };
}

// Problems with the same message on several pages, such as a broken link in a footer,
// are printed once.
function printProblems({ pageCount, linkCount, problems }) {
  const groups = new Map();

  for (const problem of problems) {
    const key = `${problem.kind}\n${problem.message}`;

    groups.set(key, [...(groups.get(key) ?? []), problem]);
  }

  for (const group of groups.values()) {
    const pages = group.map(({ page }) => page).filter(Boolean);
    const where = pages.length > 1
      ? `On ${pages.length} pages, such as ${pages.slice(0, 3).join(', ')}: `
      : pages.length ? `${pages[0]}: ` : '';

    Logger.log(where + group[0].message, Logger.ErrorLevel);
  }

  const checked = `Checked ${pageCount} pages and ${linkCount} links`;

  Logger.log(
    problems.length ? `${checked}: ${problems.length} problem${problems.length === 1 ? '' : 's'}.` : `${checked}: no problems.`,
    problems.length ? Logger.ErrorLevel : Logger.SuccessLevel
  );
}

export default function createCheckCommand() {
  return new PostDocCommand('check')
    .description('Checks the configuration, every page and every link, without a browser.')
    .option('--json [file]', 'Print the problems as JSON, or write them to the file.')
    .action(async ({ json }) => {
      const result = await checkProject();

      if (json === true) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else if (json) {
        await writeFile(resolve(json), JSON.stringify(result, null, 2), 'utf8');
        printProblems(result);
      } else {
        printProblems(result);
      }

      process.exitCode = result.problems.length ? 1 : 0;
    });
}
