import { test, expect } from "@playwright/test";
async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await expect(
    page.getByRole("heading", { name: "Your factory, in focus." }),
  ).toBeVisible({ timeout: 90000 });
}
test("dashboard, accurate calculator and persistent bag draft", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Bag calculator", exact: true }).click();
  await page.getByRole("button", { name: "+ 30 kg", exact: true }).click();
  await page.getByLabel("Bag count 1", { exact: true }).fill("18");
  await expect(page.getByTestId("bag-total")).toContainText("540");
  await page.getByRole("button", { name: "Save bag draft" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Every bag counts." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await expect(page.getByTestId("bag-total")).toContainText("540");
  expect(errors).toEqual([]);
});
test("production draft saves, submits, approves and persists through reload", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Grinding entry", exact: true })
    .click();
  await page
    .getByLabel("Shift", { exact: true })
    .selectOption({ label: "Demo day shift" });
  await page
    .getByLabel("Machine", { exact: true })
    .selectOption({ label: "Demo grinder 01" });
  await page.getByLabel("Source lot", { exact: true }).selectOption({
    label: `RAW-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).replaceAll("-", "")}-DEMO · 400 kg`,
  });
  await page.getByLabel("Consumed input (kg)", { exact: true }).fill("100");
  await page
    .getByLabel("Output material / grade", { exact: true })
    .selectOption({ label: "PP natural grinding · grinding flakes" });
  await page.getByLabel("Verified net output (kg)", { exact: true }).fill("95");
  await page
    .getByLabel("Documented process loss (kg)", { exact: true })
    .fill("5");
  await page
    .getByLabel("Loss category / explanation", { exact: true })
    .fill("Measured dust loss");
  const code = await page
    .getByLabel("Batch identifier", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Save production draft", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Production", exact: true })
    .first()
    .click();
  await expect(page.getByText(code, { exact: true })).toBeVisible();
  await page.getByText(code, { exact: true }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.locator("tr").filter({ hasText: code })).toContainText(
    "Submitted",
  );
  await page.getByText(code, { exact: true }).click();
  await page.getByRole("button", { name: "Approve & post stock" }).click();
  await expect(page.locator("tr").filter({ hasText: code })).toContainText(
    "Approved",
  );
  await page.reload();
  await expect(page.locator("tr").filter({ hasText: code })).toContainText(
    "Approved",
  );
});
test("small Android layout and navigation remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page
    .locator(".mobile-nav")
    .getByRole("link", { name: "Calculator" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every bag counts." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ 30 kg", exact: true }).click();
  await page.getByLabel("Bag count 1", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Add bag group", exact: true })
    .click();
  await page.getByLabel("Bag count 2", { exact: true }).fill("5");
  await page.getByLabel("Bag weight 2", { exact: true }).fill("28.5");
  await expect(page.getByTestId("bag-total")).toContainText("442.5");
  await page.screenshot({
    path: "test-results/calculator-mobile.png",
    fullPage: true,
  });
});
test("all operational screens load and reports export real records", async ({
  page,
}) => {
  await enter(page);
  for (const [route, title] of [
    ["inventory", "Materials & inventory"],
    ["color-lab", "Consistency, by design."],
    ["job-work", "Job work, accounted for."],
    ["dispatch", "Sales & dispatch"],
    ["gallery", "The material gallery"],
    ["machines", "On the factory floor"],
    ["quality", "A standard worth keeping."],
    ["reports", "The bigger picture."],
    ["settings", "Make it work your way."],
    ["sync", "Device & sync"],
  ]) {
    await page.goto(`/${route}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/reports");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("SP-Plast-grinding");
});
