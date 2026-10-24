/**
 * A page test for the guide page. Each file in `test/pages` describes one page of the
 * site, and the Nightwatch plugin for PostDoc turns it into a test suite.
 *
 * - The default export is a Nightwatch page object: the page's `url` and its `elements`.
 * - `a11y` adds an accessibility test of the page, with aXe and these settings.
 * - `before`, `after`, `beforeEach` and `afterEach` hooks can be added to the default export.
 * - Every other exported function is a test case. It receives the page object as `page`,
 *   its elements as `element` and `browser`.
 *
 * The page is opened, and PostDoc has finished rendering it, before the first test case runs.
 *
 * Read more about page objects on the Nightwatch website:
 * https://nightwatchjs.org/guide/concepts/page-object-model.html
 */
export default {
  url: '/guide/index.html',

  a11y: {
    selector: 'body',
    config: {
      // WCAG 2.0, 2.1 and 2.2, levels A and AA
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
      }
    }
  },

  elements: {
    content: '#content',
    part1Heading: {
      selector: '//h2[text()="Part 1"]',
      locateStrategy: 'xpath'
    }
  }
};

export const contentIsVisible = function ({element}) {
  element('@content').assert.visible();
  element('@part1Heading').assert.visible();
};
