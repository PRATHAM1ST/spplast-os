export function authErrorMessage(
  error: { code?: string; message?: string },
  origin: string,
) {
  if (
    error.code === "INVALID_ORIGIN" ||
    error.message?.toLowerCase() === "invalid origin"
  ) {
    return `Sign-in is not enabled for ${origin}. Your administrator needs to add this exact address in Neon → Auth → Configuration → Domains, then retry. Email verification does not enable a new app address.`;
  }
  return (
    error.message || "Unable to complete authentication. Please try again."
  );
}
