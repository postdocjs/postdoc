describe("import", function () {
  test("heading and quote should be visible", function (browser) {
    const import = browser.page.postdoc.import.index();

    import
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});