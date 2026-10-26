import assert from 'node:assert/strict';

import { clearDeprecations, deprecate, getDeprecations, reportDeprecations } from '../../lib/deprecations.js';

describe('Deprecations', function () {
  beforeEach(function () {
    clearDeprecations();
  });

  after(function () {
    clearDeprecations();
  });

  it('should keep the first message of each key', function () {
    deprecate('_import', 'first');
    deprecate('_import', 'second');
    deprecate('apidocs.layout', 'third');

    assert.deepEqual(getDeprecations(), [
      { key: '_import', message: 'first' },
      { key: 'apidocs.layout', message: 'third' }
    ]);
  });

  it('should report the deprecations so far, and then each new one once', function () {
    const reported = [];

    deprecate('baseDir', 'before');
    reportDeprecations((key, message) => reported.push(`${key}: ${message}`));
    deprecate('_import', 'after');
    deprecate('_import', 'again');

    assert.deepEqual(reported, ['baseDir: before', '_import: after']);
  });

  it('should forget the deprecations and the reporter when cleared', function () {
    const reported = [];

    reportDeprecations((key) => reported.push(key));
    clearDeprecations();
    deprecate('_import', 'message');

    assert.deepEqual(reported, []);
    assert.deepEqual(getDeprecations(), [{ key: '_import', message: 'message' }]);
  });
});
