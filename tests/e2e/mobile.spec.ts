import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await expect(
    page.getByRole("heading", { name: "Your factory, in focus." }),
  ).toBeVisible({ timeout: 90000 });
}
test("phone layouts prioritize actions, readable cards and full-screen entry", async ({
  page,
}) => {
  await enter(page, 390);
  const grinding = page.getByRole("button", {
    name: "Grinding entry",
    exact: true,
  });
  const actionBox = await grinding.boundingBox();
  expect(actionBox!.height).toBeGreaterThanOrEqual(90);
  expect(actionBox!.y + actionBox!.height).toBeLessThan(500);
  await expect(
    page.getByRole("button", { name: "Trends & machine output" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: "test-results/mobile-home-390.png" });
  await grinding.click();
  const dialog = page.getByRole("dialog");
  const box = await dialog.boundingBox();
  expect(box!.width).toBe(390);
  expect(box!.height).toBe(844);
  await expect(page.getByLabel("Machine", { exact: true })).toBeVisible();
  const source = page.getByLabel("Source lot", { exact: true });
  await source.scrollIntoViewIfNeeded();
  const inputBox = await source.boundingBox();
  expect(inputBox!.height).toBeGreaterThanOrEqual(48);
  expect(inputBox!.width).toBeGreaterThan(300);
  await page.screenshot({ path: "test-results/mobile-production-390.png" });
  await page
    .getByLabel("Shift", { exact: true })
    .selectOption({ label: "Demo day shift" });
  await page
    .getByLabel("Machine", { exact: true })
    .selectOption({ label: "Demo grinder 01" });
  const raw = (await source.locator("option").allTextContents()).find((s) =>
    s.startsWith("RAW-"),
  )!;
  await source.selectOption({ label: raw });
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
    .fill("Measured dust");
  const code = await page
    .getByLabel("Batch identifier", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Save production draft", exact: true })
    .click();
  await page
    .locator(".mobile-nav")
    .getByRole("link", { name: "Production", exact: true })
    .click();
  await expect(page.getByText(code, { exact: true })).toBeVisible();
  await page
    .locator(".mobile-nav")
    .getByRole("link", { name: "Stock", exact: true })
    .click();
  await expect(page.locator(".responsive-table tbody tr").first()).toHaveCSS(
    "display",
    "grid",
  );
  await expect(
    page.getByRole("columnheader", { name: "BOOK STOCK" }),
  ).toBeAttached();
  await page.screenshot({
    path: "test-results/mobile-stock-390.png",
    fullPage: true,
  });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "More", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Color lab", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Consistency, by design." }),
  ).toBeVisible();
});
test("all operational screens fit a small 320px phone without horizontal page scrolling", async ({
  page,
}) => {
  test.setTimeout(180000);
  await enter(page, 320);
  for (const route of [
    "production",
    "inventory",
    "calculator",
    "color-lab",
    "job-work",
    "dispatch",
    "gallery",
    "machines",
    "quality",
    "reports",
    "settings",
    "sync",
  ]) {
    await page.goto(`/${route}`);
    await expect(page.locator("#main h1")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${route} should fit the phone`,
    ).toBeLessThanOrEqual(320);
    if (route === "calculator") {
      await page.getByRole("button", { name: "+ 30 kg", exact: true }).click();
      await page.getByLabel("Bag count 1", { exact: true }).fill("18");
      await expect(page.getByTestId("bag-total")).toContainText("540");
      await page.screenshot({
        path: "test-results/mobile-calculator-320.png",
        fullPage: true,
      });
    }
  }
});
