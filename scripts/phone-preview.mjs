import https from "node:https";
import http from "node:http";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, ".local-phone");
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter(
    (a) =>
      a &&
      a.family === "IPv4" &&
      !a.internal &&
      !a.address.startsWith("169.254."),
  )
  .map((a) => a.address)
  .sort();
const fingerprint = addresses.join(",");
const pfxPath = resolve(directory, "phone.pfx");
if (
  !existsSync(pfxPath) ||
  !existsSync(resolve(directory, "addresses")) ||
  readFileSync(resolve(directory, "addresses"), "utf8") !== fingerprint ||
  Date.now() - statSync(pfxPath).mtimeMs > 45 * 86400000
) {
  if (process.platform !== "win32")
    throw new Error(
      "This certificate helper is for Windows. Use Next.js --experimental-https on other platforms.",
    );
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve(root, "scripts/create-phone-certificate.ps1"),
      "-OutputDirectory",
      directory,
      "-Addresses",
      fingerprint,
    ],
    { stdio: "inherit", windowsHide: true },
  );
}
const allowedHosts = new Set([
  "localhost:3443",
  "127.0.0.1:3443",
  ...addresses.map((ip) => `${ip}:3443`),
]);
const server = https.createServer(
  {
    pfx: readFileSync(pfxPath),
    passphrase: readFileSync(resolve(directory, "password"), "utf8"),
  },
  (req, res) => {
    if (!allowedHosts.has(req.headers.host)) {
      res.writeHead(403);
      res.end("Unknown preview host");
      return;
    }
    if (req.url === "/__development-ca.cer") {
      res.writeHead(200, {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition":
          'attachment; filename="SP-Plast-Development-CA.cer"',
        "Cache-Control": "no-store",
      });
      res.end(readFileSync(resolve(directory, "development-ca.cer")));
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 3000,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-proto": "https",
          "x-forwarded-host": req.headers.host,
        },
      },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent)
        res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Start npm run dev on this PC, then refresh.");
    });
    req.pipe(upstream);
  },
);
server.on("upgrade", (req, socket, head) => {
  if (!allowedHosts.has(req.headers.host)) {
    socket.destroy();
    return;
  }
  const upstream = net.connect(3000, "127.0.0.1", () => {
    const headers = {
      ...req.headers,
      "x-forwarded-proto": "https",
      "x-forwarded-host": req.headers.host,
    };
    upstream.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(
        headers,
      )
        .map(([key, value]) => `${key}: ${value}`)
        .join("\r\n")}\r\n\r\n`,
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "Phone preview is already running on port 3443."
      : error.message,
  );
  process.exit(1);
});
server.listen(3443, "0.0.0.0", () => {
  console.log(
    "SP Plast OS — local HTTPS phone preview (keep npm run dev running)",
  );
  for (const address of addresses)
    console.log(`Phone address: https://${address}:3443`);
  console.log(
    "Development certificate only. Trust .local-phone/development-ca.cer on your test device for PWA installation. Never share phone.pfx or password.",
  );
});
