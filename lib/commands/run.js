/**
 * Starts the development server. Pages are compiled when you open them, and the
 * browser reloads when a page, layout, include or API source file changes.
 *
 * Options:
 *
 * - `--host [host]` - listens on all network interfaces, or on the given host,
 *   so other devices on your network can open the site.
 * - `--open [path]` - opens the site in your browser when the server starts,
 *   optionally at the given path.
 * - `--port <port>` - serves the site on this port, and fails if it's taken, so a
 *   second server, such as one an AI agent starts to check its work, never takes
 *   another one's place.
 *
 * Without `--port`, the port comes from `vite.server.port` in the configuration file,
 * and without that, Vite's default port 5173 is used.
 *
 * Drafts, pages with `draft: true` in their front matter, are shown by the dev server
 * but left out of builds.
 *
 * @example
 * ```sh
 * npx postdoc run --open /guide/index.html
 * ```
 *
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
import Configuration, { resolveIncludesDirectory, resolveLayoutsDirectory } from '../configuration.js';
import PostDocCommand from '../command.js';
import ViteConfiguration from '../vite.js';
import runAndMeasureAction from './measured-action.js';

function createWatcher() {
  const configuration = Configuration.get();

  // chokidar watches directories recursively. It doesn't take globs.
  const pagesDirectory = resolve(configuration.contentPath);
  const layoutsDirectory = resolveLayoutsDirectory(configuration);
  const includesDirectory = resolveIncludesDirectory(configuration);
  const apidocsDirectory = configuration.apidocs ? configuration.apidocs.source &&
    resolve(configuration.apidocs.source) : null;

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
      watch(pagesDirectory, watcherOptions)
    );
    const layoutsWatcher = setUpListeners(
      watch(layoutsDirectory, watcherOptions)
    );
    const includesWatcher = setUpListeners(
      watch(includesDirectory, watcherOptions)
    );
    const apidocsWatcher = apidocsDirectory && setUpListeners(
      watch(apidocsDirectory, watcherOptions)
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
      '--host [url]',
      'Listen on all available network interfaces.'
    )
    .option(
      '-o | --open [path]',
      'Open the site in your browser when the server starts, optionally at the given path.'
    )
    .option('-p, --port <port>', 'Serve on this port, and fail if it is taken.')
    .description('Start the Vite-powered development server with live preview and Hot Module Replacement (HMR).')
    .action(({ open, host, port }) =>
      runAndMeasureAction(async () => {
        const collector = new Collector(true);
        await collector.collectPages();

        const serverOptions = {
          host
        }

        if (open) {
          serverOptions.open = open;
        }

        if (port !== undefined) {
          serverOptions.port = Number(port);
          serverOptions.strictPort = true;
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

        const searchPlugin = inlineConfig.plugins.find((plugin) => plugin.name === 'postdoc-search');

        const unsubscribe = Stream.forEach(events, async () => {
          await collector.collectPages();

          server.ws.send('postdoc:reload-page');
          searchPlugin?.reindex();
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
