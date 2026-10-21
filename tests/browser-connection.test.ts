import { expect, test, vi, afterEach } from "vitest";
import { randomId } from "@/lib/browser-crypto";
import { acceptsOrigin } from "@/lib/request-origin";
afterEach(() => vi.unstubAllGlobals());
test("UUIDs remain valid with only the entropy API available on LAN HTTP", () => {
  const entropy = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal("crypto", { getRandomValues: entropy });
  const values = Array.from({ length: 1000 }, randomId);
  expect(new Set(values).size).toBe(1000);
  for (const id of values)
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
test("LAN preview origin must match this machine, port and request host", () => {
  const expected = "http://localhost:3000";
  const hosts = ["192.168.1.6"];
  expect(
    acceptsOrigin(
      "https://192.168.1.6:3443",
      expected,
      "192.168.1.6:3443",
      hosts,
    ),
  ).toBe(true);
  expect(
    acceptsOrigin(
      "https://attacker.example",
      expected,
      "attacker.example",
      hosts,
    ),
  ).toBe(false);
  expect(
    acceptsOrigin(
      "https://192.168.1.6:3443",
      expected,
      "localhost:3000",
      hosts,
    ),
  ).toBe(false);
  expect(
    acceptsOrigin(
      "https://192.168.1.6:9999",
      expected,
      "192.168.1.6:9999",
      hosts,
    ),
  ).toBe(false);
  expect(acceptsOrigin(null, expected, "localhost:3000", hosts)).toBe(false);
});
test("production accepts only the configured app origin", () => {
  expect(
    acceptsOrigin(
      "https://factory.example",
      "https://factory.example",
      "factory.example",
    ),
  ).toBe(true);
  expect(
    acceptsOrigin(
      "https://192.168.1.6:3443",
      "https://factory.example",
      "192.168.1.6:3443",
    ),
  ).toBe(false);
});
