import assert from 'node:assert/strict';

import { findConfigurationProblems } from '../../lib/configuration.js';

describe('Configuration problems', function () {
  it('should report the directory settings of older versions', function () {
    const problems = findConfigurationProblems({ directories: { content: './docs', output: './out', layouts: 'layouts' } });

    assert.deepEqual(problems, [
      'The configuration sets directories.content, which PostDoc no longer reads. Set contentPath instead, relative to the project root.',
      'The configuration sets directories.output, which PostDoc no longer reads. Set outputPath instead, relative to the project root.'
    ]);
  });

  it('should find nothing wrong with current settings, or none', function () {
    assert.deepEqual(findConfigurationProblems({ contentPath: './docs', directories: { layouts: 'layouts' } }), []);
    assert.deepEqual(findConfigurationProblems(undefined), []);
  });
});
