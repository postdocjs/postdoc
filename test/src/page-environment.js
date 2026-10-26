import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir } from 'node:process';

import Configuration from '../../lib/configuration.js';
import PageEnvironment from '../../lib/page-environment.js';
import { getDeprecations } from '../../lib/deprecations.js';

describe('The variables of layouts', function () {
  const rootDirectory = process.cwd();

  let tmpDir;

  beforeEach(async function () {
    tmpDir = await mkdtemp(join(tmpdir(), '.postdoc-environment-'));
    chdir(tmpDir);
    await writeFile('package.json', '{"type":"module"}', 'utf-8');
    await writeFile('helper.js', 'export const greeting = "Hello";', 'utf-8');
    await Configuration.initialise({});
  });

  afterEach(async function () {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should still import modules with _import, as 0.3.0-preview4 did, and record it once', async function () {
    const layoutFilePath = join(process.cwd(), 'layouts', 'index.ejs');
    const environment = new PageEnvironment(layoutFilePath, '/index.html', '', []);

    // Includes get only the own properties of the environment.
    assert.ok(Object.hasOwn(environment, '_import'));
    assert.ok(Object.hasOwn(environment, 'importModule'));

    assert.equal((await environment._import('../helper.js')).greeting, 'Hello');
    assert.equal((await environment.importModule('../helper.js')).greeting, 'Hello');
    await environment._import('../helper.js');

    const deprecations = getDeprecations();

    assert.deepEqual(deprecations.map(({ key }) => key), ['_import']);
    assert.match(deprecations[0].message, /_import\(\) is now importModule\(\).+layouts\/index\.ejs/);
  });
});
