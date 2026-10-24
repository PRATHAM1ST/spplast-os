import { test, expect } from "@playwright/test";
import { emptyWorkspace } from "../../src/lib/domain/types";

// This test mocks authentication. Service-worker requests bypass page.route;
// offline/service-worker behaviour is covered separately in offline.spec.ts.
test.use({ serviceWorkers: "block" });

test("device asks once today, restores after reload, and asks again after expiry", async ({
  page,
}) => {
  const org = "00000000-0000-4000-8000-000000000001";
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        configured: true,
        session: {
          user_id: "daily-worker",
          email: "worker@example.test",
          org_id: org,
          role: "owner",
          permissions: {},
          demo: false,
        },
      },
    }),
  );
  await page.route("**/api/workspace?*", (route) =>
    route.fulfill({ json: emptyWorkspace(org) }),
  );
  await page.goto("/");
  await page
    .getByLabel("Device passphrase", { exact: true })
    .fill("test-device-passphrase");
  await page
    .getByRole("button", { name: "Unlock device", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What’s in stock" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "What’s in stock" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Device passphrase", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("spplast-local-v1");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("remembered", "readwrite");
        const store = tx.objectStore("remembered");
        const get = store.get("daily-worker");
        get.onsuccess = () =>
          store.put({ ...get.result, expires: Date.now() - 1 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  });
  await page.reload();
  await expect(
    page.getByLabel("Device passphrase", { exact: true }),
  ).toBeVisible();
});
