import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../core/api/client";
import { errorMessage, isApiError } from "../../core/api/errors";
import { useSession } from "../../core/auth/session-context";
import { BusyButton } from "../../core/ui";
import { Brand } from "../../app/shared";
import { safeStorage } from "../../core/storage";

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
    () => safeStorage.getSession("planet.auth.email") ?? "",
  );
  const [step, setStep] = useState<"email" | "code">(() =>
    safeStorage.getSession("planet.auth.email") ? "code" : "email",
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
  // 满 6 位自动提交；同一验证码只尝试一次，失败不循环。
  const attemptedCode = useRef("");
  const verifyRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    verifyRef.current = verify;
  });
  useEffect(() => {
    if (step !== "code" || code.length !== 6 || busy || retryAfter > 0) return;
    if (attemptedCode.current === code) return;
    attemptedCode.current = code;
    void verifyRef.current();
  }, [busy, code, retryAfter, step]);
  if (token) return <Navigate to={redirect} replace />;
  async function requestCode() {
    setError("");
    const parsed = z.string().trim().email().safeParse(email);
    if (!parsed.success) {
      setError("请输入有效的邮箱地址。");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ dev_code?: string }>(
        "/auth/request-code",
        { email: parsed.data.toLowerCase() },
      );
      setEmail(parsed.data.toLowerCase());
      safeStorage.setSession("planet.auth.email", parsed.data.toLowerCase());
      const nextDevCode = result.dev_code ?? "";
      setDevCode(nextDevCode);
      // Local API returns dev_code when DEV_AUTH_CODES=1. Pre-fill it so a
      // development login never depends on an email provider or hash lookup.
      setCode(nextDevCode);
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
      setError("请输入 6 位验证码。");
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
      safeStorage.removeSession("planet.auth.email");
      navigate(redirect, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      // 验证码连错也会触发限流:同样进入冷却,自动重试闸门随之关闭
      if (isApiError(e) && e.status === 429) setRetryAfter(e.retryAfterSeconds ?? 60);
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
        <span className="eyebrow">欢迎回家</span>
        <h1>{step === "email" ? "照护，从这里开始" : "查看你的邮箱"}</h1>
        <p>
          {step === "email"
            ? "登录后，每个人、每只宠物、每次照护都保持同步。"
            : `我们已把 6 位验证码发送到 ${email}。`}
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || retryAfter > 0) return;
            void (step === "email" ? requestCode() : verify());
          }}
        >
        <label className="form-field">
          <span>
            {step === "email" ? "邮箱地址" : "验证码"}
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
        {devCode && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_AUTH_CODE === "true") && (
          <div className="dev-code">
            开发码：<strong>{devCode}</strong>（已自动填入）
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
            ? `${retryAfter}s 后重试`
            : step === "email"
              ? "继续"
              : "验证并登录"}
        </BusyButton>
        </form>
        {step === "code" && (
          <button
            className="text-button"
            onClick={() => {
              setStep("email");
              setCode("");
              safeStorage.removeSession("planet.auth.email");
              setError("");
            }}
          >
            换个邮箱
          </button>
        )}
      </section>
      <p className="auth-note">所有照顾它的人，共用一个安心的地方。</p>
    </div>
  );
}
