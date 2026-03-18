import {join, resolve} from 'node:path';

import Page from './page.js';
import Configuration from './configuration.js';

export default class LayoutPage extends Page {
  constructor(layoutFilePath, temporaryOutputDirectoryName) {
    const configuration = Configuration.get();

    const outputFilePath = Page.resolveOutputFilePath(layoutFilePath, resolve(join(configuration.baseDir, configuration.directories.layouts)), temporaryOutputDirectoryName);

    super(layoutFilePath, outputFilePath, temporaryOutputDirectoryName);
  }

  async compile(pages) {
    return this.compileLayout(pages);
  }
}
