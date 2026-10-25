import "fake-indexeddb/auto";
import { beforeEach, afterAll, expect, test, vi } from "vitest";
import {
  local,
  unlock,
  seal,
  open,
  lock,
  rememberToday,
  restoreToday,
  forgetUnlock,
  endOfToday,
} from "@/lib/offline/vault";
import { synchronize, retryDelay } from "@/lib/offline/sync";
beforeEach(async () => {
  lock();
  await local.rows.clear();
  await local.keys.clear();
  await local.remembered.clear();
  vi.stubGlobal("navigator", { onLine: true });
  await unlock("worker", "correct-device-passphrase");
  await seal("worker:session", "session", { hello: "private" }, "synced");
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await local.delete();
});
test("local records are ciphertext and a different user cannot unlock them", async () => {
  const row = await seal("secret", "draft", { recipe: "secret formula" });
  expect(new TextDecoder().decode(row.encrypted)).not.toContain(
    "secret formula",
  );
  lock();
  await unlock("another-worker", "correct-device-passphrase");
  await expect(open(row)).rejects.toThrow("locked");
});
test("wrong device passphrase fails", async () => {
  lock();
  await expect(unlock("worker", "wrong-passphrase")).rejects.toThrow(
    "Incorrect",
  );
});
test("daily unlock survives a reload without storing an exportable key or passphrase", async () => {
  await rememberToday();
  const saved = await local.remembered.get("worker");
  expect(saved?.key.extractable).toBe(false);
  expect(saved?.expires).toBe(endOfToday());
  expect(JSON.stringify(saved)).not.toContain("correct-device-passphrase");
  lock();
  expect(await restoreToday("worker")).toBe(true);
  expect(await open((await local.rows.get("worker:session"))!)).toEqual({
    hello: "private",
  });
});
test("daily unlock cannot restore another user and expires at midnight", async () => {
  await rememberToday();
  lock();
  expect(await restoreToday("another-worker")).toBe(false);
  await local.remembered.update("worker", { expires: Date.now() - 1 });
  expect(await restoreToday("worker")).toBe(false);
  expect(await local.remembered.get("worker")).toBeUndefined();
});
test("explicit sign out removes today's remembered unlock", async () => {
  await rememberToday();
  await forgetUnlock("worker");
  lock();
  expect(await restoreToday("worker")).toBe(false);
});
test("corrupted remembered keys fall back to a passphrase without deleting drafts", async () => {
  const draft = await seal("draft", "draft", { weight: "100" });
  await rememberToday();
  const wrongKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await local.remembered.update("worker", { key: wrongKey });
  lock();
  expect(await restoreToday("worker")).toBe(false);
  await unlock("worker", "correct-device-passphrase");
  expect(await open(draft)).toEqual({ weight: "100" });
});
test("offline capture remains local and retries with the same command ID exactly once", async () => {
  const id = crypto.randomUUID();
  await seal(id, "queue", {
    id,
    org_id: crypto.randomUUID(),
    action: "save_batch",
    payload: {},
  });
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ status: "saved" })));
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("navigator", { onLine: false });
  await synchronize("worker", () => {});
  expect(fetch).not.toHaveBeenCalled();
  vi.stubGlobal("navigator", { onLine: true });
  await synchronize("worker", () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).id).toBe(id);
  await synchronize("worker", () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await local.rows.get(id)).toBeUndefined();
});
test("conflict is retained, never silently overwritten", async () => {
  const id = crypto.randomUUID();
  await seal(id, "queue", {
    id,
    org_id: crypto.randomUUID(),
    action: "save_batch",
    payload: {},
  });
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: "CONFLICT: changed on server" }), {
      status: 409,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await synchronize("worker", () => {});
  expect((await local.rows.get(id))?.state).toBe("conflict");
  await synchronize("worker", () => {}, undefined, true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("origin setup failures retry after configuration is fixed", async () => {
  const id = crypto.randomUUID();
  await seal(id, "queue", {
    id,
    org_id: crypto.randomUUID(),
    action: "save_entry",
    payload: {},
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "FORBIDDEN: Invalid request origin" }),
        { status: 403 },
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "saved" })));
  vi.stubGlobal("fetch", fetch);
  await synchronize("worker", () => {});
  expect((await local.rows.get(id))?.state).toBe("failed");
  await synchronize("worker", () => {}, undefined, true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await local.rows.get(id)).toBeUndefined();
});

test("old origin failures marked as conflicts recover without deleting the saved entry", async () => {
  const id = crypto.randomUUID();
  await seal(id, "queue", {
    id,
    org_id: crypto.randomUUID(),
    action: "save_entry",
    payload: {},
  });
  await local.rows.update(id, {
    state: "conflict",
    error: "FORBIDDEN: Invalid request origin",
  });
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ status: "saved" })));
  vi.stubGlobal("fetch", fetch);
  await synchronize("worker", () => {}, undefined, true);
  expect(JSON.parse(fetch.mock.calls[0][1].body).id).toBe(id);
  expect(await local.rows.get(id)).toBeUndefined();
});

test("permission denials still require review instead of automatic retries", async () => {
  const id = crypto.randomUUID();
  await seal(id, "queue", {
    id,
    org_id: crypto.randomUUID(),
    action: "save_entry",
    payload: {},
  });
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403 }),
    );
  vi.stubGlobal("fetch", fetch);
  await synchronize("worker", () => {});
  expect((await local.rows.get(id))?.state).toBe("conflict");
  await synchronize("worker", () => {}, undefined, true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
test("failed photograph does not show as backed up", async () => {
  const id = crypto.randomUUID();
  await seal(id, "photo", {
    id,
    org_id: crypto.randomUUID(),
    record_id: crypto.randomUUID(),
    record_type: "batch",
    caption: "",
    category: "material",
    data: btoa("image bytes"),
    type: "image/webp",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Storage unavailable" }), {
        status: 503,
      }),
    ),
  );
  await synchronize("worker", () => {});
  const row = await local.rows.get(id);
  expect(row?.state).toBe("failed");
  expect(row?.attempts).toBe(1);
  expect((await open<{ data: string }>(row!)).data).toBe(btoa("image bytes"));
});
test("retry backoff is bounded", () => {
  expect(retryDelay(1)).toBe(2000);
  expect(retryDelay(20)).toBe(300000);
});
test("successful commands remain pending until the refreshed version is available", async () => {
  const id = crypto.randomUUID();
  await seal(id, "queue", {
    id,
    org_id: crypto.randomUUID(),
    action: "save_entry",
    payload: {},
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: "saved" }))),
  );
  let refreshed = false;
  await synchronize("worker", async () => {
    expect(await local.rows.get(id)).toBeDefined();
    await Promise.resolve();
    refreshed = true;
  });
  expect(refreshed).toBe(true);
  expect(await local.rows.get(id)).toBeUndefined();
});
