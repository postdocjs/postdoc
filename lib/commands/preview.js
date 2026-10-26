/**
 * Builds the site and serves the output, so you can check the production build
 * before you deploy it.
 *
 * Options:
 *
 * - `--skip-build` - serves the existing output without building it again.
 * - `--port <port>` - serves the site on this port, and fails if it's taken. Without
 *   it, Vite's preview port 4173 is used, or the next free one.
 * - `--out-dir <dir>` - builds into and serves this directory instead of the
 *   configured `outputPath`.
 * - `--host [host]` - listens on all network interfaces, or on the given host.
 * - `--open [path]` - opens the site in your browser when the server starts,
 *   optionally at the given path.
 *
 * @example
 * ```sh
 * npx postdoc preview --open
 * ```
 *
 * @name preview
 * @since 0.1.0
 */

import process from 'node:process';
import { preview } from 'vite';

import Logger from '../logger.js';
import Collector from '../collector.js';
import PostDocCommand from '../command.js';
import ViteConfiguration from '../vite.js';
import runAndMeasureAction from './measured-action.js';
import { buildProject, useOutputDirectory } from './build.js';

/**
 * Builds the project and serves the output on a free port, for the commands that
 * open the site in a browser: they see what will be deployed, and never collide with a
 * running dev server. Returns the address, the URLs of PostDoc's pages and a function
 * that stops the server.
 *
 * @ignore
 */
export async function serveBuild() {
  const build = await buildProject();

  if (!build) {
    return null;
  }

  const server = await preview(ViteConfiguration.createForPreview(new Collector(true), {
    preview: { strictPort: false }
  }));
  const [localUrl] = server.resolvedUrls.local;

  return {
    baseUrl: localUrl.endsWith('/') ? localUrl : localUrl + '/',
    pageUrls: build.pageUrls,
    stop: () => server.close()
  };
}

export const runPreview = async ({ host, open, port, skipBuild = false } = {}) => {
  if (!skipBuild) {
    try {
      if (!await buildProject()) {
        return;
      }
    } catch {
      // The build has said what went wrong.
      process.exitCode = 1;

      return;
    }
  }

  // The preview server only serves the output directory, so it needs
  // no temporary build directory. Vite would take strictPort from vite.server when it's
  // left out, so it's set either way.
  const inlineConfig = ViteConfiguration.createForPreview(new Collector(true), {
    preview: {
      host,
      open,
      port: port === undefined ? undefined : Number(port),
      strictPort: port !== undefined
    }
  });

  const server = await preview(inlineConfig);

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

  return server;
};

export default function createPreviewCommand() {
  return new PostDocCommand('preview')
    .description('Builds the project for production and starts a static dev server from the output.')
    .option(
      '-o | --open [url]',
      'Automatically open the app in the browser on server start.'
    )
    .option(
      '-s | --skip-build',
      'Skip the build step and use the existing output folder.'
    )
    .option('-p, --port <port>', 'Serve on this port, and fail if it is taken.')
    .option('--out-dir <dir>', 'Build into and serve this directory instead of the configured outputPath.')
    .option(
      '--host [url]',
      'The proxy option for the Vite\'s "host" CLI argument. It exposes the dev and preview server to the LAN and public addresses.'
    )
    .action(({ host, open, port, skipBuild, outDir }) => {
      useOutputDirectory(outDir);

      return runAndMeasureAction(() => runPreview({ host, open, port, skipBuild }));
    });
}
