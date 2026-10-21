import { NextResponse } from "next/server";
import { networkInterfaces } from "node:os";
import { acceptsOrigin } from "./request-origin";
export function apiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const status = message.includes("UNAUTHORIZED")
    ? 401
    : message.includes("FORBIDDEN")
      ? 403
      : message.includes("CONFLICT")
        ? 409
        : message.includes("UNCONFIGURED")
          ? 503
          : code === "P0001" ||
              code.startsWith("23") ||
              (error instanceof Error && error.name === "ZodError")
            ? 422
            : 500;
  console.error(
    JSON.stringify({
      event: "request_failed",
      message: message.slice(0, 250),
      status,
    }),
  );
  return NextResponse.json(
    {
      error:
        status === 500
          ? "The server could not complete this request. Your local entry will retry."
          : message.slice(0, 250),
    },
    { status },
  );
}
export function sameOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL || request.url).origin;
  const developmentHosts =
    process.env.NODE_ENV === "development"
      ? [
          "localhost",
          "127.0.0.1",
          ...Object.values(networkInterfaces())
            .flat()
            .filter((a) => a?.family === "IPv4" && !a.internal)
            .map((a) => a!.address),
        ]
      : [];
  if (
    !acceptsOrigin(
      request.headers.get("origin"),
      expected,
      request.headers.get("host"),
      developmentHosts,
    )
  )
    throw new Error("FORBIDDEN: Invalid request origin");
}
