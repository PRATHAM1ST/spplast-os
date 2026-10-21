export function acceptsOrigin(
  origin: string | null,
  expected: string,
  host: string | null,
  developmentHosts: string[] = [],
) {
  if (!origin) return false;
  if (origin === expected) return true;
  try {
    const url = new URL(origin);
    return (
      origin === url.origin &&
      url.host === host &&
      developmentHosts.includes(url.hostname) &&
      ((url.protocol === "http:" && url.port === "3000") ||
        (url.protocol === "https:" && url.port === "3443"))
    );
  } catch {
    return false;
  }
}
