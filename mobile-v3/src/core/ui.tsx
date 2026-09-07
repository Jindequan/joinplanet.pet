import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import { errorMessage } from "./api/errors";
import { useT } from "./i18n";

export function PageSkeleton() {
  const t = useT();
  return (
    <div className="skeleton-page" aria-label={t("加载中", "Loading")}>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export function InlineError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const t = useT();
  return (
    <div className="inline-error" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>{t("暂时没有加载出来", "Couldn't load this right now")}</strong>
        <p>{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} aria-label={t("重试", "Retry")}>
          <RefreshCw size={17} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  image,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  /** 品牌插画（public/backgrounds 下的扁平插画），让空态也有温度。 */
  image?: string;
}) {
  return (
    <div className="empty-state">
      {image ? (
        <img className="empty-art" src={image} alt="" aria-hidden loading="lazy" />
      ) : (
        <div className="empty-symbol">
          <span />
        </div>
      )}
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Toast({
  message,
  onClose,
  variant = "success",
}: {
  message: string;
  onClose: () => void;
  /** error 变体换警示图标/配色并按 alert 播报。 */
  variant?: "success" | "error";
}) {
  const t = useT();
  // 自动消失：不打断操作流；手动关闭仍可用。onClose 走 ref，父组件重渲染不重置计时。
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), 3400);
    return () => window.clearTimeout(timer);
  }, [message]);
  return createPortal(
    <div
      className={`toast ${variant === "error" ? "toast-error" : ""}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      {variant === "error" ? <AlertTriangle size={17} /> : <Check size={17} />}
      <span>{message}</span>
      <button onClick={onClose} aria-label={t("关闭", "Close")}>
        <X size={14} />
      </button>
    </div>,
    document.body,
  );
}

export function BusyButton({
  busy,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={busy || props.disabled}>
      {busy && <LoaderCircle className="spin" size={16} />}
      {children}
    </button>
  );
}

export function ConfirmDialog({
  title,
  consequence,
  confirmLabel,
  requireText,
  onCancel,
  onConfirm,
}: {
  title: string;
  consequence: string;
  confirmLabel: string;
  requireText?: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const key = (event: KeyboardEvent) =>
      event.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onCancel]);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  const valid = !requireText || value.trim() === requireText;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onCancel()
      }
    >
      <section className="modal" role="alertdialog" aria-modal="true">
        <div className="danger-icon">
          <AlertTriangle size={23} />
        </div>
        <span className="eyebrow">{t("请再次确认", "Please confirm again")}</span>
        <h2>{title}</h2>
        <p>{consequence}</p>
        {requireText && (
          <label className="form-field">
            <span>{t(`输入 “${requireText}” 以继续`, `Type “${requireText}” to continue`)}</span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            ref={cancel}
            className="button secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {t("取消", "Cancel")}
          </button>
          <BusyButton
            className="button danger"
            onClick={confirm}
            busy={busy}
            disabled={!valid}
          >
            {confirmLabel}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

// React is imported through the JSX runtime, but useState is needed by the dialog.
import * as React from "react";
