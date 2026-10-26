import assert from 'node:assert/strict';

import { upgradeConfiguration } from '../../lib/configuration-upgrade.js';

const keys = (deprecations) => deprecations.map(({ key }) => key);

describe('Settings of 0.3.0-preview4', function () {
  it('should read the old directory settings as the new ones', function () {
    const { configuration, deprecations } = upgradeConfiguration({
      baseDir: 'postdoc',
      directories: { content: './docs', output: './out', tests: ['./test'], layouts: 'layouts' }
    });

    assert.equal(configuration.contentPath, './docs');
    assert.equal(configuration.outputPath, './out');
    assert.deepEqual(configuration.testsPath, ['./test']);
    assert.deepEqual(configuration.directories, { layouts: 'layouts' });
    assert.deepEqual(keys(deprecations), ['directories.content', 'directories.output', 'directories.tests']);
    assert.match(deprecations[0].message, /directories\.content is now contentPath/);
  });

  it('should keep a new setting over the old one', function () {
    const { configuration, deprecations } = upgradeConfiguration({
      baseDir: '.',
      contentPath: './content',
      directories: { content: './docs' }
    });

    assert.equal(configuration.contentPath, './content');
    assert.deepEqual(configuration.directories, {});
    assert.match(deprecations[0].message, /sets both directories\.content and contentPath/);
  });

  it('should read a configuration without baseDir from the project\'s folder, without a theme', function () {
    // nightwatch-docs, as it was written for 0.3.0-preview4.
    const { configuration, deprecations } = upgradeConfiguration({
      vite: { publicDir: '/project/public' },
      directories: { output: './out', includes: 'src/includes', layouts: 'src/pages', content: './docs' },
      apidocs: { source: '/nightwatch/lib/api', layout: 'api/index.ejs' }
    });

    assert.equal(configuration.baseDir, '.');
    assert.equal(configuration.theme, null);
    assert.equal(configuration.contentPath, './docs');
    assert.equal(configuration.outputPath, './out');
    assert.deepEqual(configuration.directories, { includes: 'src/includes', layouts: 'src/pages' });
    assert.deepEqual(configuration.apidocs, { source: '/nightwatch/lib/api', layoutName: 'api/index.ejs' });
    assert.deepEqual(keys(deprecations), ['directories.content', 'directories.output', 'baseDir', 'apidocs.layout']);
    assert.match(deprecations[2].message, /Set baseDir: '\.' and theme: null/);
  });

  it('should fill in the directories of 0.3.0-preview4 that a configuration leaves out', function () {
    const { configuration } = upgradeConfiguration({ directories: { content: 'docs' } });

    assert.deepEqual(configuration.directories, { layouts: 'pages', vitePublic: 'src/public' });
  });

  it('should keep the theme of a configuration without baseDir that sets one', function () {
    const { configuration, deprecations } = upgradeConfiguration({ theme: 'default', directories: { layouts: 'pages' } });

    assert.equal(configuration.theme, 'default');
    assert.equal(configuration.baseDir, '.');
    assert.match(deprecations[0].message, /Set baseDir: '\.' to keep it that way/);
  });

  it('should read the old places of the API layout and of the code highlighting', function () {
    const createUrl = (path) => path;
    const { configuration, deprecations } = upgradeConfiguration({
      apidocs: { source: './lib', layout: 'api.ejs', createUrl },
      markdown: { options: { breaks: true, syntaxHighlight: { theme: { light: 'github-light' } } } }
    });

    assert.deepEqual(configuration.apidocs, { source: './lib', layoutName: 'api.ejs', createUrl });
    assert.deepEqual(configuration.markdown, { options: { breaks: true }, syntaxHighlight: { theme: { light: 'github-light' } } });
    assert.deepEqual(keys(deprecations), ['apidocs.layout', 'markdown.options.syntaxHighlight']);
  });

  it('should leave the current settings as they are', function () {
    const website = {
      baseDir: 'postdoc',
      contentPath: 'docs',
      directories: { layouts: 'layouts', includes: 'includes' },
      apidocs: { source: '../postdoc/lib', layoutName: 'apidocs.ejs' }
    };
    const oceanstream = { baseDir: '.', theme: 'default', apidocs: false, directories: { layouts: 'src/layouts' } };

    for (const settings of [website, oceanstream, {}]) {
      const { configuration, deprecations } = upgradeConfiguration(settings);

      assert.deepEqual(configuration, settings);
      assert.deepEqual(deprecations, []);
    }

    assert.deepEqual(upgradeConfiguration(undefined), { configuration: undefined, deprecations: [] });
  });

  it('should not change the settings it is given', function () {
    const settings = { directories: { content: 'docs', layouts: 'pages' }, apidocs: { layout: 'api.ejs' } };
    const copy = structuredClone(settings);

    upgradeConfiguration(settings);

    assert.deepEqual(settings, copy);
  });
});
