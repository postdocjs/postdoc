import { cwd } from 'node:process';
import { existsSync, createReadStream, statSync, readFileSync } from 'node:fs';
import { join, resolve, sep, normalize } from 'node:path';
import { readdir } from 'node:fs/promises';

import AsyncIterable from '@halo-lab/iterable/async';
import { VitePWA } from 'vite-plugin-pwa';
import { pipeWith } from 'pipe-ts';
import { mergeConfig } from 'vite';

import Configuration from './configuration.js';
import { walkDirectory } from './fs.js';

class PostDocRenderVitePlugin {
  #collector;

  name = 'postdoc-render';
  apply = 'serve';
  configureServer = ({ middlewares: app, transformIndexHtml }) => {
    return () => {
      app.use(async (request, response, next) => {
        if (request.url.endsWith('.html') || request.url.endsWith('/')) {
          const page = this.#collector.pages.find((page) => {
            return page.url === request.url || page.url === request.url + 'index.html'
          });

          if (page) {
            let pageHtml;

            try {
              pageHtml = await page.compile(this.#collector.pages, true);
            } catch (err) {
              const error = new Error(`There was an internal error while rendering the ${request.url} page:\n\n${err.message}`);
              error.stack = err.stack;

              return next(error);
            }

            // ApiPage may return undefined for page whose document comments are
            // ignored. We cannot know that before creating page and parsing
            // code, so it is done while compiling the page.
            if (!pageHtml) {
              next(new Error(`There was an internal error rendering the ${request.url}.`));
            } else {
              pageHtml = await transformIndexHtml(request.url, pageHtml);

              response.statusCode = 200;
              response.setHeader('Content-Type', 'text/html');
              response.write(pageHtml);
              response.end();
            }
          } else {
            next(new Error(`The request page ${request.url} cannot be found.`));
          }
        } else {
          next();
        }
      });
    };
  };

  constructor(collector) {
    this.#collector = collector;
  }
}

/**
 * Serves theme static assets (public/) as fallback when not found
 * in the consumer project's directories. In dev mode, serves files
 * via middleware. In build mode, copies theme public files to output.
 */
class PostDocThemeVitePlugin {
  #themePaths;
  #consumerPublicDir;

  name = 'postdoc-theme';
  enforce = 'pre';

