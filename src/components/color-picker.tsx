"use client";
import { useEffect, useRef, useState } from "react";
import { FastAverageColor } from "fast-average-color";
import { commonColors, nameColor, type ColorReference } from "@/lib/color";
import { PhotoPicker } from "./photos";
import { Field } from "./ui/common";

export function ColorPicker({
  files,
  onFilesChange,
  value,
  onChange,
  onBusyChange,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  value: ColorReference | null;
  onChange: (color: ColorReference) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [suggestions, setSuggestions] = useState<ColorReference[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const file = files[Math.min(selectedPhoto, Math.max(0, files.length - 1))];
  useEffect(() => {
    let cancelled = false;
    setSuggestions([]);
    setError("");
    if (!file) {
      setBusy(false);
      return;
    }
    setBusy(true);
    void (async () => {
      const bitmap = await createImageBitmap(file);
      if (cancelled || !canvas.current) {
        bitmap.close();
        return;
      }
      const target = canvas.current;
      const ratio = Math.min(240 / bitmap.width, 240 / bitmap.height);
      target.width = Math.max(1, Math.round(bitmap.width * ratio));
      target.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = target.getContext("2d");
      if (!ctx) {
        bitmap.close();
        throw new Error("Photo colour is unavailable in this browser.");
      }
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);
      bitmap.close();
      const fac = new FastAverageColor();
      try {
        const colors = [
          fac.getColor(target, {
            algorithm: "dominant",
            left: Math.floor(target.width / 4),
            top: Math.floor(target.height / 4),
            width: Math.max(1, Math.floor(target.width / 2)),
            height: Math.max(1, Math.floor(target.height / 2)),
          }),
          fac.getColor(target, { algorithm: "dominant" }),
          fac.getColor(target, { algorithm: "sqrt" }),
        ];
        if (colors.every((c) => c.error))
          throw new Error("Could not read this photo. Choose a swatch below.");
        if (!cancelled)
          setSuggestions(
            [...new Set(colors.filter((c) => !c.error).map((c) => c.hex))].map(
              nameColor,
            ),
          );
      } finally {
        fac.destroy();
      }
    })()
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  const swatch = (color: ColorReference, prefix: string) => (
    <button
      type="button"
      key={color.hex}
      className="color-choice"
      aria-label={`${prefix} ${color.name} ${color.hex}`}
      aria-pressed={value?.hex.toLowerCase() === color.hex.toLowerCase()}
      onClick={() => onChange(color)}
    >
      <span className="color-chip" style={{ background: color.hex }} />
      {color.name}
    </button>
  );
  return (
    <section className="color-assistant">
      <div className="row">
        <h3>Colour & photo</h3>
        <span className="small">Optional</span>
      </div>
      <p>
        Take a close-up, then tap a suggested colour. The photo is attached when
        you save.
      </p>
      <PhotoPicker
        files={files}
        onChange={onFilesChange}
        onBusyChange={onBusyChange}
      />
      {!!files.length && (
        <div className="photo-color-sample">
          {files.length > 1 && (
            <Field label="Photo to sample">
              <select
                value={Math.min(selectedPhoto, files.length - 1)}
                onChange={(e) => setSelectedPhoto(Number(e.target.value))}
              >
                {files.map((f, i) => (
                  <option key={f.name} value={i}>
                    Photo {i + 1}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <canvas
            ref={canvas}
            aria-label="Tap the material in the photo to sample its colour"
            onClick={(e) => {
              if (busy) return;
              const target = e.currentTarget,
                rect = target.getBoundingClientRect();
              const x = Math.min(
                target.width - 1,
                Math.max(
                  0,
                  Math.floor(
                    ((e.clientX - rect.left) * target.width) / rect.width,
                  ),
                ),
              );
              const y = Math.min(
                target.height - 1,
                Math.max(
                  0,
                  Math.floor(
                    ((e.clientY - rect.top) * target.height) / rect.height,
                  ),
                ),
              );
              const rgba = target
                .getContext("2d")
                ?.getImageData(x, y, 1, 1).data;
              if (rgba)
                onChange(
                  nameColor(
                    "#" +
                      Array.from(rgba)
                        .slice(0, 3)
                        .map((c) => c.toString(16).padStart(2, "0"))
                        .join(""),
                  ),
                );
            }}
          />
          <div>
            <p className="small">
              Tap the material in the photo, or choose a suggestion.
            </p>
            <div role="status">
              {busy ? "Finding colours…" : "Suggested from photo"}
            </div>
            <div className="color-choices">
              {suggestions.map((c) => swatch(c, "Use photo colour"))}
            </div>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="color-choices">
        {commonColors.map((c) => swatch(c, "Use"))}
      </div>
      {value && (
        <p className="selected-color" role="status">
          <span className="color-chip" style={{ background: value.hex }} />
          Selected: {value.name} <span>{value.hex}</span>
        </p>
      )}
      <details className="optional-details">
        <summary>Custom colour</summary>
        <div className="form-grid">
          <Field label="Colour name">
            <input
              value={value?.name || ""}
              onChange={(e) =>
                onChange({ name: e.target.value, hex: value?.hex || "#888888" })
              }
            />
          </Field>
          <Field label="Colour swatch">
            <input
              type="color"
              value={value?.hex || "#888888"}
              onChange={(e) => onChange(nameColor(e.target.value))}
            />
          </Field>
        </div>
      </details>
      <small>
        Photo colours are approximate; lighting can change the result.
      </small>
    </section>
  );
}
