import * as pagefind from 'pagefind';
import Configuration from './configuration.js';

const defaultOptions = {
  rootSelector: 'html',
  forceLanguage: 'en',
  keepIndexUrl: false,
  verbose: false,
  logfile: 'debug.log'
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
    const options = {
      ...defaultOptions,
      ...Configuration.get().pagefind?.options
    };

    const {index} = await pagefind.createIndex(options);
    this.#instance.index = index;
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

  static writeFiles(outputPath) {
    return this.#instance.index.writeFiles({
      outputPath
    });
  }
}
