import { test, expect } from "@playwright/test";
import {
  emptyWorkspace,
  type Command,
  type SimpleEntry,
} from "../../src/lib/domain/types";

test.use({ serviceWorkers: "block" });

test("saved entry survives origin rejection and syncs once after configuration is corrected", async ({
  page,
}) => {
  const org = "00000000-0000-4000-8000-000000000002";
  const workspace = emptyWorkspace(org);
  let configured = false;
  const requests: Command[] = [];
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        configured: true,
        session: {
          user_id: "sync-worker",
          email: "sync@example.test",
          org_id: org,
          role: "owner",
          permissions: {},
          demo: false,
        },
      },
    }),
  );
  await page.route("**/api/workspace?*", (route) =>
    route.fulfill({ json: workspace }),
  );
  await page.route("**/api/commands", async (route) => {
    const command = route.request().postDataJSON() as Command;
    requests.push(command);
    if (!configured) {
      await route.fulfill({
        status: 403,
        json: { error: "FORBIDDEN: Invalid request origin" },
      });
      return;
    }
    const entry = {
      ...command.payload,
      org_id: org,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      deleted: false,
    } as unknown as SimpleEntry;
    workspace.simple_entries = [entry];
    workspace.simple_stock = [
      {
        id: entry.id,
        code: "TEST",
        name: entry.name,
        color: entry.color,
        color_hex: entry.color_hex,
        form: "grinding_flakes",
        qc: "pass",
        quantity: entry.quantity,
      },
    ];
    workspace.stock_totals = { grinding: entry.quantity };
    await route.fulfill({ json: { id: entry.id, status: "saved" } });
  });
  await page.goto("/");
  await page
    .getByLabel("Device passphrase", { exact: true })
    .fill("sync-test-passphrase");
  await page
    .getByRole("button", { name: "Unlock device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Grinding output", exact: true })
    .click();
  await page
    .getByLabel("Material name (optional)")
    .fill("Recoverable grinding");
  await page.getByLabel("Bags 1", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.locator(".simple-sync")).toHaveText("Needs attention");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Recoverable grinding", exact: true }),
  ).toBeVisible();
  configured = true;
  await page.locator(".simple-sync").click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByText("Everything is up to date", { exact: true }),
  ).toBeVisible();
  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(new Set(requests.map((command) => command.id)).size).toBe(1);
  expect(
    new Set(requests.map((command) => JSON.stringify(command.payload))).size,
  ).toBe(1);
  await page.reload();
  await expect(page.locator(".simple-sync")).toHaveText("Saved");
  await expect(
    page.locator(".simple-total").filter({ hasText: "Grinding" }),
  ).toContainText("100");
  await expect(
    page.getByRole("heading", { name: "Recoverable grinding", exact: true }),
  ).toHaveCount(1);
});
