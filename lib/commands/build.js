/**
 * Builds the site into the output directory, `out` by default. It compiles every
 * page, bundles the CSS and JavaScript that layouts reference, copies the public
 * files and writes the search index. With `pwa.enabled`, it also generates a service
 * worker and a web app manifest. Unless `llms.enabled` is `false`, it writes an
 * `llms.txt` and a Markdown copy of every page as well, for AI agents.
 *
 * Drafts, pages with `draft: true` in their front matter, are left out. A page that
 * can't be compiled is left out too, and the command then exits with 1, after building
 * the rest.
 *
 * Options:
 *
 * - `--out-dir <dir>` - builds into this directory instead of the configured
 *   `outputPath`, which is then left as it is.
 *
 * @example
 * ```sh
 * npx postdoc build --out-dir /tmp/site
 * ```
 *
 * @name build
 * @since 0.1.0
 */

import process from 'node:process';
import { build } from 'vite';
import { join, resolve } from 'node:path';

import Collector from '../collector.js';
import PostDocCommand from '../command.js';
import ViteConfiguration from '../vite.js';
import Configuration, { findOutputDirectoryProblem } from '../configuration.js';
import runAndMeasureAction from './measured-action.js';
import Pagefind from '../pagefind.js';
import RegularPage from '../regular-page.js';
import Logger from '../logger.js';
import { writeLlmsFiles } from '../llms.js';

/**
 * Points the build at another directory than the configured output directory, for
 * the `--out-dir` option of the commands that build.
 *
 * @ignore
 */
export function useOutputDirectory(directory) {
  if (directory) {
    Configuration.get().outputPath = resolve(directory);
  }
}

/**
 * Builds the project into the configured output directory, and returns whether it did.
 * Shared by the build, preview, screenshot and test commands.
 *
 * @ignore
 */
export async function buildProject() {
  const collector = new Collector();
  const configuration = Configuration.get();

  // Vite empties the output directory before it writes the site into it.
  const outputDirectoryProblem = findOutputDirectoryProblem(configuration);

  if (outputDirectoryProblem) {
    Logger.log(outputDirectoryProblem, Logger.ErrorLevel);
    process.exitCode = 1;

    return false;
  }

  try {
    await collector.collectPages();

    const failedPages = await collector.writePages();

    const inlineConfig = await ViteConfiguration.createForProduction(
      collector
    );

    await build(inlineConfig);

    if (configuration.pagefind.enabled) {
      const pagefindOutput = join(inlineConfig.build.outDir, configuration.pagefind.outputDir);
      await Pagefind.writeFiles(pagefindOutput);
    }

    if (configuration.llms.enabled) {
      const count = await writeLlmsFiles(collector.pages.filter((page) => page instanceof RegularPage), inlineConfig.build.outDir);

      Logger.debug(() => `Wrote llms.txt and ${count} Markdown copies of pages.`);
    }

    // The rest of the site is built, so it can be looked at, but the build has failed.
    if (failedPages.length) {
      Logger.log(`The build left out ${failedPages.length} page${failedPages.length === 1 ? '' : 's'} that couldn't be compiled: ` +
        `${failedPages.join(', ')}. The errors are above.`, Logger.ErrorLevel);
      process.exitCode = 1;
    }

    return true;
  } finally {
    await collector.clear();
  }
}

export default function createBuildCommand() {
  return new PostDocCommand('build')
    .description('Builds the project, copies assets into an output directory.')
    .option('--out-dir <dir>', 'Build into this directory instead of the configured outputPath.')
    .action(({ outDir }) => {
      useOutputDirectory(outDir);

      return runAndMeasureAction(buildProject);
    });
}
