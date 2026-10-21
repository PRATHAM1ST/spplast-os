"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/errors";
import { Button } from "./ui/button";
import { Field } from "./ui/common";
export function PasswordRecovery() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-form" style={{ maxWidth: 560, margin: "10vh auto" }}>
      <div className="eyebrow">SP PLAST OS</div>
      <h1>Reset your password</h1>
      <p>
        Your device passphrase remains separate. It still protects existing
        offline drafts.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const token = new URLSearchParams(window.location.search).get(
              "token",
            );
            if (!token)
              throw new Error(
                "Open the reset link from your email. Request a fresh link if it has expired.",
              );
            const result = await authClient.resetPassword({
              newPassword: password,
              token,
            });
            if (result.error)
              throw new Error(
                authErrorMessage(result.error, window.location.origin),
              );
            setPassword("");
            setMessage("Password updated. Return to sign in.");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="New password">
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
      </form>
      {message && <p role="status">{message}</p>}
      <Link href="/" className="text-button">
        Return to sign in
      </Link>
    </main>
  );
}
