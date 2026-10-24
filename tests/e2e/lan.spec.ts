import { test, expect } from "@playwright/test";

const host = process.env.TEST_LAN_HOST;
test.use({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
test.skip(
  !host,
  "Set TEST_LAN_HOST and run npm run dev:phone to exercise a real LAN origin.",
);

test("LAN HTTP displays recovery instead of a startup crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://${host}:3000`);
  await expect(
    page.getByRole("heading", { name: "Use the secure address." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open secure phone preview" }),
  ).toHaveAttribute("href", `https://${host}:3443/`);
  expect(errors).toEqual([]);
});

test("HTTPS phone preview unlocks encrypted storage and retains a bag draft", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`https://${host}:3443`);
  expect(
    await page.evaluate(() => window.isSecureContext && !!crypto.subtle),
  ).toBe(true);
  await page.getByRole("button", { name: "Explore the demo factory" }).click();
  await expect(
    page.getByRole("heading", { name: "What’s in stock" }),
  ).toBeVisible({ timeout: 90000 });
  await page
    .getByRole("button", { name: "Grinding output", exact: true })
    .click();
  await page.getByRole("button", { name: "30 kg bags", exact: true }).click();
  await page.getByLabel("Bags 1", { exact: true }).fill("18");
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await page
    .getByRole("button", { name: "Grinding output", exact: true })
    .click();
  await expect(page.locator(".simple-weight-total")).toContainText("540");
  await page.screenshot({ path: "test-results/phone-https-390.png" });
  expect(errors).toEqual([]);
});
