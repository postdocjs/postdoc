import * as pagefind from 'pagefind';
import Configuration from './configuration.js';

// No log file: every command starts an index, and one in the current directory would
// litter projects with it, and make `postdoc init --name .` find the folder not empty.
// `pagefind.options.logfile` writes one.
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

  static async initialise() {
    this.#instance = new Pagefind();
    this.#instance.index = await this.#createIndex();
  }

  // Starts over with an empty index, so the dev server can index the pages again.
  static async reset() {
    await this.#instance.index?.deleteIndex();
    this.#instance.index = await this.#createIndex();
  }

  static async #createIndex() {
    const options = {
      ...defaultOptions,
      ...Configuration.get().pagefind?.options
    };

    const { index } = await pagefind.createIndex(options);

    return index;
  }

  constructor() {
    this.index = null;
  }

  static async addHTMLFile({sourcePath, url, content}) {
    return await this.#instance.index.addHTMLFile({
      url,
      sourcePath,
      content
    });
  }

  // The index files in memory, as {path, content} objects.
  static async getFiles() {
    const { files } = await this.#instance.index.getFiles();

    return files;
  }

  static writeFiles(outputPath) {
    return this.#instance.index.writeFiles({
      outputPath
    });
  }
}
