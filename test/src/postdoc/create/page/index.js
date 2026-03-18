describe("page", function () {
  test("heading and quote should be visible", function (browser) {
    const page = browser.page.postdoc.create.page.index();

    page
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});