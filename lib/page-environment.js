/**
 * Layouts and includes are [EJS](https://ejs.co) templates that run in Node.js at build
 * time. Besides the data passed to an include, every template can use these variables.
 *
 * <h2 id="page">page</h2>
 *
 * The page being rendered:
 *
 * - `url` - the page's URL, such as `/guide/index.html`.
 * - `content` - the HTML compiled from the page's Markdown file.
 * - `sourcePath` - the page's Markdown file, from the project's folder, such as
 *   `docs/guide/index.md`. The default theme makes its link to edit the page from it.
 * - every front matter value, such as `page.title`.
 * - `comments` and `commentsSourcePath` - on API pages, the parsed JSDoc comments and
 *   the path of the file they come from.
 *
 * ```html
 * <h1><%= page.title %></h1>
 * <%- page.content %>
 * ```
 *
 * <h2 id="pages">pages</h2>
 *
 * Every page of the site, each as an object with a `url`.
 *
 * ```html
 * <ul>
 *   <% for (const { url } of pages) { %>
 *     <li><a href="<%= url %>"><%= url %></a></li>
 *   <% } %>
 * </ul>
 * ```
 *
 * <h2 id="app-settings">appSettings</h2>
 *
 * The `appSettings` object from the configuration file. `appSettings.name` defaults to
 * the `name` in your `package.json`.
 *
 * ```html
 * <title><%= page.title %> | <%= appSettings.name %></title>
 * ```
 *
 * <h2 id="configuration">configuration</h2>
 *
 * The complete configuration, with defaults filled in.
 *
 * <h2 id="import">importModule</h2>
 *
 * Imports an ES module. Use it with `await`, because templates cannot use the
 * `import` statement. Relative paths are resolved from the folder of the layout
 * being rendered, also when you call it from an include.
 *
 * ```html
 * <% const { sidebar } = await importModule('../sidebar.js'); %>
 * ```
 *
 * Its name in 0.3.0-preview4, `_import`, still works, with a warning.
 *
 * <h2 id="commonjs-globals">require, __filename and __dirname</h2>
 *
 * - `require` - loads a CommonJS module or a JSON file. Relative paths are resolved
 *   from the layout's folder.
 * - `__filename` - the absolute path of the layout being rendered.
 * - `__dirname` - the absolute path of the layout's folder.
 *
 * ```html
 * <% const versions = require('../versions.json'); %>
 * ```
 *
 * @name page_environment
 */

import { cwd } from 'node:process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, relative, resolve } from 'node:path';

import Configuration from './configuration.js';
import { deprecate } from './deprecations.js';

export default class PageEnvironment {
  constructor(layoutFilePath, pageUrl, outputPagePath, pages, additionalPageInformation = {}) {
    this.__filename = layoutFilePath;
    this.__dirname = dirname(layoutFilePath);

    this.require = createRequire(pathToFileURL(layoutFilePath));

    this.importModule = (path) => import(
      path.startsWith('.') ? pathToFileURL(resolve(dirname(layoutFilePath), path)) : path
    );

    // Its name in 0.3.0-preview4. An own property, like the others, so that includes
    // get it too.
    this._import = (path) => {
      deprecate('_import', `_import() is now importModule(). PostDoc still runs it: rename it in ${relative(cwd(), layoutFilePath)}.`);

      return this.importModule(path);
    };

    this.page = {
      ...additionalPageInformation,
      url: pageUrl
    };

    this.configuration = Configuration.get();
    this.pages = pages.map((page) => ({ url: page.url }));

    this.appSettings = Configuration.get().appSettings;
  }
}
