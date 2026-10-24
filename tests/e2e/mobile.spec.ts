import { test, expect } from "@playwright/test";
for (const width of [320, 390])
  test(`simple stock and entry fit a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore the demo factory" })
      .click();
    await expect(
      page.getByRole("heading", { name: "What’s in stock" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/simple-home-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Grinding output", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    expect((await dialog.boundingBox())!.width).toBe(width);
    await expect(page.getByLabel("Bags 1", { exact: true })).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({ path: `test-results/simple-entry-${width}.png` });
    await page
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    for (const name of ["Stock", "Entries"]) {
      await page.getByRole("link", { name, exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  });