  // Resolve theme public files so Vite's module graph can find them
  resolveId = (source) => {
    if (!source.startsWith('/') || !this.#themePaths?.public) {
      return null;
    }

    // Skip if consumer has this file
    const consumerFile = join(this.#consumerPublicDir, ...source.split('/'));

    if (existsSync(consumerFile)) {
      return null;
    }

    const themeFile = join(this.#themePaths.public, ...source.split('/'));

    if (existsSync(themeFile)) {
      return themeFile;
    }

    return null;
  };

  // Load theme files that Vite resolved to theme paths
  load = (id) => {
    const themePublicRoot = this.#themePaths?.public;

    if (!themePublicRoot || !id.startsWith(themePublicRoot)) {
      return null;
    }

    if (existsSync(id)) {
      return readFileSync(id, 'utf-8');
    }

    return null;
  };

  configureServer = ({ middlewares: app }) => {
    const themePaths = this.#themePaths;

    if (!themePaths?.public || !existsSync(themePaths.public)) {
      return;
    }

    const themePublicDir = themePaths.public;
    const consumerPublicDir = this.#consumerPublicDir;

    // Serve theme public assets as fallback BEFORE Vite's internal middleware,
    // so Vite's module resolver doesn't 404 on theme JS/CSS files.
    // Only serves files that don't exist in the consumer's public dir.
    app.use((request, response, next) => {
      if (!request.url || request.url.endsWith('.html') || request.url.endsWith('/')) {
        return next();
      }

      const urlPath = request.url.split('?')[0];

      // Skip if consumer has this file (let Vite handle it normally)
      const consumerFile = join(consumerPublicDir, ...urlPath.split('/'));

      if (existsSync(consumerFile)) {
        return next();
      }

      const themePublicFile = join(themePublicDir, ...urlPath.split('/'));

      if (existsSync(themePublicFile)) {
        try {
          const stat = statSync(themePublicFile);

          if (stat.isFile()) {
            const ext = urlPath.split('.').pop();
            const mimeTypes = {
              js: 'application/javascript',
              css: 'text/css',
              svg: 'image/svg+xml',
              png: 'image/png',
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              woff: 'font/woff',
              woff2: 'font/woff2'
            };

            if (mimeTypes[ext]) {
              response.setHeader('Content-Type', mimeTypes[ext]);
            }

            createReadStream(themePublicFile).pipe(response);

            return;
          }
        } catch {
          // Fall through to next
        }
      }

      next();
    });
  };

  writeBundle = async (options) => {
    const themePaths = this.#themePaths;

    if (!themePaths?.public || !existsSync(themePaths.public)) {
      return;
    }

    const { cp } = await import('node:fs/promises');
    const outDir = options.dir || resolve('out');


    // Copy theme public files that don't exist in consumer public dir or build output
    const themePublicDescriptor = walkDirectory(themePaths.public);

    await pipeWith(
      themePublicDescriptor.files,
      AsyncIterable.forEach(async (filePath) => {
        const relativePath = filePath.replace(themePaths.public, '');
        const consumerFile = join(this.#consumerPublicDir, relativePath);
        const outputFile = join(outDir, relativePath);

        // Only copy if consumer doesn't have this file
        if (!existsSync(consumerFile)) {
          const outputDir = resolve(outputFile, '..');

          if (!existsSync(outputDir)) {
            const { mkdir } = await import('node:fs/promises');
            await mkdir(outputDir, { recursive: true });
          }

          await cp(filePath, outputFile);
        }
      })
    );
  };

  constructor(themePaths, consumerPublicDir) {
    this.#themePaths = themePaths;
    this.#consumerPublicDir = consumerPublicDir;
  }
}

class PostDocRebaseVitePlugin {
  #collector;
  #configuration;
  #viteConfiguration;

  name = 'postdoc-rebase';
  configResolved = (config) => {
    this.#viteConfiguration = config;
  };

  transformIndexHtml = {
    order: 'pre',
    handler: (html, context) => {
      const fileUrlRe = /^\/\S+\.\S+$/;
      const links = new Set(
        Array.from(html.matchAll(/'\/[^']*'|"\/[^"]*"/g))
          .map(([match]) => match.slice(1, -1))
          .filter((match) => fileUrlRe.test(match))
      );

      if (!links.size) {
        return html;
      }

      const pathFromPackageRoot = normalize(context.filename)
        .replace(cwd(), '')
        .slice(1);

      let toRootUrlPrefix = '';

      if (pathFromPackageRoot.startsWith(this.#collector.temporaryDirectoryPrefix)) {
        toRootUrlPrefix = pathFromPackageRoot
          .split(sep)
          .slice(1)
          .map(() => '..')
          .join('/');
      } else {
        toRootUrlPrefix = pathFromPackageRoot
          .split(sep)
          .map(() => '..')
          .join('/');
      }

      const publicDirectory = resolve(this.#viteConfiguration.publicDir);
      const themePublicDir = this.#configuration._resolvedThemePaths?.public;
      const nonEscapedSeparatorRe = /\s+/;

      for (const match of links) {
        const urls = new Set(match.split(nonEscapedSeparatorRe).filter((value) => value.startsWith('/')));

        for (const url of urls) {
          const urlParts = url.split('/');
          const inConsumer = existsSync(join(publicDirectory, ...urlParts));
          const inTheme = themePublicDir && existsSync(join(themePublicDir, ...urlParts));

          if (!inConsumer && !inTheme) {
            html = html.replaceAll(url, toRootUrlPrefix + url);
          }
        }
      }

      return html;
    }
  };

  constructor(configuration, collector) {
    this.#collector = collector;
    this.#configuration = configuration;
  }
}

export default class ViteConfiguration {
  static async createForProduction(collector) {
    const defaultViteConfiguration = new ViteConfiguration('mpa', collector);
    const configuration = Configuration.get();
    const themePaths = configuration._resolvedThemePaths || configuration.themePaths;



    // Copy theme public assets into the temp dir so Rollup can resolve them
    if (themePaths?.public && existsSync(themePaths.public)) {
      const { cp, mkdir } = await import('node:fs/promises');
      const consumerPublicDir = resolve(join(configuration.baseDir, configuration.directories.vitePublic));
      const themePublicDescriptor = walkDirectory(themePaths.public);

      await pipeWith(
        themePublicDescriptor.files,
        AsyncIterable.forEach(async (filePath) => {
          const relativePath = filePath.replace(themePaths.public, '');
          const consumerFile = join(consumerPublicDir, relativePath);
          const targetFile = join(collector.temporaryOutputDirectoryPath, relativePath);

          if (!existsSync(consumerFile) && !existsSync(targetFile)) {
            const targetDir = resolve(targetFile, '..');

            if (!existsSync(targetDir)) {
              await mkdir(targetDir, { recursive: true });
            }

            await cp(filePath, targetFile);
          }
        })
      );
    }

    const directoryDescriptor = walkDirectory(collector.temporaryOutputDirectoryPath);

    const htmlPages = await pipeWith(directoryDescriptor.files, AsyncIterable.filter((file) => file.endsWith('.html')), AsyncIterable.fold([], (pages, file) => {
      pages.push(file);

      return pages;
    }));

    return mergeConfig(defaultViteConfiguration, {
      root: collector.temporaryOutputDirectoryPath, build: {
        rollupOptions: {
          input: htmlPages
        }
      }
    });
  }

  static createForPreview(collector, additionalViteConfiguration) {
    const defaultViteConfiguration = new ViteConfiguration('mpa', collector);

    return mergeConfig(defaultViteConfiguration, additionalViteConfiguration);
  }

  static createForDevelopment(collector, additionalViteConfiguration) {
    const defaultViteConfiguration = new ViteConfiguration('custom', collector);

    return mergeConfig(defaultViteConfiguration, additionalViteConfiguration);
  }

  constructor(appType, collector) {
    const configuration = Configuration.get();
    const { baseDir, directories, outputPath } = configuration;
    const buildOutputDir = resolve(outputPath);
    const vitePublicDir = resolve(join(baseDir, directories.vitePublic));

    this.appType = appType;
    this.plugins = [
      new PostDocRebaseVitePlugin(configuration, collector),
      new PostDocRenderVitePlugin(collector)
    ];

    // Add theme plugin for serving theme public assets as fallback
    const themePaths = configuration._resolvedThemePaths || configuration.themePaths;

    if (themePaths) {
      this.plugins.push(new PostDocThemeVitePlugin(themePaths, vitePublicDir));
    }

    if (configuration.pwa.enabled) {
      this.plugins.push(VitePWA(configuration.pwa));
    }

    if (Array.isArray(configuration.vite?.plugins)) {
      this.plugins.push(...configuration.vite.plugins);
    }

    this.build = {
      outDir: buildOutputDir,
      emptyOutDir: true
    };

    this.publicDir = vitePublicDir;

    if (typeof configuration.vite?.publicDir == 'string') {
      this.publicDir = configuration.vite.publicDir;
    }

    if (configuration.vite?.root !== undefined) {
      this.root = configuration.vite.root;
    }

    if (configuration.vite?.logLevel) {
      this.logLevel = configuration.vite.logLevel;
    }

    if (configuration.vite?.server) {
      this.server = configuration.vite?.server;
    }
  }
}
