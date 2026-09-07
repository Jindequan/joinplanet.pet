// 值班（handoff）：照护分工的最小可用 UI。
// 宠物侧=care tab 顶部的值班卡（认领/接替/结束）；家庭侧=FamilyPage 的
// 值班总览（每只宠物谁在值班、今天还剩几件事）。
import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../core/api/client";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage } from "../../core/api/errors";
import { BusyButton, Toast } from "../../core/ui";
import { Card, useInvalidate, type Pet } from "../../app/shared";
import { useT } from "../../core/i18n";
import { formatTime } from "../../core/display";
import { HandHeart, LogOut, UserRound } from "lucide-react";
import { PetAvatar } from "../../ui/pet-avatar";

export type Handoff = {
  id: string;
  pet_id: string;
  user_id: string;
  user_name: string;
  started_at: string;
  is_me: boolean;
};
export type HandoffSummaryRow = {
  pet_id: string;
  pet_name: string;
  pending_today: number;
  handoff: Handoff | null;
};

/** 宠物 care tab 的值班卡。查询失败静默隐藏——值班是辅助信息，不挡照护主流程。 */
export function HandoffCard({ pet }: { pet: Pet }) {
  const t = useT();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const query = useQuery({
    queryKey: ["handoff", pet.id],
    queryFn: () => api.get<{ handoff: Handoff | null }>(`/pets/${pet.id}/handoff`),
  });
  if (pet.archived_at || query.isLoading || query.error) return null;
  const active = query.data?.handoff ?? null;

  async function claim() {
    setBusy(true);
    try {
      await api.post(
        `/pets/${pet.id}/handoff`,
        {},
        { idempotencyKey: createCommandId() },
      );
      setToast(t("你已开始值班，家人都看得到。", "You're on duty — your family can see it."));
      invalidate();
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function release() {
    setBusy(true);
    try {
      await api.post(
        `/pets/${pet.id}/handoff/release`,
        {},
        { idempotencyKey: createCommandId() },
      );
      setToast(t("值班已结束。", "Duty ended."));
      invalidate();
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="handoff-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("值班 · 照护分工", "On Duty · Shared Care")}</span>
          <h2>
            {active
              ? t(`${active.user_name} 值班中`, `${active.user_name} is on duty`)
              : t("现在没有人值班", "Nobody is on duty right now")}
          </h2>
        </div>
        <span className="family-icon" aria-hidden>
          {active ? <HandHeart size={20} /> : <UserRound size={20} />}
        </span>
      </div>
      {active && (
        <p className="muted-copy">
          {active.is_me
            ? t(`从 ${formatTime(active.started_at)} 开始，家人看到的责任人是你。`, `Since ${formatTime(active.started_at)} — your family sees you as responsible.`)
            : t(`从 ${formatTime(active.started_at)} 开始接手。`, `On duty since ${formatTime(active.started_at)}.`)}
        </p>
      )}
      <div className="row-actions">
        {active?.is_me ? (
          <BusyButton className="button ghost" busy={busy} onClick={() => void release()}>
            <LogOut size={15} /> {t("结束我的值班", "End my duty")}
          </BusyButton>
        ) : (
          <BusyButton className="button primary" busy={busy} onClick={() => void claim()}>
            <HandHeart size={15} /> {active ? t("我来接替值班", "I'll take over") : t("我来值班", "Put me on duty")}
          </BusyButton>
        )}
      </div>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Card>
  );
}

/** 家庭详情页的值班总览：谁在盯哪只宠物、今天还剩几件事。 */
export function FamilyHandoffSummary({ familyId }: { familyId: string }) {
  const t = useT();
  const query = useQuery({
    queryKey: ["handoff-summary", familyId],
    queryFn: () => api.get<{ pets: HandoffSummaryRow[] }>(`/families/${familyId}/handoff-summary`),
  });
  if (query.isLoading || query.error) return null;
  const rows = query.data?.pets ?? [];
  if (rows.length === 0) return null;
  return (
    <Card>
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("值班总览", "Duty Board")}</span>
          <h2>{t("谁在盯哪只宠物", "Who's watching which pet")}</h2>
        </div>
      </div>
      <div className="stack compact">
        {rows.map((row) => (
          <Link className="row-between handoff-summary-row" key={row.pet_id} to={`/pets/${row.pet_id}`}>
            <span className="more-row-copy">
              <PetAvatar petId={row.pet_id} species="other" size={34} decorative />
              <span>
                <strong>{row.pet_name}</strong>
                <small>
                  {row.handoff
                    ? t(`${row.handoff.user_name} 值班中`, `${row.handoff.user_name} on duty`)
                    : t("无人值班", "No one on duty")}
                </small>
              </span>
            </span>
            <span className="role-pill">
              {row.pending_today > 0
                ? t(`今天还有 ${row.pending_today} 件`, `${row.pending_today} left today`)
                : t("今天已完成", "All done today")}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** 停药自动归档的用药提醒创建弹窗（记录新药后立刻询问）。 */
export function MedReminderDialog({
  pet,
  medicationId,
  medicationName,
  dose,
  onClose,
  onCreated,
}: {
  pet: Pet;
  medicationId: string;
  medicationName: string;
  dose?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT();
  const [time, setTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/pets/${pet.id}/tasks`,
        {
          title: t(
            `给药：${medicationName}${dose ? `（${dose}）` : ""}`,
            `Give ${medicationName}${dose ? ` (${dose})` : ""}`,
          ),
          medication_id: medicationId,
          time_of_day: time || undefined,
          schedule: { v: 1, kind: "daily" },
        },
        { idempotencyKey: createCommandId() },
      );
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="med-reminder-title">
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          ×
        </button>
        <span className="eyebrow">{t("用药提醒", "Medication Reminder")}</span>
        <h2 id="med-reminder-title">
          {t(`每天定点提醒给「${medicationName}」？`, `Get a daily reminder to give ${medicationName}?`)}
        </h2>
        <p>
          {t(
            "创建后会出现在「今天」里，全家可见；停药时这个提醒会自动结束，不用手动删。",
            "It shows up on Today for the whole family, and ends automatically when the medication is stopped — no manual cleanup.",
          )}
        </p>
        <label className="form-field">
          <span>{t("每天几点提醒", "Daily reminder time")}</span>
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("暂时不用", "Not now")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={() => void create()}>
            {t("创建提醒", "Create Reminder")}
          </BusyButton>
        </div>
      </section>
    </div>,
    document.body,
  );
}
