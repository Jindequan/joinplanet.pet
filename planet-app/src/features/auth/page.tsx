import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../core/api/client";
import { errorMessage, isApiError } from "../../core/api/errors";
import { useSession } from "../../core/auth/session-context";
import { BusyButton } from "../../core/ui";
import { Brand } from "../../app/shared";

export function AuthPage() {
  const { token, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = (() => {
    const requested = new URLSearchParams(location.search).get("redirect");
    return requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/today";
  })();
  const [email, setEmail] = useState(
    () => sessionStorage.getItem("planet.auth.email") ?? "",
  );
  const [step, setStep] = useState<"email" | "code">(() =>
    sessionStorage.getItem("planet.auth.email") ? "code" : "email",
  );
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(
      () => setRetryAfter((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [retryAfter]);
  if (token) return <Navigate to={redirect} replace />;
  async function requestCode() {
    setError("");
    const parsed = z.string().trim().email().safeParse(email);
    if (!parsed.success) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ dev_code?: string }>(
        "/auth/request-code",
        { email: parsed.data.toLowerCase() },
      );
      setEmail(parsed.data.toLowerCase());
      sessionStorage.setItem("planet.auth.email", parsed.data.toLowerCase());
      setDevCode(result.dev_code ?? "");
      setStep("code");
    } catch (e) {
      setError(errorMessage(e));
      if (isApiError(e) && e.status === 429)
        setRetryAfter(e.retryAfterSeconds ?? 60);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ token: string }>("/auth/verify-code", {
        email,
        code,
        device: navigator.userAgent,
      });
      signIn(result.token);
      sessionStorage.removeItem("planet.auth.email");
      navigate(redirect, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <span className="brand-orbit">
          <i />
        </span>
        <div className="orbit-line" />
      </div>
      <section className="auth-card">
        <Brand />
        <span className="eyebrow">WELCOME HOME</span>
        <h1>{step === "email" ? "Care starts here." : "Check your inbox."}</h1>
        <p>
          {step === "email"
            ? "Sign in to keep every person, pet, and care moment in sync."
            : `We sent a 6-digit code to ${email}.`}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || retryAfter > 0) return;
            void (step === "email" ? requestCode() : verify());
          }}
        >
        <label className="form-field">
          <span>
            {step === "email" ? "Email address" : "Verification code"}
          </span>
          <input
            type={step === "email" ? "email" : "text"}
            inputMode={step === "code" ? "numeric" : undefined}
            maxLength={step === "code" ? 6 : undefined}
            value={step === "email" ? email : code}
            onChange={(event) =>
              step === "email"
                ? setEmail(event.target.value)
                : setCode(event.target.value.replace(/\D/g, ""))
            }
            autoFocus
          />
        </label>
        {devCode && import.meta.env.VITE_ENABLE_DEV_AUTH_CODE === "true" && (
          <div className="dev-code">
            Development code: <strong>{devCode}</strong>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <BusyButton
          className="button primary full"
          type="submit"
          busy={busy || retryAfter > 0}
        >
          {retryAfter > 0
            ? `Try again in ${retryAfter}s`
            : step === "email"
              ? "Continue with email"
              : "Verify and sign in"}
        </BusyButton>
        </form>
        {step === "code" && (
          <button
            className="text-button"
            onClick={() => {
              setStep("email");
              setCode("");
              sessionStorage.removeItem("planet.auth.email");
              setError("");
            }}
          >
            Use a different email
          </button>
        )}
      </section>
      <p className="auth-note">One calm place for everyone who cares.</p>
    </div>
  );
}
