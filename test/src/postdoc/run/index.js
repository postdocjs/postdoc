describe("run", function () {
  test("heading and quote should be visible", function (browser) {
    const run = browser.page.postdoc.run.index();

    run
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});