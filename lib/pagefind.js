import * as pagefind from 'pagefind';
import Logger from './logger.js';
import Configuration from './configuration.js';

// No log file: every command starts an index, and one in the current directory would
// litter projects with it, and make `postdoc init --name .` find the folder not empty.
// `pagefind.options.logfile` writes one.
// How long Pagefind gets to start, in milliseconds. It takes well under a second.
const INDEX_TIMEOUT = 5000;

const defaultOptions = {
  rootSelector: 'html',
  forceLanguage: 'en',
  keepIndexUrl: false,
  verbose: false
};

export default class Pagefind {
  static #instance;

  static get() {
    if (!this.#instance) {
      throw new Error('Pagefind is not initialised yet.');
    }

    return this.#instance;
  }

  static initialise() {
    this.#instance = new Pagefind();
  }

  // Starts over with an empty index, so the dev server can index the pages again.
  static async reset() {
    await this.#instance.index?.deleteIndex();
    this.#instance.index = null;
  }

  // The index, started the first time a page is added to it: only a build and the dev
  // server need one, and a site without search never starts Pagefind at all. Null when
  // there is no index to add to.
  static async #getIndex() {
    const instance = this.#instance;

    if (instance.index || instance.isUnavailable || Configuration.get().pagefind?.enabled === false) {
      return instance.index;
    }

    // Pages are compiled in parallel, and all of them wait for the one start.
    instance.starting ??= this.#createIndex().then((index) => {
      instance.index = index;
      instance.starting = null;

      return index;
    });

    return instance.starting;
  }

  // Pagefind is a program of its own, which can't run everywhere Node.js can, such as
  // in a browser. Where it can't, the site is built without a search index, and
  // Pagefind isn't tried again, because every try would cost the same wait.
  static async #createIndex() {
    const options = {
      ...defaultOptions,
      ...Configuration.get().pagefind?.options
    };

    // When its program can't start, Pagefind neither answers nor fails, and Node.js
    // would exit with nothing to wait for. So the answer has a time limit.
    let timer;

    try {
      const { index, errors } = await Promise.race([
        pagefind.createIndex(options),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`it didn't answer in ${INDEX_TIMEOUT / 1000} seconds`)), INDEX_TIMEOUT);
        })
      ]);

      if (!index) {
        throw new Error(errors?.join(' ') || 'it returned no index');
      }

      return index;
    } catch (error) {
      pagefind.close?.().catch(() => {});

      if (!this.#instance.isUnavailable) {
        this.#instance.isUnavailable = true;
        Logger.log(() => `The search index is left out, because Pagefind can't run here: ${error.message}.`, Logger.WarningLevel);
      }

      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  constructor() {
    this.index = null;
    this.starting = null;
    this.isUnavailable = false;
  }

  static async addHTMLFile({ sourcePath, url, content }) {
    const index = await this.#getIndex();

    return index?.addHTMLFile({
      url,
      sourcePath,
      content
    });
  }

  // The index files in memory, as {path, content} objects.
  static async getFiles() {
    const index = await this.#getIndex();

    if (!index) {
      return [];
    }

    const { files } = await index.getFiles();

    return files;
  }

  static async writeFiles(outputPath) {
    const index = await this.#getIndex();

    return index?.writeFiles({
      outputPath
    });
  }
}
