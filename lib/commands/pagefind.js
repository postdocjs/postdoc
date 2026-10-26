/**
 * Writes the [Pagefind](https://pagefind.app) search index without a full build, for
 * example to inspect it or to serve it from somewhere else. The build command writes
 * the index into the output directory, and the dev server builds its own in memory.
 *
 * Options:
 *
 * - `--path <outputPath>` - where to write the index. Without this option,
 *   PostDoc asks for it, or, when there's no terminal to ask in, stops with an error.
 *
 * @example
 * ```sh
 * npx postdoc pagefind --path ./search-index
 * ```
 *
 * @name pagefind
 * @since 0.1.0
 */

import process from 'node:process';
import { resolve } from 'node:path';

import inquirer from 'inquirer';

import Collector from '../collector.js';
import PostDocCommand from '../command.js';
import Configuration from '../configuration.js';
import runAndMeasureAction from './measured-action.js';
import Pagefind from '../pagefind.js';
import Logger from '../logger.js';

export default function createPagefindCommand() {
  return new PostDocCommand('pagefind')
    .description('Builds the Pagefind search index files to a specified location on disk.')
    .option('-p, --path <outputPath>', 'Output path.')
    .action(({ path }) => runAndMeasureAction(async () => {
      const configuration = Configuration.get();

      if (!configuration.pagefind.enabled) {
        Logger.log((typography) => `
            Search is turned off in the configuration, so there's no index to write. Set ${typography.cyan('pagefind.enabled')} to ${typography.cyan('true')} to turn it on.
          `, Logger.ErrorLevel);
        process.exitCode = 1;

        return;
      }

      // A prompt would wait forever for an answer that can't come.
      if (!path && !process.stdin.isTTY) {
        Logger.log((typography) => `
            There's no terminal to ask where to write the index in. Give it with ${typography.cyan('--path <outputPath>')}.
          `, Logger.ErrorLevel);
        process.exitCode = 1;

        return;
      }

      if (!path) {
        path = (await inquirer.prompt({
          type: 'input',
          name: 'outputPath',
          message: 'Specify the output path for the Pagefind index files.',
          default: './pagefind'
        })).outputPath;
      }

      // It makes a temporary directory in the project, which clear() removes.
      const collector = new Collector();

      try {
        await collector.collectPages();
        await collector.compilerAndBuildSearchIndex();

        const pagefindOutput = resolve(path);
        await Pagefind.writeFiles(pagefindOutput);

        Logger.log(`\nPagefind index files have been written to ${pagefindOutput}.\n\n`, Logger.SuccessLevel);
      } finally {
        await collector.clear();
      }
    }));
}
