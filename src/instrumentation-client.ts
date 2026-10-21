import { randomId } from "./lib/browser-crypto";

// Neon Auth creates a tab ID during module evaluation. Run before app imports.
// This preserves secure randomness; it does not enable Web Crypto on HTTP.
if (globalThis.crypto && !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: randomId });
}
