import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  migrationChecksum,
  matchesMigrationChecksum,
} from "../scripts/migration-checksum.mjs";

test("migration checksums work across Windows and Unix checkouts", () => {
  const lf = "create table example (id integer);\nselect 1;\n";
  const crlf = lf.replaceAll("\n", "\r\n");
  const oldWindowsChecksum = createHash("sha256").update(crlf).digest("hex");
  expect(migrationChecksum(crlf)).toBe(migrationChecksum(lf));
  expect(matchesMigrationChecksum(crlf, migrationChecksum(lf))).toBe(true);
  expect(matchesMigrationChecksum(lf, oldWindowsChecksum)).toBe(true);
});

test("changed SQL still fails the immutable migration check", () => {
  const original = "select 'one';\n";
  expect(
    matchesMigrationChecksum("select 'two';\r\n", migrationChecksum(original)),
  ).toBe(false);
  expect(
    matchesMigrationChecksum("select  'one';\n", migrationChecksum(original)),
  ).toBe(false);
});
