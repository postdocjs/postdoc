import { cwd } from 'node:process';
import { existsSync, createReadStream, statSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import AsyncIterable from '@halo-lab/iterable/async';
import { VitePWA } from 'vite-plugin-pwa';
import { pipeWith } from 'pipe-ts';
import { mergeConfig } from 'vite';

import Logger from './logger.js';
import Pagefind from './pagefind.js';
import Configuration from './configuration.js';
import { walkDirectory } from './fs.js';
import { isRootRelative, mapCssUrls, mapHtmlUrls, prefixBase } from './html-urls.js';

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class PostDocRenderVitePlugin {
  #collector;

  name = 'postdoc-render';
  apply = 'serve';
  configureServer = ({ middlewares: app, transformIndexHtml, config }) => {
    return () => {
      app.use(async (request, response, next) => {
        if (request.url.endsWith('.html') || request.url.endsWith('/')) {
          // The pages are written here, not by Vite, so the headers of the settings,
          // such as those that isolate a page for a playground, are added here too.
          for (const [name, value] of Object.entries(config.server?.headers ?? {})) {
            response.setHeader(name, value);
          }

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
            await this.#sendNotFound(request, response, transformIndexHtml);
          }
        } else {
          next();
        }
      });
    };
  };

  // A missing page gets a 404, as it would from a host: the site's own 404 page if it
  // has one, and otherwise a short page that says what was missing.
  async #sendNotFound(request, response, transformIndexHtml) {
    const notFoundPage = this.#collector.pages.find((page) => page.isNotFoundPage);
    let pageHtml;

    try {
      pageHtml = notFoundPage && await notFoundPage.compile(this.#collector.pages, true);
    } catch (error) {
      Logger.log(() => `The 404 page could not be rendered: ${error.message}`, Logger.ErrorLevel);
    }

    pageHtml = pageHtml
      ? await transformIndexHtml(request.url, pageHtml)
      : '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found</title></head>' +
        `<body><h1>Page not found</h1><p>There's no page at ${escapeHtml(request.url)}.</p></body></html>`;

    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/html');
    response.end(pageHtml);
  }

  constructor(collector) {
    this.#collector = collector;
  }
}

const SEARCH_FILE_TYPES = {
  js: 'application/javascript',
  css: 'text/css',
  json: 'application/json'
};

/**
 * Serves a search index in the dev server. Builds write the index to the output
 * directory; the dev server builds it in memory instead, and again when pages change.
 */
class PostDocSearchVitePlugin {
  #collector;
  #files = new Map();
  #indexing = null;
  #isReindexRequested = false;

  name = 'postdoc-search';
  apply = 'serve';

  configureServer = ({ middlewares: app }) => {
    const searchPath = `/${Configuration.get().pagefind.outputDir.replace(/^\/+|\/+$/g, '')}/`;

    app.use(async (request, response, next) => {
      const path = request.url.split('?')[0];

      if (!path.startsWith(searchPath)) {
        return next();
      }

      await this.#indexing;

      const file = this.#files.get(path.slice(searchPath.length));

      if (!file) {
        return next();
      }

      response.setHeader('Content-Type', SEARCH_FILE_TYPES[path.split('.').pop()] ?? 'application/octet-stream');
      response.end(Buffer.from(file));
    });

    this.reindex();
  };

  // Indexes the pages again. Changes that come in while it runs lead to one more run.
  reindex() {
    if (this.#indexing) {
      this.#isReindexRequested = true;

      return;
    }

    this.#indexing = (async () => {
      await Pagefind.reset();
      await this.#collector.compilerAndBuildSearchIndex();

      const files = await Pagefind.getFiles();

      this.#files = new Map(files.map(({ path, content }) => [path.split(sep).join('/'), content]));
    })()
      .catch((error) => Logger.log(() => `The search index could not be built: ${error.message}`, Logger.ErrorLevel))
      .finally(() => {
        this.#indexing = null;

        if (this.#isReindexRequested) {
          this.#isReindexRequested = false;
          this.reindex();
        }
      });
  }

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

/**
 * In a build, Vite's root is a temporary directory with the compiled pages, so a
 * root-relative URL like `/postdoc/js/site.js` would be looked up there. This plugin
 * points such URLs at the project's files with a path relative to the page, so Vite
 * can bundle them. URLs of public files, of theme files and of pages are left alone.
 */
