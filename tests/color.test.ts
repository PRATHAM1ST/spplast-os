import { expect, test } from "vitest";
import {
  colorDistance,
  nameColor,
  readColorReference,
  writeColorReference,
} from "@/lib/color";
test("recognizes basic colour families and ignores invalid material swatches", () => {
  expect(nameColor("#ff0000").name).toBe("Red");
  expect(nameColor("#000000").name).toBe("Black");
  expect(nameColor("#ffffff").name).toBe("White");
  expect(colorDistance("#ff0000", "")).toBe(Infinity);
});
test("production colour survives saving without a photo and can be changed without losing notes", () => {
  const first = writeColorReference("Checked screen", {
    name: "Red",
    hex: "#ff0000",
  });
  const next = writeColorReference(first, { name: "Blue", hex: "#0000ff" });
  expect(next).toContain("Checked screen");
  expect(next).not.toContain("Red");
  expect(readColorReference(next)).toEqual({ name: "Blue", hex: "#0000ff" });
});
