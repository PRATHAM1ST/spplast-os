import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("recipe can be saved using colour swatches and material selection without typing names", async ({
  page,
}) => {
  await page.goto("/color-lab");
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await page.getByRole("button", { name: "New recipe", exact: true }).click();
  await page
    .getByRole("button", { name: "Use Red #c93c38", exact: true })
    .click();
  await page.getByRole("button", { name: "Ingredient", exact: true }).click();
  await page
    .getByLabel("Inventory material", { exact: true })
    .selectOption({ index: 1 });
  await expect(
    page.getByLabel("Ingredient name", { exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Amount", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "Save experimental version", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Red PP", exact: true }),
  ).toBeVisible();
});

test("photo colour suggestions attach to a saved production entry on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await page
    .getByRole("button", { name: "Grinding entry", exact: true })
    .click();
  await expect(page.getByLabel("Operator", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Machine", { exact: true })).not.toHaveValue("");
  await page.getByText("Add photo & identify colour", { exact: true }).click();
  const photo = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#c93c38" },
  })
    .png()
    .toBuffer();
  await page.locator('input[type="file"]').setInputFiles({
    name: "red-material.png",
    mimeType: "image/png",
    buffer: photo,
  });
  await page
    .getByRole("button", { name: /^Use photo colour Red/ })
    .first()
    .click();
  await expect(page.getByText(/Selected: Red/)).toBeVisible();
  await page.screenshot({
    path: "test-results/photo-colour-mobile.png",
    fullPage: true,
  });
  await page
    .getByLabel("Source lot", { exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Consumed input (kg)", { exact: true }).fill("100");
  await page
    .getByLabel("Output material / grade", { exact: true })
    .selectOption({ label: "PP natural grinding · grinding flakes" });
  await page
    .getByLabel("Verified net output (kg)", { exact: true })
    .fill("100");
  const code = await page
    .getByLabel("Batch identifier", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Save production draft", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/gallery");
  await expect(page.getByText(/Colour reference: Red/).first()).toBeVisible();
  await page.goto("/production");
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