class PostDocRebaseVitePlugin {
  #configuration;
  #publicDirectory;

  name = 'postdoc-rebase';
  apply = 'build';

  configResolved = (config) => {
    this.#publicDirectory = resolve(config.publicDir);
  };

  transformIndexHtml = {
    order: 'pre',
    handler: (html, context) => {
      const pageDirectory = dirname(context.filename);
      const themePublicDirectory = this.#configuration._resolvedThemePaths?.public;

      return mapHtmlUrls(html, (url, { tagName }) => {
        // Links lead to pages, which don't exist as project files.
        if (tagName === 'a' || tagName === 'area' || !isRootRelative(url)) {
          return;
        }

        const [, path, suffix] = url.match(/^([^?#]*)(.*)$/);
        const pathParts = decodeURI(path).split('/');

        if (existsSync(join(this.#publicDirectory, ...pathParts)) || (themePublicDirectory && existsSync(join(themePublicDirectory, ...pathParts)))) {
          return;
        }

        const projectFilePath = join(cwd(), ...pathParts);

        if (!existsSync(projectFilePath) || !statSync(projectFilePath).isFile()) {
          return;
        }

        const relativePath = relative(pageDirectory, projectFilePath).split(sep).join('/');

        return (relativePath.startsWith('.') ? '' : './') + relativePath + suffix;
      });
    }
  };

  constructor(configuration) {
    this.#configuration = configuration;
  }
}

/**
 * Adds the `base` path to the root-relative URLs that Vite leaves alone: links to
 * pages, public files and URLs in inline styles in the pages, and URLs in the
 * stylesheets that are copied without processing, such as public ones.
 */
class PostDocBaseVitePlugin {
  #base;

  name = 'postdoc-base';
  apply = 'build';

  transformIndexHtml = {
    order: 'post',
    handler: (html) => mapHtmlUrls(html, prefixBase(this.#base))
  };

  // Runs after the other plugins have copied their files, and before the
  // service worker is generated from the output.
  writeBundle = {
    sequential: true,
    order: 'post',
    handler: async (options) => {
      const addBase = prefixBase(this.#base);

      await pipeWith(
        walkDirectory(options.dir).files,
        AsyncIterable.filter((filePath) => filePath.endsWith('.css')),
        AsyncIterable.forEach(async (filePath) => {
          const css = await readFile(filePath, 'utf8');
          const cssWithBase = mapCssUrls(css, addBase);

          if (cssWithBase !== css) {
            await writeFile(filePath, cssWithBase, 'utf8');
          }
        })
      );
    }
  };

  constructor(base) {
    this.#base = base;
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
      root: collector.temporaryOutputDirectoryPath,
      base: configuration.base,
      build: {
        rollupOptions: {
          input: htmlPages
        }
      }
    });
  }

  static createForPreview(collector, additionalViteConfiguration) {
    const defaultViteConfiguration = new ViteConfiguration('mpa', collector);

    return mergeConfig(defaultViteConfiguration, {
      base: Configuration.get().base,
      ...additionalViteConfiguration
    });
  }

  static createForDevelopment(collector, additionalViteConfiguration) {
    const defaultViteConfiguration = new ViteConfiguration('custom', collector);

    return mergeConfig(mergeConfig(defaultViteConfiguration, {
      // Vite looks through the HTML files of the project for the packages that they
      // import. The pages aren't among them, as they're made on request, but the report
      // that Nightwatch writes is, and it imports packages that the project doesn't have.
      optimizeDeps: {
        entries: ['**/*.html', '!**/tests_output/**', '!**/logs/**', '!**/coverage/**', '!**/__tests__/**']
      }
    }), additionalViteConfiguration);
  }

  constructor(appType, collector) {
    const configuration = Configuration.get();
    const { baseDir, directories, outputPath } = configuration;
    const buildOutputDir = resolve(outputPath);
    const vitePublicDir = resolve(join(baseDir, directories.vitePublic));

    this.appType = appType;
    this.plugins = [
      new PostDocRebaseVitePlugin(configuration),
      new PostDocRenderVitePlugin(collector)
    ];

    if (configuration.base !== '/') {
      this.plugins.push(new PostDocBaseVitePlugin(configuration.base));
    }

    if (configuration.pagefind.enabled) {
      this.plugins.push(new PostDocSearchVitePlugin(collector));
    }

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
