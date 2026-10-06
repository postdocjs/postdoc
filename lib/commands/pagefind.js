/**
 * Writes the [Pagefind](https://pagefind.app) search index without a full build, for
 * example to inspect it or to serve it from somewhere else. The build command writes
 * the index into the output directory, and the dev server builds its own in memory.
 *
 * Options:
 *
 * - `--path <outputPath>` - where to write the index. Without this option,
 *   PostDoc asks for it.
 *
 * @example
 * ```sh
 * npx postdoc pagefind --path ./search-index
 * ```
 *
 * @name pagefind
 * @since 0.1.0
 */

import Collector from '../collector.js';
import PostDocCommand from '../command.js';
import Configuration from '../configuration.js';
import runAndMeasureAction from './measured-action.js';
import Pagefind from '../pagefind.js';
import {resolve} from 'path';
import inquirer from 'inquirer';
import Logger from '../logger.js';
import {inspect} from 'node:util';

export default function createBuildCommand() {
  return new PostDocCommand('pagefind')
    .description('Builds the Pagefind search index files to a specified location on disk.')
    .option('-p, --path <outputPath>', 'Output path.')
    .action(({path}) => runAndMeasureAction(async () => {
      const collector = new Collector();
      const configuration = Configuration.get();

      if (!path) {
        path = (await inquirer.prompt({
          type: 'input',
          name: 'outputPath',
          message: 'Specify the output path for the Pagefind index files.',
          default: './pagefind'
        })).outputPath;
      }

      try {
        if (!configuration.pagefind.enabled) {
          Logger.error(`\nPagefind is not enabled in the configuration:\n ${inspect(configuration.pagefind, {depth: 2, colors: true, compact: false})}\n\n`);

          return;
        }

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
