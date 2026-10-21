"use client";
import { useEffect, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "./ui/button";
import { local, seal, fileData } from "@/lib/offline/vault";
import type { QueuedPhoto } from "@/lib/offline/sync";
import type { Session } from "@/lib/domain/types";
import { uid } from "@/lib/utils";
import { toast } from "sonner";
export async function compressPhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use JPEG, PNG or WebP images");
  if (file.size > 20 * 1024 * 1024) throw new Error("Photograph exceeds 20 MB");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<File>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], `${uid()}.webp`, { type: "image/webp" }))
          : reject(new Error("Unable to process image")),
      "image/webp",
      0.88,
    ),
  );
}
export async function queuePhotos(
  files: File[],
  session: Session,
  record_id: string,
  record_type: string,
  caption = "",
  category = "material",
) {
  for (const file of files) {
    const candidate = file.name.replace(/\.webp$/, "");
    const id =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate,
      )
        ? candidate
        : uid();
    if (await local.rows.get(id)) continue;
    const photo: QueuedPhoto = {
      id,
      org_id: session.org_id,
      record_id,
      record_type,
      caption,
      category,
      data: await fileData(file),
      type: file.type,
    };
    await seal(id, "photo", photo);
  }
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration && "sync" in registration)
    void (
      registration as ServiceWorkerRegistration & {
        sync: { register: (tag: string) => Promise<void> };
      }
    ).sync
      .register("spplast-sync")
      .catch(() => {});
}
export function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  return (
    <div className="capture-box">
      <div className="row">
        <h3 className="small">
          <Camera size={16} style={{ display: "inline", marginRight: 7 }} />
          Material photographs
        </h3>
        <small>{files.length} attached locally</small>
      </div>
      <label className="field">
        <span className="small">
          {busy ? "Preparing photos…" : "Capture or choose photos"}
        </span>
        <input
          disabled={busy}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          onChange={async (e) => {
            const selected = Array.from(e.target.files || []);
            setBusy(true);
            try {
              const next = await Promise.all(
                selected.slice(0, 8 - files.length).map(compressPhoto),
              );
              onChange([...files, ...next]);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      <div className="photo-preview">
        {previews.map((src, i) => (
          <div key={src} style={{ position: "relative" }}>
            <img src={src} alt={`Attachment ${i + 1}`} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                padding: 3,
                minHeight: 20,
              }}
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
            >
              <X size={12} />
            </Button>
          </div>
        ))}
      </div>
      <small>
        Photos stay queued until the private upload succeeds. Use consistent
        lighting and a reference card for color review.
      </small>
    </div>
  );
}
export async function pendingPhotoCount(user: string) {
  return local.rows
    .where("user")
    .equals(user)
    .filter((r) => r.kind === "photo" && r.state !== "synced")
    .count();
}
