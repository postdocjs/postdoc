import assert from 'node:assert/strict';

import { checkNightwatchVersion, selectPagesToCheck, splitNightwatchOptions } from '../../../lib/commands/test.js';

describe('The test command', function () {
  it('should refuse Nightwatch 2, and warn about Nightwatch 3 before 3.15', function () {
    // nightwatch-examples brings in Nightwatch 2, which then sits in the project.
    assert.equal(checkNightwatchVersion('2.6.19').level, 'error');
    assert.match(checkNightwatchVersion('2.6.19').message, /needs Nightwatch 3 or newer, and the project has 2\.6\.19/);
    assert.equal(checkNightwatchVersion('3.0.0').level, 'warning');
    assert.equal(checkNightwatchVersion('3.14.2').level, 'warning');
    assert.equal(checkNightwatchVersion('3.15.0'), null);
    assert.equal(checkNightwatchVersion('3.16.0'), null);
    assert.equal(checkNightwatchVersion('4.0.0-beta.1'), null);
    assert.equal(checkNightwatchVersion(undefined), null);
  });

  it('should leave the options that choose tests and reports out of the page checks\' run', function () {
    const options = [
      '--env', 'chrome,firefox', '--tag', 'smoke', '--filter=**/*.spec.js', '-r', 'junit', '--output', 'reports',
      '--config', './nightwatch.conf.js', '--headless', '--timeout', '5000', 'test/login.js', '--watch', '--verbose'
    ];
    const { projectOptions, pageCheckOptions } = splitNightwatchOptions(options);

    assert.deepEqual(pageCheckOptions, ['--env', 'chrome,firefox', '--headless', '--timeout', '5000', '--verbose']);
    assert.deepEqual(projectOptions, options.filter((option) => option !== '--watch'));
  });

  it('should check only PostDoc\'s pages, and say which other HTML files it left out', function () {
    const builtUrls = ['/__playground/index.html', '/api/click.html', '/guide/intro.html', '/index.html', '/legacy/old.html'];
    const pageUrls = ['/api/click.html', '/guide/intro.html', '/index.html', '/legacy/old.html'];

    assert.deepEqual(selectPagesToCheck(builtUrls, pageUrls, { ignore: ['/legacy/**'] }), {
      pages: ['/api/click.html', '/guide/intro.html', '/index.html'],
      skipped: ['/__playground/index.html']
    });
    assert.deepEqual(selectPagesToCheck(builtUrls, pageUrls, { only: ['/guide/**'] }), {
      pages: ['/guide/intro.html'],
      skipped: []
    });
  });
});
