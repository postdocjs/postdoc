import assert from 'node:assert/strict';

import { navigationManagerScript } from '../../lib/page.js';

const ASSIGNMENT_RE = /Object\.assign\(globalThis\.PostDoc\.configuration, (.+)\);session\.init\(\);<\/script>$/s;

function evaluateClientConfiguration(script) {
  const [, expression] = ASSIGNMENT_RE.exec(script);

  return new Function(`return ${expression};`)();
}

describe('Navigation manager script', function () {
  it('should only ship the session settings and the search index\'s folder to the client', function () {
    const script = navigationManagerScript({
      session: { disable_spa: false, enable_prefetch: true },
      pagefind: { enabled: true, outputDir: 'search', ranking: { termFrequency: 1 } },
      appSettings: { apiKey: 'secret' },
      _resolvedThemePaths: { root: '/Users/someone/theme' }
    });

    assert.deepEqual(evaluateClientConfiguration(script), {
      session: { disable_spa: false, enable_prefetch: true },
      pagefind: { outputDir: 'search' }
    });
    assert.ok(!script.includes('secret'));
    assert.ok(!script.includes('/Users/someone'));
  });

  it('should embed values with quotes, backslashes and closing script tags', function () {
    const session = {
      label: 'What\'s "new"',
      path: 'C:\\Users\\dev\\theme',
      html: '</script><script>alert(1)</script>'
    };
    const script = navigationManagerScript({ session });

    assert.deepEqual(evaluateClientConfiguration(script), { session });
    assert.equal(script.indexOf('</script>'), script.length - '</script>'.length);
  });
});
