import assert from 'node:assert/strict';

import { pageScripts } from '../../lib/page.js';

describe('Page scripts', function () {
  const configuration = { session: {} };
  const MATH_SCRIPT = 'import \'postdoc/math\';';

  it('should load the math client on a page with a formula', function () {
    const page = '<p>The area is <span class="katex"><span class="katex-mathml"></span></span>.</p>';

    assert.ok(pageScripts(configuration, page).includes(MATH_SCRIPT));
  });

  it('should load the math client on a page with a block formula', function () {
    const page = '<p><span class="katex-display"><span class="katex"></span></span></p>';

    assert.ok(pageScripts(configuration, page).includes(MATH_SCRIPT));
  });

  it('should not load the math client for KaTeX markup shown in a code block', function () {
    const page = '<pre><code>&lt;span class="katex"&gt;x&lt;/span&gt;</code></pre>';

    assert.ok(!pageScripts(configuration, page).includes(MATH_SCRIPT));
  });

  it('should always load the navigation client', function () {
    assert.ok(pageScripts(configuration, '<p>Hello</p>').includes('session.init();'));
  });
});
