import assert from 'node:assert/strict';

import { formatSummary, groupProblems } from '../../lib/page-checks-report.js';

describe('Page checks report', function () {
  const footerLink = { check: 'keyboard', message: 'Keyboard: Links that go nowhere (1)', elements: ['footer a ("Twitter"): href="#"'], link: null };
  const problems = [
    { ...footerLink, page: '/a.html', width: 1280 },
    { ...footerLink, page: '/a.html', width: 390 },
    { ...footerLink, page: '/b.html', width: 1280 },
    { check: 'accessibility', message: 'aXe rule image-alt (critical)', elements: ['img'], link: null, page: '/b.html', width: 390 }
  ];
  const plain = { red: (text) => text, dim: (text) => text };

  it('should group a problem that is on several pages', function () {
    const groups = groupProblems(problems);

    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0].pages, [
      { page: '/a.html', width: 1280 },
      { page: '/a.html', width: 390 },
      { page: '/b.html', width: 1280 }
    ]);
  });

  it('should print each problem once, with where it was found', function () {
    assert.equal(formatSummary(groupProblems(problems), plain), [
      'Page checks: 2 problems',
      '',
      '  ✖ Keyboard: Links that go nowhere (1)',
      '      footer a ("Twitter"): href="#"',
      '    on 2 pages at 1280px and 390px: /a.html, /b.html',
      '',
      '  ✖ aXe rule image-alt (critical)',
      '      img',
      '    on /b.html at 390px'
    ].join('\n'));
  });
});
