import { test, expect } from "@playwright/test";
test("installed shell reopens offline and retains a saved bag draft", async ({
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
    page.getByRole("heading", { name: "Your factory, in focus." }),
  ).toBeVisible({ timeout: 90000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your factory, in focus." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Bag calculator", exact: true }).click();
  await page.getByRole("button", { name: "+ 30 kg", exact: true }).click();
  await page.getByLabel("Bag count 1", { exact: true }).fill("18");
  await page.getByRole("button", { name: "Save bag draft" }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Every bag counts." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await expect(page.getByTestId("bag-total")).toContainText("540");
  await page.getByLabel("Bag count 1", { exact: true }).fill("19");
  await page.getByRole("button", { name: "Save bag draft" }).click();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await expect(page.getByTestId("bag-total")).toContainText("570");
});
