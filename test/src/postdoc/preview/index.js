describe("preview", function () {
  test("heading and quote should be visible", function (browser) {
    const preview = browser.page.postdoc.preview.index();

    preview
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});