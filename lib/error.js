import Logger from './logger.js';

export default class PostDocError extends Error {
  constructor(reason, parameters = {}) {
    const typography = Logger.get().typography;

    let message;

    switch (reason) {
      case 'page:missed-layout':
        message = `The page ${typography.green(parameters.pageUrl)} does not have corresponding layout file.`;
        break;
      case 'page:missed-named-layout':
        message = `The page ${typography.green(parameters.pageUrl)} names the layout ${typography.bold(parameters.layoutName)} in its front matter, but neither the layouts folder nor the theme has ${typography.dim(parameters.layoutName + '.ejs')}.`;
        break;
      default:
        message = 'Unknown error occurred.';
    }

    super(message);

    this.reason = reason;
    this.parameters = parameters;
  }
}
