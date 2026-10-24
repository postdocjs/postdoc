/**
 * Creates a Markdown page and a page test for it: a Nightwatch
 * [page object](https://nightwatchjs.org/guide/using-page-objects/getting-started.html)
 * that `postdoc test` runs. The page goes into the content directory, and the page test
 * into `pages` in the tests directory, at the same relative path.
 *
 * Options:
 *
 * - `--name <url>` - the URL or path of the new page, such as `/guide/faq`. It can't lead
 *   out of the content directory. Without this option, PostDoc asks for it, or, when
 *   there's no terminal to ask in, stops with an error.
 * - `--draft` - starts the page as a draft, which the dev server shows and builds leave
 *   out until you remove `draft: true` from its front matter. A draft gets no page test,
 *   as there's no page in the build for it to test.
 *
 * The command exits with 1 when it can't create the page, such as when the page or its
 * page test exists already.
 *
 * @example
 * ```sh
 * npx postdoc create page --name /guide/faq
 * ```
 *
 * @name page
 * @since 0.1.0
 */

import process from 'node:process';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import inquirer from 'inquirer';

import Logger from '../../logger.js';
import Configuration from '../../configuration.js';
import GeneratedPage from '../../generated-page.js';
import GeneratedTest from '../../generated-test.js';
import PostDocCommand from '../../command.js';
import runAndMeasureAction from '../measured-action.js';

function fail(createText) {
  Logger.log(createText, Logger.ErrorLevel);
  process.exitCode = 1;
}

const fromProject = (path) => relative(process.cwd(), path).split(sep).join('/');

// Nightwatch makes a page object of each file in the page tests' folder, named after its
// path, so guide.js and the folder guide/ would both be called `guide`, and only one of
// them would be found.
function findPageObjectClash(testPath, pagesDirectory) {
  const folders = relative(pagesDirectory, dirname(testPath)).split(sep).filter(Boolean);

  for (let depth = 1; depth <= folders.length; depth++) {
    const file = join(pagesDirectory, ...folders.slice(0, depth)) + '.js';

    if (existsSync(file)) {
      return [file, join(pagesDirectory, ...folders.slice(0, depth))];
    }
  }

  const folder = testPath.replace(/\.js$/, '');

  return existsSync(folder) ? [testPath, folder] : null;
}

export default function createPageCommand() {
  return new PostDocCommand('page')
    .description('Creates a new page and a page test for it.')
    .option('-n, --name <url>', 'The URL or path of the new page, such as /guide/faq.')
    .option('--draft', 'Start the page as a draft, which builds leave out, without a page test.')
    .action(({ name, draft }) => runAndMeasureAction(async () => {
      const configuration = Configuration.get();

      // A prompt would wait forever for an answer that can't come.
      if (!name && !process.stdin.isTTY) {
        fail((typography) => `There's no terminal to ask for the page's name in. Give it with ${typography.cyan('--name <url>')}.`);

        return;
      }

      if (!name) {
        name = (await inquirer.prompt({
          type: 'input',
          name: 'name',
          message: 'Name or url of the new page:',
          default: '/example/page.html'
        })).name;
      }

      if (!name) {
        fail((typography) => `The page needs a name. Give it with ${typography.cyan('--name <url>')}, such as /guide/faq.`);

        return;
      }

      const prefixedName = name.startsWith('/') ? name : '/' + name;
      const contentFilePartialPath = prefixedName.endsWith('.md') ? prefixedName : prefixedName.endsWith('.html') ? prefixedName.replace('.html', '.md') : prefixedName + '.md';
      const contentDirectory = resolve(configuration.contentPath);
      const pageOutputPath = resolve(contentDirectory, contentFilePartialPath.slice(1).replaceAll('/', sep));
      const pagePathInContent = relative(contentDirectory, pageOutputPath);

      if (pagePathInContent.startsWith('..') || isAbsolute(pagePathInContent)) {
        fail((typography) => `The page ${typography.bold(name)} would be outside the content directory, ${typography.dim(fromProject(contentDirectory) || '.')}. Give its URL, such as /guide/faq.`);

        return;
      }

      if (existsSync(pageOutputPath)) {
        fail((typography) => `The page ${typography.dim(fromProject(pageOutputPath))} exists already.`);

        return;
      }

      const page = new GeneratedPage(draft ? GeneratedPage.DRAFT_CONTENT : GeneratedPage.DEFAULT_CONTENT, pageOutputPath);
      let test = null;

      if (!draft) {
        try {
          test = new GeneratedTest(page, GeneratedTest.DEFAULT_PAGE_OBJECT_CONTENT);
        } catch {
          fail((typography) => `The page test for ${typography.bold(page.url)} exists already. Move or remove it to create the page.`);

          return;
        }
      }

      try {
        await page.write();
        await test?.write();
      } catch (error) {
        await page.clearIfPresent();
        await test?.clearIfPresent();
        fail((typography) => `The page ${typography.dim(fromProject(pageOutputPath))} couldn't be written: ${error.message}`);

        return;
      }

      const clash = test && findPageObjectClash(test.outputPath, resolve([configuration.testsPath].flat()[0], 'pages'));

      Logger.log((typography) => `
            ${typography.bold('The page was created.')}
              - Page: ${typography.italic(fromProject(pageOutputPath))}${draft ? ' (a draft, which builds leave out)' : ''}
              - Page test: ${test ? typography.italic(fromProject(test.outputPath)) : 'none, as a draft isn\'t in the build'}

            To see it in the browser, run ${typography.cyan(`npx postdoc run --open ${page.url}`)}.
          `, Logger.SuccessLevel);

      if (clash) {
        Logger.log((typography) => `
            ${typography.dim(fromProject(clash[0]))} and the folder ${typography.dim(fromProject(clash[1]))} both make a page object called ${typography.bold(basename(clash[1]))}, and Nightwatch finds only one of them. Move ${typography.dim(basename(clash[0]))} to ${typography.dim(basename(clash[1]) + '/index.js')}.
          `, Logger.WarningLevel);
      }
    }));
}
