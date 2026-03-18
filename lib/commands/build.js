/**
 * Generates HTML pages, compiles and optimises assets
 * providing service worker and manifest making PWA.
 *
 * @name build
 * @since 0.1.0
 */

import { build } from 'vite';
import { join } from 'node:path';

import Collector from '../collector.js';
import PostDocCommand from '../command.js';
import ViteConfiguration from '../vite.js';
import Configuration from '../configuration.js';
import runAndMeasureAction from './measured-action.js';
import Pagefind from '../pagefind.js';

export default function createBuildCommand() {
  return new PostDocCommand('build')
    .description('Builds the project, copies assets into an output directory.')
    .action(() =>
      runAndMeasureAction(async () => {
        const collector = new Collector();
        const configuration = Configuration.get();

        try {
          await collector.collectPages();

          await collector.writePages();

          const inlineConfig = await ViteConfiguration.createForProduction(
            collector
          );

          await build(inlineConfig);

          if (configuration.pagefind.enabled) {
            const pagefindOutput = join(inlineConfig.build.outDir, configuration.pagefind.outputDir);
            await Pagefind.writeFiles(pagefindOutput);
          }
        } finally {
          await collector.clear();
        }
      })
    );
}
