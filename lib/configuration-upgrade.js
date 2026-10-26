// Turns the settings of PostDoc 0.3.0-preview4 into the current ones, so that a project
// written for it builds as it did. Each change comes with a message that says what to
// write instead.

const RENAMED_DIRECTORIES = {
  content: 'contentPath',
  output: 'outputPath',
  tests: 'testsPath'
};

// 0.3.0-preview4 had no baseDir: its directories were relative to the project's folder.
const PREVIEW4_DIRECTORIES = ['content', 'output', 'tests', 'layouts', 'includes'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The project's own settings in the current form, and the deprecations found on the
 * way, as `{ key, message }`. The settings passed in are left as they are.
 *
 * A configuration without `baseDir` that sets any of `directories.content`, `output`,
 * `tests`, `layouts` or `includes` is one of 0.3.0-preview4. Its directories are then
 * read from the project's folder, with that version's defaults, and without a theme,
 * unless it sets one.
 *
 * @ignore
 */
export function upgradeConfiguration(userConfiguration) {
  if (!isObject(userConfiguration)) {
    return { configuration: userConfiguration, deprecations: [] };
  }

  const configuration = { ...userConfiguration };
  const deprecations = [];

  if (isObject(userConfiguration.directories)) {
    const directories = { ...userConfiguration.directories };
    const isPreview4 = !('baseDir' in userConfiguration) && PREVIEW4_DIRECTORIES.some((name) => name in directories);

    for (const [name, replacement] of Object.entries(RENAMED_DIRECTORIES)) {
      if (!(name in directories)) {
        continue;
      }

      if (replacement in userConfiguration) {
        deprecations.push({
          key: `directories.${name}`,
          message: `The configuration sets both directories.${name} and ${replacement}. PostDoc reads ${replacement}: ` +
            `remove directories.${name}.`
        });
      } else {
        configuration[replacement] = directories[name];
        deprecations.push({
          key: `directories.${name}`,
          message: `directories.${name} is now ${replacement}, relative to the project's folder. PostDoc still reads it: ` +
            'rename it.'
        });
      }

      delete directories[name];
    }

    if (isPreview4) {
      const settings = ['baseDir: \'.\''];

      configuration.baseDir = '.';
      directories.layouts ??= 'pages';

      if (!('vitePublic' in directories) && typeof userConfiguration.vite?.publicDir !== 'string') {
        directories.vitePublic = 'src/public';
      }

      if (!('theme' in userConfiguration)) {
        configuration.theme = null;
        settings.push('theme: null');
      }

      deprecations.push({
        key: 'baseDir',
        message: 'The configuration has no baseDir, so PostDoc reads it as 0.3.0-preview4 did: its directories are ' +
          'relative to the project\'s folder' + (configuration.theme === null ? ', and there is no theme' : '') +
          `. Set ${settings.join(' and ')} to keep it that way.`
      });
    }

    configuration.directories = directories;
  }

  if (isObject(userConfiguration.apidocs) && 'layout' in userConfiguration.apidocs) {
    const { layout, ...apidocs } = userConfiguration.apidocs;

    apidocs.layoutName ??= layout;
    configuration.apidocs = apidocs;
    deprecations.push({
      key: 'apidocs.layout',
      message: 'apidocs.layout is now apidocs.layoutName. PostDoc still reads it: rename it.'
    });
  }

  if (isObject(userConfiguration.markdown?.options) && 'syntaxHighlight' in userConfiguration.markdown.options) {
    const { syntaxHighlight, ...options } = userConfiguration.markdown.options;
    const markdown = { ...userConfiguration.markdown, options };

    if (!('syntaxHighlight' in markdown)) {
      markdown.syntaxHighlight = syntaxHighlight;
    }

    configuration.markdown = markdown;
    deprecations.push({
      key: 'markdown.options.syntaxHighlight',
      message: 'markdown.options.syntaxHighlight is now markdown.syntaxHighlight. PostDoc still reads it: move it.'
    });
  }

  return { configuration, deprecations };
}
