describe("build", function () {
  test("heading and quote should be visible", function (browser) {
    const build = browser.page.postdoc.build.index();

    build
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});