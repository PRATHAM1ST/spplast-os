"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { toast, Toaster } from "sonner";
import { local, unlock, lock, read, seal } from "@/lib/offline/vault";
import { fetchJSON, synchronize, RequestError } from "@/lib/offline/sync";
import { authClient } from "@/lib/auth/client";
import {
  defaultSettings,
  type Command,
  type Session,
  type Workspace,
} from "@/lib/domain/types";
import { today, uid } from "@/lib/utils";
import { Button } from "./ui/button";
import { Field, Loading } from "./ui/common";
import { ArrowUpRight, ShieldCheck, WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { PasswordRecovery } from "./recovery";
type Context = {
  session: Session;
  data: Workspace | undefined;
  loading: boolean;
  error: Error | null;
  online: boolean;
  cached: boolean;
  pending: number;
  sync: () => Promise<void>;
  refresh: () => void;
  execute: (
    action: string,
    payload: Record<string, unknown>,
    expected?: number,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  from: string;
  to: string;
  setRange: (from: string, to: string) => void;
  loadMore: () => Promise<void>;
};
const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace unavailable");
  return value;
}
export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {pathname === "/reset-password" ? (
        <PasswordRecovery />
      ) : (
        <SessionGate>{children}</SessionGate>
      )}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
function SessionGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [candidate, setCandidate] = useState<Session | null>(null);
  const [stage, setStage] = useState<
    "loading" | "login" | "unlock" | "onboarding" | "verify"
  >("loading");
  const [configured, setConfigured] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signup, setSignup] = useState(false);
  const [otp, setOtp] = useState("");
  const qc = useQueryClient();
  const enter = useCallback(async (s: Session, phrase: string) => {
    await unlock(s.user_id, phrase);
    const prior = await read<{ session: Session }>(`${s.user_id}:session`);
    if (
      prior &&
      JSON.stringify([
        prior.session.role,
        prior.session.permissions,
        prior.session.org_id,
      ]) !== JSON.stringify([s.role, s.permissions, s.org_id])
    ) {
      // Never hydrate a former permission set's confidential snapshot.
      await local.rows
        .where("user")
        .equals(s.user_id)
        .filter((r) => r.kind === "cache")
        .delete();
    }
    await seal(
      `${s.user_id}:session`,
      "session",
      { session: s, expires: Date.now() + 12 * 3600000 },
      "synced",
    );
    localStorage.setItem("spplast-device-user", s.user_id);
    setSession(s);
  }, []);
  const check = useCallback(async () => {
    if (
      localStorage.getItem("spplast-device-user") === "demo-owner" &&
      process.env.NEXT_PUBLIC_ENABLE_DEMO !== "false"
    ) {
      await enter(
        {
          user_id: "demo-owner",
          email: "demo@spplast.local",
          org_id: "00000000-0000-4000-8000-000000000001",
          role: "owner",
          permissions: {},
          demo: true,
        },
        "isolated-demo-only",
      );
      return;
    }
    try {
      const result = await fetchJSON<{
        configured: boolean;
        session?: Session;
        needsOnboarding?: boolean;
      }>("/api/session", { signal: AbortSignal.timeout(3500) });
      setConfigured(result.configured);
      if (result.session) {
        setCandidate(result.session);
        setStage("unlock");
      } else setStage(result.needsOnboarding ? "onboarding" : "login");
    } catch (e) {
      const user = localStorage.getItem("spplast-device-user");
      if (
        !(e instanceof RequestError) &&
        user &&
        (await local.rows.get(`${user}:session`))
      )
        setStage("unlock");
      else {
        setConfigured(true);
        setStage("login");
      }
    }
  }, [enter]);
  useEffect(() => {
    void check();
  }, [check]);
  async function demo() {
    setBusy(true);
    setError("");
    try {
      await enter(
        {
          user_id: "demo-owner",
          email: "demo@spplast.local",
          org_id: "00000000-0000-4000-8000-000000000001",
          role: "owner",
          permissions: {},
          demo: true,
        },
        "isolated-demo-only",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doUnlock() {
    setBusy(true);
    setError("");
    try {
      const user =
        candidate?.user_id || localStorage.getItem("spplast-device-user");
      if (!user) throw new Error("Sign in online to initialize offline access");
      if (passphrase.length < 8)
        throw new Error("Use a device passphrase of at least 8 characters");
      await unlock(user, passphrase);
      if (candidate) await enter(candidate, passphrase);
      else {
        const saved = await read<{ session: Session; expires: number }>(
          `${user}:session`,
        );
        if (!saved || saved.expires < Date.now())
          throw new Error("Reconnect and sign in to renew offline access");
        setSession(saved.session);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    const count = await local.rows
      .where("user")
      .equals(session!.user_id)
      .filter(
        (r) => ["queue", "photo"].includes(r.kind) && r.state !== "synced",
      )
      .count();
    if (
      count &&
      !confirm(
        `${count} entries are still on this device. Lock now? They will remain encrypted until you sign back in with the same device passphrase.`,
      )
    )
      return;
    if (!session?.demo) await authClient.signOut();
    lock();
    localStorage.removeItem("spplast-device-user");
    qc.clear();
    setSession(null);
    setCandidate(null);
    setPassphrase("");
    setStage("login");
  }
  if (session)
    return (
      <WorkspaceProvider session={session} signOut={signOut}>
        {children}
      </WorkspaceProvider>
    );
  if (stage === "loading") return <Loading label="Opening SP Plast OS…" />;
  return (
    <div className="auth-screen">
      <div className="auth-story">
        <a className="wordmark" href="https://www.spplastindustries.com/">
          sp plast<span>OS</span>
        </a>
        <div>
          <div className="eyebrow">THE FACTORY, CONNECTED.</div>
          <h1>
            Every material.
            <br />
            Every movement.
            <br />
            <em>All together.</em>
          </h1>
          <p>
            Factory Production & Material Intelligence
            <br />
            Built for the people behind the process.
          </p>
        </div>
        <span className="auth-footer">
          SP PLAST INDUSTRIES · AHMEDABAD, INDIA
        </span>
      </div>
      <div className="auth-form">
        <div className="eyebrow">WELCOME TO YOUR FACTORY OS</div>
        <h2>
          {stage === "verify"
            ? "Verify your email."
            : stage === "unlock"
              ? "Your work, securely kept."
              : stage === "onboarding"
                ? "Make it your factory."
                : "Good work starts here."}
        </h2>
        <p>
          {stage === "verify"
            ? `Enter the verification code sent to ${email}, or follow the verification link in your email.`
            : stage === "unlock"
              ? "Enter your device passphrase to unlock local drafts. On a new device, choose a passphrase of at least 8 characters."
              : stage === "onboarding"
                ? "Initialize the factory as the verified administrator, then configure your actual machines and shifts."
                : configured
                  ? "Sign in with your factory account."
                  : "Neon is not connected yet. Add the environment values to enable your private factory workspace."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (stage === "verify") {
                const result = await authClient.emailOtp.verifyEmail({
                  email,
                  otp,
                });
                if (result.error) throw new Error(result.error.message);
                toast.success("Email verified. Sign in to continue.");
                setSignup(false);
                setOtp("");
                await check();
                return;
              }
              if (stage === "unlock") {
                await doUnlock();
                return;
              }
              if (stage === "onboarding") {
                await fetchJSON("/api/onboarding", { method: "POST" });
                await check();
                return;
              }
              const response = signup
                ? await authClient.signUp.email({
                    email,
                    password,
                    name: email.split("@")[0],
                    callbackURL: window.location.origin + "/",
                  })
                : await authClient.signIn.email({ email, password });
              if (response.error) throw new Error(response.error.message);
              if (
                signup &&
                response.data?.user &&
                !response.data.user.emailVerified
              ) {
                setStage("verify");
                return;
              }
              await check();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {stage === "verify" ? (
            <Field label="Email verification code">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </Field>
          ) : stage === "unlock" ? (
            <Field label="Device passphrase">
              <input
                type="password"
                autoComplete="off"
                minLength={8}
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </Field>
          ) : stage === "login" && configured ? (
            <>
              <Field label="Work email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={12}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </>
          ) : null}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {(configured || stage === "unlock" || stage === "onboarding") && (
            <Button className="full" disabled={busy}>
              {busy
                ? "Please wait…"
                : stage === "verify"
                  ? "Verify email"
                  : stage === "unlock"
                    ? "Unlock device"
                    : stage === "onboarding"
                      ? "Initialize factory"
                      : signup
                        ? "Create account"
                        : "Sign in"}
              <ArrowUpRight size={18} />
            </Button>
          )}
        </form>
        {stage === "login" && configured && (
          <div className="stack">
            <button className="text-button" onClick={() => setSignup(!signup)}>
              {signup
                ? "Already have an account? Sign in"
                : "First time? Create an account"}
            </button>
            <button
              className="text-button"
              onClick={async () => {
                if (!email.includes("@")) {
                  setError("Enter your work email first.");
                  return;
                }
                try {
                  const result = await authClient.requestPasswordReset({
                    email,
                    redirectTo: window.location.origin + "/reset-password",
                  });
                  if (result.error) throw new Error(result.error.message);
                  toast.info(
                    "If this account exists, a password reset email will arrive shortly.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Forgot password?
            </button>
          </div>
        )}
        {stage === "verify" && (
          <button
            className="text-button"
            onClick={async () => {
              const result = await authClient.sendVerificationEmail({
                email,
                callbackURL: window.location.origin + "/",
              });
              if (result.error)
                setError(result.error.message || "Unable to resend");
              else toast.info("Verification email requested");
            }}
          >
            Resend verification email
          </button>
        )}
        {stage === "login" &&
          process.env.NEXT_PUBLIC_ENABLE_DEMO !== "false" && (
            <div className="demo-choice">
              <Button
                variant="outline"
                className="full"
                disabled={busy}
                onClick={demo}
              >
                Explore the demo factory <ArrowUpRight size={17} />
              </Button>
              <small>
                Fictional records. Separate from your production database.
              </small>
            </div>
          )}
        <div className="auth-note">
          <ShieldCheck size={18} />
          <span>Private by design. Your local drafts are encrypted.</span>
        </div>
        {stage === "unlock" && (
          <button
            className="text-button"
            onClick={() => {
              setStage("login");
              setCandidate(null);
            }}
          >
            Use another account
          </button>
        )}
      </div>
    </div>
  );
}
function WorkspaceProvider({
  session,
  signOut,
  children,
}: {
  session: Session;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [cached, setCached] = useState(false);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const rows = useLiveQuery(
    () =>
      local.rows
        .where("user")
        .equals(session.user_id)
        .filter(
          (r) => ["queue", "photo"].includes(r.kind) && r.state !== "synced",
        )
        .toArray(),
    [session.user_id],
    [],
  );
  const key = useMemo(
    () => ["workspace", session.user_id, from, to],
    [session.user_id, from, to],
  );
  useEffect(() => {
    let active = true;
    void read<Workspace>(`${session.user_id}:cache:${from}:${to}`)
      .then((saved) => {
        if (active && saved && !qc.getQueryData(key)) {
          qc.setQueryData(key, saved, { updatedAt: 0 });
          setCached(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key, qc, session.user_id, from, to]);
  const query = useQuery<Workspace>({
    queryKey: key,
    queryFn: async () => {
      const cacheId = `${session.user_id}:cache:${from}:${to}`;
      try {
        const data = session.demo
          ? await (await import("@/lib/db/demo")).demoWorkspace(from, to)
          : await fetchJSON<Workspace>(
              `/api/workspace?org=${session.org_id}&from=${from}&to=${to}`,
            );
        data.settings = { ...defaultSettings, ...data.settings };
        await seal(cacheId, "cache", data, "synced");
        setCached(false);
        return data;
      } catch (e) {
        const cached = await read<Workspace>(cacheId);
        if (
          cached &&
          !(e instanceof Error && /FORBIDDEN|UNAUTHORIZED/.test(e.message))
        ) {
          setCached(true);
          return cached;
        }
        throw e;
      }
    },
  });
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["workspace", session.user_id] });
  }, [qc, session.user_id]);
  const sync = useCallback(async () => {
    const demo = session.demo
      ? (await import("@/lib/db/demo")).demoCommand
      : undefined;
    await synchronize(session.user_id, refresh, demo, true);
  }, [session.demo, session.user_id, refresh]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const resume = () => {
      setOnline(navigator.onLine);
      void sync();
    };
    const offline = () => setOnline(false);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", resume);
    navigator.serviceWorker?.addEventListener("message", resume);
    const timer = setInterval(() => {
      void synchronize(
        session.user_id,
        refresh,
        session.demo
          ? async (c) => (await import("@/lib/db/demo")).demoCommand(c)
          : undefined,
      );
    }, 15000);
    void navigator.storage?.persist?.();
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", resume);
      navigator.serviceWorker?.removeEventListener("message", resume);
      clearInterval(timer);
    };
  }, [sync, session, refresh]);
  const execute = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>,
      expected?: number,
    ) => {
      const c: Command = {
        id: uid(),
        org_id: session.org_id,
        action,
        payload,
        expected_version: expected,
      };
      await seal(c.id, "queue", c);
      toast.success("Saved locally", {
        description:
          "Your entry is safe on this device. Syncing when connected.",
      });
      void sync();
    },
    [session.org_id, sync],
  );
  const loadMore = async () => {
    const offset = Math.max(
      ...["batches", "lots", "movements", "materials"].map(
        (k) =>
          (query.data?.[k as keyof Workspace] as unknown[] | undefined)
            ?.length || 0,
      ),
    );
    const more = session.demo
      ? await (await import("@/lib/db/demo")).demoWorkspace(from, to, offset)
      : await fetchJSON<Workspace>(
          `/api/workspace?org=${session.org_id}&from=${from}&to=${to}&offset=${offset}`,
        );
    qc.setQueryData<Workspace>(key, (old) => {
      if (!old) return more;
      const merged = { ...old, has_more: more.has_more };
      for (const k of Object.keys(more) as (keyof Workspace)[]) {
        if (Array.isArray(more[k]) && k !== "locked_days" && k !== "members") {
          const values = [
            ...(old[k] as { id: string }[]),
            ...(more[k] as { id: string }[]),
          ];
          Object.assign(merged, {
            [k]: Array.from(new Map(values.map((v) => [v.id, v])).values()),
          });
        }
      }
      return merged;
    });
  };
  return (
    <WorkspaceContext.Provider
      value={{
        session,
        data: query.data,
        loading: query.isLoading,
        error: query.error,
        online,
        cached,
        pending: rows.length,
        sync,
        refresh,
        execute,
        signOut,
        from,
        to,
        setRange: (a, b) => {
          setFrom(a);
          setTo(b);
        },
        loadMore,
      }}
    >
      {!online && (
        <div className="offline-ribbon">
          <WifiOff size={15} /> Offline · entries save on this device
        </div>
      )}
      {children}
    </WorkspaceContext.Provider>
  );
}
