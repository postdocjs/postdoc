import Page from './page.js';
import Configuration, { resolveLayoutsDirectory } from './configuration.js';

export default class LayoutPage extends Page {
  constructor(layoutFilePath, temporaryOutputDirectoryName) {
    const configuration = Configuration.get();

    const outputFilePath = Page.resolveOutputFilePath(layoutFilePath, resolveLayoutsDirectory(configuration), temporaryOutputDirectoryName);

    super(layoutFilePath, outputFilePath, temporaryOutputDirectoryName);
  }

  async compile(pages) {
    return this.compileLayout(pages);
  }
}
