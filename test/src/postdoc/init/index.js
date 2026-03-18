describe("init", function () {
  test("heading and quote should be visible", function (browser) {
    const init = browser.page.postdoc.init.index();

    init
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});