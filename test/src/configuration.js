import { join } from 'node:path';
import { chdir } from 'node:process';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';

import Configuration, { resolveLayoutsDirectory } from '../../lib/configuration.js';
import { getDeprecations } from '../../lib/deprecations.js';

describe('Configuration module', function () {
  const rootDirectory = process.cwd();

  let tmpDir;
  beforeEach(async function (done) {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-doc'));
    chdir(tmpDir);
    done();
  });

  afterEach(async function (done) {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
    done();
  });

  describe('files priority', function () {
    it('should load the ES module config file at first', async function () {
      await writeFile(
        'postdoc.config.mjs',
        'export default {appSettings: {base: \'/root1\'}}',
        'utf-8'
      );
      await writeFile(
        'postdoc.config.cjs',
        'module.exports = {appSettings: {base: \'/root2\'}}',
        'utf-8'
      );
      await writeFile(
        'postdoc.config.js',
        'module.exports = {appSettings: {base: \'/root3\'}}',
        'utf-8'
      );
      await writeFile(
        'postdoc.json',
        '{"appSettings": {"base": "/root4"}}',
        'utf-8'
      );
      await writeFile('package.json', '{"name":"testing-file"}', 'utf-8');

      await Configuration.initialise({});

      const configuration = Configuration.get();

      assert.equal(configuration.appSettings.base, '/root1');
    });

    it('should load CommonJS config if ES module is absent', async function () {
      await writeFile(
        'postdoc.config.cjs',
        'module.exports = {appSettings: {base: \'/root2\'}}',
        'utf-8'
      );
      await writeFile(
        'postdoc.config.js',
        'module.exports = {appSettings: {base: \'/root3\'}}',
        'utf-8'
      );
      await writeFile(
        'postdoc.json',
        '{"appSettings": {"base": "/root4"}}',
        'utf-8'
      );
      await writeFile('package.json', '{"name":"testing-file"}', 'utf-8');

      await Configuration.initialise({});

      const configuration = Configuration.get();

      assert.equal(configuration.appSettings.base, '/root2');
    });

    it('should load CommonJS config if package.json does not contain type: module', async function () {
      await writeFile(
        'postdoc.config.js',
        'module.exports = {appSettings: {base: \'/root3\'}}',
        'utf-8'
      );
      await writeFile(
        'postdoc.json',
        '{"appSettings": {"base": "/root4"}}',
        'utf-8'
      );
      await writeFile('package.json', '{"name":"testing-file"}', 'utf-8');

      await Configuration.initialise({});

      const configuration = Configuration.get();

      assert.equal(configuration.appSettings.base, '/root3');
    });

    it('should load the config as ES module if package.json contains the type: module', async function () {
      await writeFile(
        'postdoc.config.js',
        'export default {appSettings: {base: \'/root3\'}}',
        'utf-8'
      );
      await writeFile(
        'postdoc.json',
        '{"appSettings": {"base": "/root4"}}',
        'utf-8'
      );
      await writeFile(
        'package.json',
        '{"name":"testing-file", "type": "module"}',
        'utf-8'
      );

      await Configuration.initialise({});

      const configuration = Configuration.get();

      assert.equal(configuration.appSettings.base, '/root3');
    });

    it('should load JSON config if no other types are present', async function () {
      await writeFile(
        'postdoc.json',
        '{"appSettings": {"base": "/root4"}}',
        'utf-8'
      );
      await writeFile(
        'package.json',
        '{"name":"testing-file", "type": "module"}',
        'utf-8'
      );

      await Configuration.initialise({});

      const configuration = Configuration.get();

      assert.equal(configuration.appSettings.base, '/root4');
    });
  });

  describe('Settings of 0.3.0-preview4', function () {
    it('should be read as the current ones, and recorded as deprecations', async function () {
      await writeFile(
        'postdoc.config.js',
        'export default {directories: {content: "./docs", output: "./out", layouts: "src/pages", includes: "src/includes"}, ' +
          'apidocs: {source: "./lib", layout: "api/index.ejs"}}',
        'utf-8'
      );
      await writeFile('package.json', '{"type":"module"}', 'utf-8');

      await Configuration.initialise({});

      const configuration = Configuration.get();

      assert.equal(configuration.contentPath, './docs');
      assert.equal(configuration.outputPath, './out');
      assert.equal(configuration.baseDir, '.');
      assert.equal(configuration.theme, null);
      assert.equal(configuration._resolvedThemePaths, null);
      assert.equal(resolveLayoutsDirectory(configuration), join(process.cwd(), 'src', 'pages'));
      assert.equal(configuration.apidocs.layoutName, 'api/index.ejs');
      assert.equal('layout' in configuration.apidocs, false);
      assert.deepEqual(getDeprecations().map(({ key }) => key), ['directories.content', 'directories.output', 'baseDir', 'apidocs.layout']);
    });

    it('should leave no deprecations of an earlier configuration', async function () {
      await writeFile('postdoc.config.js', 'export default {baseDir: "."}', 'utf-8');
      await writeFile('package.json', '{"type":"module"}', 'utf-8');

      await Configuration.initialise({});

      assert.deepEqual(getDeprecations(), []);
    });
  });

  describe('Injecting environment variables', function () {
    it('should replace the interpolation pattern with an environment variable with the pattern as the name', async function () {
      await writeFile(
        'postdoc.config.js',
        'export default {appSettings: {base: "${PROP_ENV}"}}',
        'utf-8'
      );
      await writeFile('package.json', '{"type":"module"}', 'utf-8');

      await Configuration.initialise({
        PROP_ENV: 'secret root'
      });

      const configuration = Configuration.get();

      assert.equal(configuration.appSettings.base, 'secret root');
    });
  });
});
