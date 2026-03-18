describe("create", function () {
  test("heading and quote should be visible", function (browser) {
    const create = browser.page.postdoc.create.index();

    create
      .navigate()
      .assert.visible("@header")
      .assert.visible("@usage");

    browser.end();
  });
});