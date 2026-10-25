import { createHash } from "node:crypto";

const hash = (source) => createHash("sha256").update(source).digest("hex");
const normalize = (source) => source.replaceAll("\r\n", "\n");

export const migrationChecksum = (source) => hash(normalize(source));

// Older runners recorded the checkout's native line endings. Accept either
// representation, but never ignore changes to the SQL itself.
export function matchesMigrationChecksum(source, checksum) {
  const lf = normalize(source);
  return (
    checksum === hash(lf) || checksum === hash(lf.replaceAll("\n", "\r\n"))
  );
}
