import { local, open, dataFile, type LocalRow } from "./vault";
import type { Command } from "@/lib/domain/types";
export interface QueuedPhoto {
  id: string;
  org_id: string;
  record_id: string;
  record_type: string;
  caption: string;
  category: string;
  data: string;
  type: string;
}
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function fetchJSON<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new RequestError(body.error || "Request failed", response.status);
  return body as T;
}
export const retryDelay = (attempts: number) =>
  Math.min(300000, 1000 * 2 ** Math.min(attempts, 9));
// Earlier versions held these as record conflicts. Keep the original command
// and idempotency key so a corrected deployment can safely accept the retry.
export const isOriginFailure = (message: string) =>
  message.startsWith("FORBIDDEN: Invalid request origin");
let running = false;
export async function synchronize(
  user: string,
  onChange: () => void | Promise<void>,
  demo?: (c: Command) => Promise<unknown>,
  force = false,
) {
  if (running || (!navigator.onLine && !demo)) return;
  running = true;
  try {
    const rows = await local.rows
      .where("user")
      .equals(user)
      .filter(
        (r) => ["queue", "photo"].includes(r.kind) && r.state !== "synced",
      )
      .sortBy("order");
    for (const row of rows) {
      if (
        (row.state === "conflict" && !isOriginFailure(row.error)) ||
        (!force && row.retryAt > Date.now())
      )
        break;
      try {
        if (row.kind === "queue") {
          const command = await open<Command>(row);
          if (demo) await demo(command);
          else
            await fetchJSON("/api/commands", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(command),
            });
        } else {
          const photo = await open<QueuedPhoto>(row);
          if (demo) {
            await demo({
              id: photo.id,
              org_id: photo.org_id,
              action: "media",
              payload: {
                id: photo.id,
                record_id: photo.record_id,
                record_type: photo.record_type,
                caption: photo.caption,
                category: photo.category,
                path: `${photo.org_id}/${photo.record_id}/${photo.id}`,
                thumbnail_path: `${photo.org_id}/${photo.record_id}/${photo.id}`,
                mime: photo.type,
                size: atob(photo.data).length,
              },
            });
          } else {
            const form = new FormData();
            for (const key of [
              "id",
              "org_id",
              "record_id",
              "record_type",
              "caption",
              "category",
            ] as const)
              form.append(key, photo[key]);
            form.append(
              "file",
              dataFile(photo.data, photo.type),
              "capture.webp",
            );
            await fetchJSON("/api/media", { method: "POST", body: form });
          }
        }
        // Keep the optimistic command until the refreshed server version is visible.
        // Otherwise a fast follow-up edit/delete can reuse the preceding version.
        await onChange();
        if (demo && row.kind === "photo")
          await local.rows.update(row.id, { state: "synced" });
        else await local.rows.delete(row.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Sync failed";
        const status =
          e instanceof RequestError
            ? e.status
            : /CONFLICT/.test(message)
              ? 409
              : demo
                ? 422
                : 0;
        const state: LocalRow["state"] =
          status === 409 ||
          (status === 403 && !isOriginFailure(message)) ||
          status === 422
            ? "conflict"
            : "failed";
        await local.rows.update(row.id, {
          state,
          attempts: row.attempts + 1,
          retryAt: Date.now() + retryDelay(row.attempts + 1),
          error: message,
        });
        await onChange();
        // Preserve dependency order: never send photos or approvals before their draft exists.
        break;
      }
    }
  } finally {
    running = false;
  }
}
