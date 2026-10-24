import { test, expect } from "@playwright/test";
test("installed simple app reopens offline with an unfinished bag entry", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.TEST_PRODUCTION,
    "Service worker is enabled in production builds only",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await expect(
    page.getByRole("heading", { name: "What’s in stock" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Grinding output", exact: true })
    .click();
  await page.getByLabel("Bags 1", { exact: true }).fill("18");
  await page.getByRole("button", { name: "30 kg bags", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open("spplast-local-v1");
            req.onsuccess = () => {
              const db = req.result;
              const r = db
                .transaction("rows")
                .objectStore("rows")
                .get("demo-owner:simple-draft:grinding");
              r.onsuccess = () => {
                db.close();
                resolve(!!r.result);
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Grinding output", exact: true })
    .click();
  await expect(page.getByLabel("Bags 1", { exact: true })).toHaveValue("18");
  await expect(page.locator(".simple-weight-total")).toContainText("540 kg");
  await context.setOffline(false);
  await expect(page.getByRole("dialog")).toBeVisible();
});
