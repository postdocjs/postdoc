describe("test", function () {
  test("heading and quote should be visible", function (browser) {
    const test = browser.page.postdoc.test.index();

    test
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});