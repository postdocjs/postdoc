/**
 * Starts a development server.
 *
 * This command is practically the same as running the `vite` command,
 * but with a PostDoc plugin. You can configure its behaviour through
 * the [server](https://vitejs.dev/config/server-options.html) options
 * in the `vite.config.{js|ts}` file. Also, the command supports two
 * CLI options:
 *
 * 1. `--host [url]` - exposes the dev server to the LAN and public addresses.
 * 2. `--open [url]` - automatically opens a browser on provided URL or `/index.html`
 *   if no argument is provided. To set the browser to open see
 *   [Vite's documentation](https://vitejs.dev/config/server-options.html#server-open).
 *
 * If a configuration file contains `apidocs` property with non-null `source`
 * field, then PostDoc will create API docs pages alongside regular ones.
 *
 * @see /apidocs/configuration.html
 * @name run
 * @since 0.1.0
 */


import process from 'node:process';
import { resolve } from 'node:path';

import Stream from '@halo-lab/stream';
import { watch } from 'chokidar';
import { createServer } from 'vite';

import Logger from '../logger.js';
import Collector from '../collector.js';
import Configuration from '../configuration.js';
import PostDocCommand from '../command.js';
import ViteConfiguration from '../vite.js';
import runAndMeasureAction from './measured-action.js';

function createWatcher() {
  const configuration = Configuration.get();

  const pagesDirectoryGlob = resolve(
    configuration.contentPath,
    '**',
    '*'
  );
  const layoutsDirectoryGlob = resolve(
    configuration.baseDir,
    configuration.directories.layouts,
    '**',
    '*'
  );
  const includesDirectoryGlob = resolve(
    configuration.baseDir,
    configuration.directories.includes,
    '**',
    '*'
  );
  const apidocsGlob = configuration.apidocs ? configuration.apidocs.source &&
    resolve(
      configuration.apidocs.source,
      '**',
      '*'
    ) : null;

  const watcherOptions = {
    ignoreInitial: true
  };

  return Stream.from((send) => {
    function setUpListeners(watcher) {
      return watcher
        .on('add', (path, stats) =>
          send({
            kind: 'add',
            path,
            stats
          })
        )
        .on('change', (path, stats) =>
          send({
            kind: 'change',
            path,
            stats
          })
        )
        .on('unlink', (path, stats) =>
          send({
            kind: 'remove',
            path,
            stats
          })
        );
    }

    const pagesWatcher = setUpListeners(
      watch(pagesDirectoryGlob, watcherOptions)
    );
    const layoutsWatcher = setUpListeners(
      watch(layoutsDirectoryGlob, watcherOptions)
    );
    const includesWatcher = setUpListeners(
      watch(includesDirectoryGlob, watcherOptions)
    );
    const apidocsWatcher = apidocsGlob && setUpListeners(
      watch(apidocsGlob, watcherOptions)
    );

    return async () => {
      await pagesWatcher.close();
      await layoutsWatcher.close();
      await includesWatcher.close();
      if (apidocsWatcher) {
        await apidocsWatcher.close();
      }
    };
  });
}

export default function createRunCommand() {
  return new PostDocCommand('run')
    .option(
      '-h | --host [url]',
      'Listen on all available network interfaces.'
    )
    .option(
      '-o | --open [browser]',
      'Automatically open the local dev server url in the designated browser (safari, chrome, edge, firefox).'
    )
    .description('Start the Vite-powered development server with live preview and Hot Module Replacement (HMR).')
    .action(({ open, host }) =>
      runAndMeasureAction(async () => {
        const collector = new Collector(true);
        await collector.collectPages();

        const serverOptions = {
          host
        }

        if (open) {
          serverOptions.open = open;
        }

        const inlineConfig = ViteConfiguration.createForDevelopment(collector, {
          server: serverOptions
        });

        const server = await createServer(inlineConfig);
        await server.listen();

        Logger.log(
          () => `
            Server is listening on:
              - ${server.resolvedUrls.local.join(' | ')}
              ${
  server.resolvedUrls.network.length
    ? '- ' + server.resolvedUrls.network.join(' | ')
    : ''
}
          `,
          Logger.SuccessLevel
        );

        const events = createWatcher();

        const unsubscribe = Stream.forEach(events, async () => {
          await collector.collectPages();

          server.ws.send('postdoc:reload-page');
        });

        process.on('SIGINT', () => {
          process.exit(0);
        });

        process.on('beforeExit', async () => {
          console.log('Shutting down server...')
          await server.close();
          await unsubscribe();
          await collector.clear();
        });
      })
    );
}
