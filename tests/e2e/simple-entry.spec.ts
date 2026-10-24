import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("photo colour and mixed bag sizes persist with a production entry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await page
    .getByRole("button", { name: "Granules output", exact: true })
    .click();
  await page.getByLabel("Material name (optional)").fill("Photo granules");
  await page.getByLabel("Bags 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Another bag size" }).click();
  await page.getByLabel("Kg per bag 2", { exact: true }).fill("30");
  await expect(page.locator(".simple-weight-total")).toContainText("80 kg");
  await page.getByText("Add photo & colour", { exact: true }).click();
  const photo = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#c93c38" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "red.png", mimeType: "image/png", buffer: photo });
  await page
    .getByRole("button", { name: /^Use photo colour Red/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".simple-sync")).toHaveText("Saved");
  await page.reload();
  const row = page
    .locator(".simple-entry-row")
    .filter({ hasText: "Photo granules" });
  await expect(row).toContainText("Red");
  await expect(row).toContainText("3 bags");
  await expect(row).toContainText("80 kg");
  await expect(row.getByRole("img", { name: "Material photo" })).toBeVisible();
});
