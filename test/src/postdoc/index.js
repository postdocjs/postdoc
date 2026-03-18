describe("postdoc", function () {
  test("heading and quote should be visible", function (browser) {
    const postdoc = browser.page.postdoc.index();

    postdoc
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});