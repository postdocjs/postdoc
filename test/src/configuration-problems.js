import assert from 'node:assert/strict';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { findOutputDirectoryProblem } from '../../lib/configuration.js';

describe('The output directory', function () {
  const settings = (outputPath) => ({
    outputPath,
    baseDir: 'postdoc',
    contentPath: 'docs',
    testsPath: 'test',
    directories: { layouts: 'layouts', includes: 'includes', vitePublic: 'public' }
  });

  it('should not be the project, a folder above it, or the home folder', function () {
    for (const outputPath of ['.', '..', '/', homedir()]) {
      assert.match(findOutputDirectoryProblem(settings(outputPath)) ?? '', /holds .+ a build empties it first/, outputPath);
    }
  });

  it('should not hold the pages, the layouts or the tests', function () {
    assert.match(findOutputDirectoryProblem(settings('docs')), /holds the pages/);
    assert.match(findOutputDirectoryProblem(settings('postdoc')), /holds the project's files/);
    assert.match(findOutputDirectoryProblem(settings('test')), /holds the tests/);
  });

  it('should be fine in a folder of its own', function () {
    assert.equal(findOutputDirectoryProblem(settings('out')), null);
    assert.equal(findOutputDirectoryProblem(settings(join(tmpdir(), 'site'))), null);
  });
});
