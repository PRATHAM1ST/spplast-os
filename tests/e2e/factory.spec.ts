import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await expect(
    page.getByRole("heading", { name: "What’s in stock" }),
  ).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".simple-sync")).toHaveText("Saved");
}
test("output-only create edit delete and reload maintain stock", async ({
  page,
}) => {
  await enter(page);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveText(["Home", "Stock", "Entries"]);
  const grinding = page
    .locator(".simple-total")
    .filter({ hasText: "Grinding" });
  await expect(grinding).toContainText("170");
  await page
    .getByRole("button", { name: "Grinding output", exact: true })
    .click();
  await expect(
    page.getByLabel(/Shift|Machine|Storage location|Operator|Actual start/),
  ).toHaveCount(0);
  await page.getByLabel("Material name (optional)").fill("Test grinding");
  await page.getByLabel("Bags 1", { exact: true }).fill("4");
  await save(page);
  await expect(grinding).toContainText("270");
  await page.reload();
  await page
    .getByRole("button", { name: "Edit Test grinding", exact: true })
    .click();
  await page.getByLabel("Bags 1", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(grinding).toContainText("320");
  await expect(page.locator(".simple-sync")).toHaveText("Saved");
  await page
    .getByRole("button", { name: "Delete Test grinding", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".simple-sync")).toHaveText("Saved");
  await page.reload();
  await expect(grinding).toContainText("170");
  await expect(
    page.getByRole("heading", { name: "Test grinding", exact: true }),
  ).toHaveCount(0);
});
test("scrap trading and sale deletion restore the selected stock", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "Scrap in", exact: true }).click();
  await page.getByLabel("Material name (optional)").fill("Trading scrap");
  await page.getByLabel("Bags 1", { exact: true }).fill("4");
  await save(page);
  await page.getByRole("link", { name: "Stock", exact: true }).click();
  const row = page
    .locator(".simple-stock-row")
    .filter({ hasText: "Trading scrap" });
  await expect(row).toContainText("100 kg");
  await row.getByRole("button", { name: "Sell", exact: true }).click();
  await page.getByLabel("Bags 1", { exact: true }).fill("1");
  await save(page);
  await expect(row).toContainText("75 kg");
  await page.getByRole("link", { name: "Entries", exact: true }).click();
  const sale = page
    .locator(".simple-entry-row")
    .filter({ hasText: "Material sold" })
    .filter({ hasText: "Trading scrap" });
  await sale
    .getByRole("button", { name: "Delete Trading scrap", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".simple-sync")).toHaveText("Saved");
  await page.getByRole("link", { name: "Stock", exact: true }).click();
  await expect(row).toContainText("100 kg");
});
test("granules optionally consume grinding without timing or machine fields", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Grinding output", exact: true })
    .click();
  await page.getByLabel("Material name (optional)").fill("Feed grinding");
  await page.getByLabel("Bags 1", { exact: true }).fill("4");
  await save(page);
  await page
    .getByRole("button", { name: "Granules output", exact: true })
    .click();
  await page.getByLabel("Material name (optional)").fill("Finished granules");
  await page.getByRole("button", { name: "30 kg bags", exact: true }).click();
  await page.getByLabel("Bags 1", { exact: true }).fill("3");
  await page
    .getByText("Also record material used (optional)", { exact: true })
    .click();
  const option = await page
    .getByLabel("Input material", { exact: true })
    .locator("option")
    .filter({ hasText: "Feed grinding" })
    .getAttribute("value");
  await page
    .getByLabel("Input material", { exact: true })
    .selectOption(option!);
  await page.getByLabel("Input used (kg)", { exact: true }).fill("100");
  await save(page);
  await page.getByRole("link", { name: "Stock", exact: true }).click();
  await expect(
    page.locator(".simple-stock-row").filter({ hasText: "Feed grinding" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".simple-stock-row").filter({ hasText: "Finished granules" }),
  ).toContainText("90 kg");
});
