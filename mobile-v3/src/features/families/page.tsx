import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage } from "../../core/api/errors";
import { EmptyState, InlineError, PageSkeleton, Toast, BusyButton, ConfirmDialog } from "../../core/ui";
import { queryKeys } from "../../core/query/keys";
import { Check, ChevronRight, Copy, Home, Pencil, PawPrint, Plus, ShieldCheck, Trash2, Undo2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { AccessGrant, BackHeader, Card, Family, Member, Medication, Pet, Share, Transfer, Page, PageTitle, useFamilies, useInvalidate } from "../../app/shared";
import { formatDate, formatDateTime, roleLabel, speciesLabel, timezoneCity, timezoneLabel, timezoneOptions, transferStatusLabel } from "../../core/display";
import { tt, useT } from "../../core/i18n";
import { MoreGroup, MoreRow } from "../../ui/more";
import { PetAvatar } from "../../ui/pet-avatar";
import { FamilyHandoffSummary } from "../handoff/card";

/** 「永久」分享用 100 年过期时间实现；展示层识别为永久。 */
function isPermanentExpiry(expiresAt: string): boolean {
  const year = new Date(expiresAt).getFullYear();
  return year >= new Date().getFullYear() + 50;
}

export function AssignmentsPage() {
  const { petId = "", planId = "" } = useParams();
  const t = useT();
  const pet = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => api.get<{ pet: Pet }>(`/pets/${petId}`),
    enabled: Boolean(petId),
  });
  const familyId = pet.data?.pet.family_ids?.[0] ?? "";
  const family = useQuery({
    queryKey: queryKeys.family(familyId),
    queryFn: () =>
      api.get<{ family: Family; members: Member[] }>(`/families/${familyId}`),
    enabled: Boolean(familyId),
  });
  const assignments = useQuery({
    queryKey: ["assignments", planId],
    queryFn: () =>
      api.get<{ assignments: Array<{ user_id: string; role: string }> }>(
        `/care-plans/${planId}/assignments`,
      ),
    enabled: Boolean(planId),
  });
  const [busyUser, setBusyUser] = useState("");
  const [removeUser, setRemoveUser] = useState<Member | null>(null);
  const [error, setError] = useState("");
  const assigned = new Set(
    (assignments.data?.assignments ?? []).map(
      (assignment) => assignment.user_id,
    ),
  );
  async function setAssignment(userId: string, shouldAssign: boolean) {
    setBusyUser(userId);
    setError("");
    try {
      if (shouldAssign) {
        await api.put(`/care-plans/${planId}/assignments/${userId}`, {
          role: "helper",
        });
      } else {
        await api.delete(`/care-plans/${planId}/assignments/${userId}`);
      }
      await assignments.refetch();
      setRemoveUser(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyUser("");
    }
  }
  return (
    <div className="detail-view">
      <BackHeader title={t("照护负责人", "Care Leads")} />
      <Page>
        <PageTitle
          eyebrow={t("谁负责什么", "Who does what")}
          title={t("照护负责人", "Care Leads")}
          description={t(
            "负责人按当前家庭成员设置，由服务端校验权限。",
            "Leads are set from the current family members and validated server-side.",
          )}
        />
        {pet.isLoading || family.isLoading || assignments.isLoading ? (
          <PageSkeleton />
        ) : pet.error || family.error || assignments.error ? (
          <InlineError
            error={pet.error ?? family.error ?? assignments.error}
            onRetry={() => {
              void pet.refetch();
              void family.refetch();
              void assignments.refetch();
            }}
          />
        ) : (
          <>
            <Card>
              {(family.data?.members ?? []).map((member) => {
                const isAssigned = assigned.has(member.user_id);
                const isOwner = member.role === "owner";
                return (
                  <div className="member-row" key={member.user_id}>
                    <span className="avatar-dot">
                      {member.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{member.display_name}</strong>
                      <small>{member.email ?? roleLabel(member.role)}</small>
                    </div>
                    <span className="role-pill">
                      {isAssigned ? t("已负责", "Assigned") : t("未负责", "Not assigned")}
                    </span>
                    {isOwner ? (
                      <small className="muted-copy">{t("圈主", "Owner")}</small>
                    ) : (
                      <button
                        className="button ghost"
                        disabled={busyUser === member.user_id}
                        onClick={() =>
                          isAssigned
                            ? setRemoveUser(member)
                            : void setAssignment(member.user_id, true)
                        }
                      >
                        {busyUser === member.user_id
                          ? t("保存中…", "Saving…")
                          : isAssigned
                            ? t("移除", "Remove")
                            : t("指派", "Assign")}
                      </button>
                    )}
                  </div>
                );
              })}
            </Card>
            {error && <p className="form-error">{error}</p>}
          </>
        )}
        {removeUser && (
          <ConfirmDialog
            title={t(
              `移除 ${removeUser.display_name} 的负责？`,
              `Remove ${removeUser.display_name} as a lead?`,
            )}
            consequence={t(
              "对方将不再负责这个照护计划。",
              "They will no longer be responsible for this care plan.",
            )}
            confirmLabel={t("移除负责人", "Remove Lead")}
            onCancel={() => setRemoveUser(null)}
            onConfirm={() => setAssignment(removeUser.user_id, false)}
          />
        )}
      </Page>
    </div>
  );
}

export function PetTransferPage() {
  const { petId = "" } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const pet = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => api.get<{ pet: Pet }>(`/pets/${petId}`),
    enabled: Boolean(petId),
  });
  const families = useFamilies();
  const [familyId, setFamilyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (pet.isLoading || families.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (pet.error || families.error || !pet.data)
    return (
      <Page>
        <InlineError
          error={pet.error ?? families.error ?? new Error("Pet not found")}
        />
      </Page>
    );
  const current = new Set(pet.data.pet.family_ids ?? []);
  const options = (families.data?.families ?? []).filter(
    (family) => !current.has(family.id),
  );
  async function transfer() {
    if (!familyId) {
      setError(t("请选择目标家庭。", "Please choose a destination family."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/pets/${petId}/transfer`,
        { to_family_id: familyId },
        { idempotencyKey: createCommandId() },
      );
      navigate(`/pets/${petId}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="detail-view">
      <BackHeader title={t("转移宠物", "Transfer Pet")} />
      <Page>
        <PageTitle
          eyebrow={t("宠物归属", "Pet Ownership")}
          title={t(`转移 ${pet.data.pet.name}`, `Transfer ${pet.data.pet.name}`)}
          description={t(
            "需要目标家庭的圈主接受后，所有权才会真正变更。",
            "Ownership only changes once the destination family's owner accepts.",
          )}
        />
        <Card>
          <label className="form-field">
            <span>{t("目标家庭", "Destination Family")}</span>
            <select
              value={familyId}
              onChange={(event) => setFamilyId(event.target.value)}
            >
              <option value="">{t("选择家庭…", "Choose a family…")}</option>
              {options.map((family) => (
                <option value={family.id} key={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </label>
          {options.length === 0 && (
            <p className="muted-copy">
              {t(
                "请先创建或加入另一个家庭，再发起转移。",
                "Create or join another family before starting a transfer.",
              )}
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <BusyButton
            className="button primary"
            busy={busy}
            disabled={!familyId}
            onClick={() => void transfer()}
          >
            {t("发送转移请求", "Send Transfer Request")}
          </BusyButton>
        </Card>
      </Page>
    </div>
  );
}

export function FamilyTransfersPage() {
  const { familyId = "" } = useParams();
  const t = useT();
  const [direction, setDirection] = useState<"incoming" | "outgoing">(
    "incoming",
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["family-transfers", familyId, direction],
    queryFn: () =>
      api.get<{ transfers: Transfer[] }>(
        `/families/${familyId}/transfers?direction=${direction}`,
      ),
    enabled: Boolean(familyId),
  });
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [transferToCancel, setTransferToCancel] = useState<Transfer | null>(
    null,
  );
  const [busyTransferId, setBusyTransferId] = useState("");
  async function act(
    transfer: Transfer,
    action: "accept" | "decline" | "cancel",
  ) {
    setError("");
    setBusyTransferId(transfer.id);
    try {
      if (action === "cancel")
        await api.delete(`/transfers/${transfer.id}`, undefined, {
          idempotencyKey: createCommandId(),
        });
      else
        await api.post(`/transfers/${transfer.id}/${action}`, undefined, {
          idempotencyKey: createCommandId(),
        });
      await query.refetch();
      await client.invalidateQueries({ queryKey: ["families"] });
      await client.invalidateQueries({ queryKey: ["pets"] });
      await client.invalidateQueries({ queryKey: ["shares"] });
      setToast(
        t(
          `转移请求已${action === "accept" ? "接受" : action === "decline" ? "婉拒" : "取消"}。`,
          `Transfer request ${action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled"}.`,
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setBusyTransferId("");
    }
  }
  if (query.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (query.error)
    return (
      <Page>
        <InlineError error={query.error} onRetry={() => void query.refetch()} />
      </Page>
    );
  const transfers = query.data?.transfers ?? [];
  return (
    <div className="detail-view">
      <BackHeader title={t("宠物转移", "Pet Transfers")} />
      <Page>
        <PageTitle
          eyebrow={t("宠物归属", "Pet Ownership")}
          title={t("转移请求", "Transfer Requests")}
          description={t(
            "只有目标家庭的圈主接受后，所有权才会变更。",
            "Ownership changes only once the destination family's owner accepts.",
          )}
        />
        <div className="segmented">
          <button
            className={direction === "incoming" ? "selected" : ""}
            onClick={() => setDirection("incoming")}
          >
            {t("收到的", "Received")}
          </button>
          <button
            className={direction === "outgoing" ? "selected" : ""}
            onClick={() => setDirection("outgoing")}
          >
            {t("发出的", "Sent")}
          </button>
        </div>
        {transfers.length === 0 ? (
          <EmptyState
            title={t("暂无转移请求", "No Transfer Requests")}
            description={t(
              "这个家庭收到的待处理请求会显示在这里。",
              "Pending requests this family receives will appear here.",
            )}
          />
        ) : (
          <div className="stack">
            {transfers.map((transfer) => (
              <Card key={transfer.id}>
                <div className="row-between">
                  <div>
                    <strong>
                      {transfer.pet_name || transfer.pet_id}
                      {transfer.pet_archived && (
                        <span className="role-pill" style={{ marginLeft: 8 }}>
                          {t("纪念", "Memorial")}
                        </span>
                      )}
                    </strong>
                    <small>
                      {transferStatusLabel(transfer.status)} ·{" "}
                      {formatDateTime(transfer.created_at)}
                    </small>
                  </div>
                  {transfer.status === "pending" &&
                    (direction === "incoming" ? (
                      <div className="row-actions">
                        <button
                          className="button primary"
                          disabled={busyTransferId === transfer.id}
                          onClick={() => void act(transfer, "accept")}
                        >
                          {t("接受", "Accept")}
                        </button>
                        <button
                          className="button ghost"
                          disabled={busyTransferId === transfer.id}
                          onClick={() => void act(transfer, "decline")}
                        >
                          {t("婉拒", "Decline")}
                        </button>
                      </div>
                    ) : (
                      <button
                        className="button ghost"
                        onClick={() => setTransferToCancel(transfer)}
                      >
                        {t("取消请求", "Cancel Request")}
                      </button>
                    ))}
                </div>
              </Card>
            ))}
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        {transferToCancel && (
          <ConfirmDialog
            title={t(
              `取消 ${transferToCancel.pet_name || "这只宠物"} 的转移？`,
              `Cancel the transfer of ${transferToCancel.pet_name || "this pet"}?`,
            )}
            consequence={t(
              "目标家庭将无法再接受这条请求。",
              "The destination family will no longer be able to accept this request.",
            )}
            confirmLabel={t("取消转移", "Cancel Transfer")}
            onCancel={() => setTransferToCancel(null)}
            onConfirm={async () => {
              await act(transferToCancel, "cancel");
              setTransferToCancel(null);
            }}
          />
        )}
        {toast && <Toast message={toast} onClose={() => setToast("")} />}
      </Page>
    </div>
  );
}
export function MedicationForm({
  petId,
  initial,
  onClose,
  onSaved,
}: {
  petId: string;
  initial?: Medication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dose, setDose] = useState(initial?.dose ?? "");
  const [schedule, setSchedule] = useState(initial?.schedule ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  const t = useT();
  async function save() {
    setBusy(true);
    try {
      if (initial)
        await api.patch(`/medications/${initial.id}`, {
          name,
          dose,
          schedule,
          note,
        }, { idempotencyKey: commandId.current });
      else
        await api.post(
          `/pets/${petId}/medications`,
          { name, dose, schedule, note },
          { idempotencyKey: commandId.current },
        );
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("用药", "Medication")}</span>
        <h2>{initial ? t(`编辑 ${initial.name}`, `Edit ${initial.name}`) : t("添加药物", "Add Medication")}</h2>
        <label className="form-field">
          <span>{t("药名", "Medication Name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>{t("剂量", "Dose")}</span>
          <input
            value={dose}
            onChange={(event) => setDose(event.target.value)}
            placeholder={t("1 片 / 5 ml", "1 tablet / 5 ml")}
          />
        </label>
        <label className="form-field">
          <span>{t("频率", "Frequency")}</span>
          <input
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
            placeholder={t("每日 2 次 · 随餐", "Twice daily · with food")}
          />
        </label>
        <label className="form-field">
          <span>{t("备注", "Notes")}</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {initial ? t("保存修改", "Save Changes") : t("添加药物", "Add Medication")}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function Sharing({ pet }: { pet: Pet }) {
  const query = useQuery({
    queryKey: queryKeys.shares(pet.id),
    queryFn: () => api.get<{ shares: Share[] }>(`/pets/${pet.id}/shares`),
  });
  const grants = useQuery({
    queryKey: ["access-grants", pet.id],
    queryFn: () =>
      api.get<{ grants: AccessGrant[] }>(`/pets/${pet.id}/access-grants`),
  });
  const [show, setShow] = useState(false);
  const [showGrant, setShowGrant] = useState(false);
  const [created, setCreated] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Share | null>(null);
  const [grantConfirm, setGrantConfirm] = useState<AccessGrant | null>(null);
  const invalidate = useInvalidate();
  const t = useT();
  if (query.isLoading) return <PageSkeleton />;
  if (query.error)
    return (
      <InlineError error={query.error} onRetry={() => void query.refetch()} />
    );
  async function revoke() {
    if (!confirm) return;
    try {
      await api.delete(`/shares/${confirm.id}`, undefined, { idempotencyKey: createCommandId() });
      setConfirm(null);
      invalidate();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function revokeGrant() {
    if (!grantConfirm) return;
    try {
      await api.delete(`/pets/${pet.id}/access-grants/${grantConfirm.id}`, undefined, { idempotencyKey: createCommandId() });
      setGrantConfirm(null);
      void grants.refetch();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section className="subpage">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("私密链接", "Private Link")}</span>
          <h2>{t("谨慎分享", "Share Carefully")}</h2>
        </div>
        {!pet.archived_at && (
          <button className="button primary" onClick={() => setShow(true)}>
            <Plus size={16} /> {t("创建分享", "Create Share")}
          </button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {created && (
        <Card className="success">
          <Check size={18} />
          <div>
            <strong>{t("链接已复制，请尽快发给对方", "Link copied — send it to them soon")}</strong>
            <p>{t("这条安全密钥只显示一次，请现在复制保存。", "This secure key is shown only once — copy and save it now.")}</p>
            <button
              className="copy-link"
              onClick={() => void navigator.clipboard?.writeText(created)}
            >
              {created}
              <Copy size={15} />
            </button>
          </div>
        </Card>
      )}
      {(query.data?.shares ?? []).length === 0 ? (
        <EmptyState
          title={t("没有进行中的分享", "No Active Shares")}
          description={t(
            "可以为信任的人创建一条临时、只读的照护卡片或健康摘要。",
            "Create a temporary, read-only care card or health summary for someone you trust.",
          )}
        />
      ) : (
        <div className="stack">
          {(query.data?.shares ?? []).map((share) => (
            <Card key={share.id}>
              <div className="row-between">
                <div>
                  <span className="eyebrow">{share.kind === "care_card" ? t("照护卡片", "Care Card") : share.kind === "summary" ? t("健康摘要", "Health Summary") : share.kind}</span>
                  <h3>{t("私密分享", "Private Share")}</h3>
                  <p>
                    {isPermanentExpiry(share.expires_at)
                      ? t("永久有效", "Never expires")
                      : t(
                          `${formatDateTime(share.expires_at)} 过期`,
                          `Expires ${formatDateTime(share.expires_at)}`,
                        )}{" "}
                    {t(
                      `· 已被查看 ${share.view_count} 次`,
                      `· Viewed ${share.view_count} times`,
                    )}
                  </p>
                </div>
                <button
                  className="icon-button subtle"
                  onClick={() => setConfirm(share)}
                  aria-label={t("撤销分享", "Revoke Share")}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {show && (
        <ShareForm
          petId={pet.id}
          onClose={() => setShow(false)}
          onSaved={(token) => {
            const link = `${location.origin}/share/${token}`;
            setCreated(link);
            setShow(false);
            // 立即写入剪贴板：分享链接只显示一次，复制是下一步必然动作
            void navigator.clipboard?.writeText(link).catch(() => {});
            invalidate();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t("撤销这条分享？", "Revoke this share?")}
          consequence={t(
            "任何拿到链接的人都会立即失去只读访问。",
            "Anyone with the link will immediately lose read-only access.",
          )}
          confirmLabel={t("撤销分享", "Revoke Share")}
          onCancel={() => setConfirm(null)}
          onConfirm={revoke}
        />
      )}
      <Card>
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("直接授权", "Direct Grants")}</span>
            <h2>{t("受托照护人", "Trusted Caregivers")}</h2>
          </div>
          {!pet.archived_at && (
            <button className="button ghost" onClick={() => setShowGrant(true)}>
              <UserPlus size={15} /> {t("添加授权", "Add Grant")}
            </button>
          )}
        </div>
        {grants.error ? (
          <InlineError
            error={grants.error}
            onRetry={() => void grants.refetch()}
          />
        ) : (grants.data?.grants ?? []).length === 0 ? (
          <p className="muted-copy">
            {t(
              "还没有直接授权；家庭可见性是另一条独立通道。",
              "No direct grants yet; family visibility is a separate channel.",
            )}
          </p>
        ) : (
          (grants.data?.grants ?? []).map((grant) => (
            <div className="member-row" key={grant.id}>
              <span className="avatar-dot">
                <Users size={14} />
              </span>
              <div>
                <strong>{grant.user_id}</strong>
                <small>
                  {grant.expires_at
                    ? t(`${grant.expires_at} 到期`, `Expires ${grant.expires_at}`)
                    : t("永久有效", "Never expires")}
                </small>
              </div>
              <span className="role-pill">{roleLabel(grant.role)}</span>
              <button
                className="icon-button subtle"
                onClick={() => setGrantConfirm(grant)}
                aria-label={t("撤销授权", "Revoke Grant")}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </Card>
      {showGrant && (
        <GrantForm
          petId={pet.id}
          onClose={() => setShowGrant(false)}
          onSaved={() => {
            setShowGrant(false);
            void grants.refetch();
          }}
        />
      )}
      {grantConfirm && (
        <ConfirmDialog
          title={t(`撤销这位用户的授权？`, "Revoke this user's grant?")}
          consequence={t(
            "对方会立即失去对这只宠物的直接访问。",
            "They will immediately lose direct access to this pet.",
          )}
          confirmLabel={t("撤销授权", "Revoke Grant")}
          onCancel={() => setGrantConfirm(null)}
          onConfirm={revokeGrant}
        />
      )}
      <MoreGroup label={t("归属治理", "Ownership")}>
        <MoreRow
          icon={<Users size={19} />}
          title={
            pet.archived_at
              ? t("转移纪念档案", "Transfer Memorial Record")
              : t("转移所有权", "Transfer Ownership")
          }
          sub={
            pet.archived_at
              ? t("把纪念档案交还给原来的家庭", "Hand the memorial record back to its family")
              : t("把这只宠物转给另一个家庭，需对方圈主接受", "Move this pet to another family; their owner must accept")
          }
          to={`/pets/${pet.id}/transfer`}
        />
      </MoreGroup>
    </section>
  );
}

export function GrantForm({
  petId,
  onClose,
  onSaved,
}: {
  petId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("viewer");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useT();
  async function save() {
    if (!userId.trim()) {
      setError(t("先填用户 ID。", "Enter a user ID first."));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/pets/${petId}/access-grants`, {
        user_id: userId.trim(),
        role,
        ...(expires ? { expires_at: new Date(expires).toISOString() } : {}),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("直接授权", "Direct Grants")}</span>
        <h2>{t("授权访问这只宠物", "Grant Access to This Pet")}</h2>
        <p>{t("请填写对方的 Planet 用户 ID；当前暂不支持按邮箱查找。", "Enter the person's Planet user ID; email lookup isn't supported yet.")}</p>
        <label className="form-field">
          <span>{t("Planet 用户 ID", "Planet User ID")}</span>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>{t("角色", "Role")}</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="editor">{t("可编辑", "Can edit")}</option>
            <option value="viewer">{t("可查看", "Can view")}</option>
            <option value="read_only">{t("只读", "Read-only")}</option>
          </select>
        </label>
        <label className="form-field">
          <span>{t("过期时间（选填）", "Expiry (optional)")}</span>
          <input
            type="datetime-local"
            value={expires}
            min={new Date(new Date().getTime() - 60_000).toISOString().slice(0, 16)}
            onChange={(event) => setExpires(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton
            className="button primary"
            busy={busy}
            disabled={!userId.trim()}
            onClick={save}
          >
            {t("授予访问", "Grant Access")}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
export function ShareForm({
  petId,
  onClose,
  onSaved,
}: {
  petId: string;
  onClose: () => void;
  onSaved: (token: string) => void;
}) {
  const [kind, setKind] = useState("care_card");
  const [ttl, setTtl] = useState("168");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  const t = useT();
  async function save() {
    setBusy(true);
    try {
      const result = await api.post<{ token: string }>(
        `/pets/${petId}/shares`,
        { kind, ttl_hours: Number(ttl), options: {} },
        { idempotencyKey: commandId.current },
      );
      commandId.current = createCommandId();
      onSaved(result.token);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("临时访问", "Temporary Access")}</span>
        <h2>{t("创建私密分享", "Create Private Share")}</h2>
        <label className="form-field">
          <span>{t("内容视图", "Content View")}</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="care_card">{t("照护卡片(今日行动)", "Care Card (Today's actions)")}</option>
            <option value="summary">{t("健康摘要", "Health Summary")}</option>
          </select>
        </label>
        <label className="form-field">
          <span>{t("有效期", "Valid For")}</span>
          <select value={ttl} onChange={(event) => setTtl(event.target.value)}>
            <option value="24">{t("24 小时", "24 hours")}</option>
            <option value="72">{t("3 天", "3 days")}</option>
            <option value="168">{t("7 天", "7 days")}</option>
            <option value="720">{t("30 天", "30 days")}</option>
            <option value="2160">{t("90 天", "90 days")}</option>
            <option value="8760">{t("1 年", "1 year")}</option>
            <option value="876000">{t("永久", "Forever")}</option>
          </select>
          <p className="field-help">
            {t(
              "这是公开只读链接：任何人无需注册即可查看；到期或撤销后立即失效，可随时撤销。",
              "This is a public read-only link: anyone can view it without signing up. It stops working as soon as it expires or is revoked, and you can revoke it anytime.",
            )}
          </p>
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {t("创建链接", "Create Link")}
          </BusyButton>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

export function FamiliesPage() {
  const families = useFamilies();
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [toast, setToast] = useState("");
  const invalidate = useInvalidate();
  const t = useT();
  if (families.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (families.error)
    return (
      <Page>
        <InlineError
          error={families.error}
          onRetry={() => void families.refetch()}
        />
      </Page>
    );
  if (!families.data?.families.length)
    return (
      <Page className="families-page">
        <PageTitle
          eyebrow={t("共同的家", "A Shared Home")}
          title={t("把大家放进同一个照护空间", "Bring Everyone Into One Care Space")}
          description={t(
            "家庭把人、宠物和日常流程连在一起；你可以同时属于多个家庭。",
            "Families connect people, pets, and daily routines — you can belong to several at once.",
          )}
        />
        <section className="family-onboarding">
          <div className="family-onboarding-art">
            <span className="eyebrow">{t("为什么先建家庭", "Why start with a family")}</span>
            <p>{t("当每个人都看到同一份计划、知道谁做了什么、交接不再靠群聊，照顾才可靠。", "Care gets reliable when everyone sees the same plan, knows who did what, and handoffs no longer live in group chats.")}</p>
          </div>
          <div className="family-onboarding-actions">
            <Link to="/families/new">
              <span className="family-icon"><Home size={21} /></span>
              <span><strong>{t("新建一个家庭", "Create a New Family")}</strong><small>{t("你会成为圈主，接着可以添加宠物和邀请家人。", "You'll be the owner, then add pets and invite family.")}</small></span>
              <ChevronRight size={19} />
            </Link>
            <Link to="/families/join">
              <span className="family-icon coral"><Users size={21} /></span>
              <span><strong>{t("用邀请码加入", "Join with an Invite Code")}</strong><small>{t("连上别人已经建好的家庭。", "Connect to a family someone else has set up.")}</small></span>
              <ChevronRight size={19} />
            </Link>
            <div className="privacy-note"><ShieldCheck size={17} /><span><strong>{t("你们的记录保持私密。", "Your records stay private.")}</strong><small>{t("访问权限跟随家庭角色，圈主随时可以收回。", "Access follows family roles, and the owner can revoke it anytime.")}</small></span></div>
          </div>
        </section>
      </Page>
    );
  return (
    <Page className="more-page families-page">
      <PageTitle
        eyebrow={t("每个家，一个视角", "One Home, One View")}
        title={t("你的家庭", "Your Families")}
        description={t(
          "在家庭之间切换，不丢失任何一只宠物的完整图景。",
          "Switch between families without losing the full picture for any pet.",
        )}
        action={
          <button className="button primary" onClick={() => setMode("create")}>
            <Plus size={16} /> {t("新建家庭", "New Family")}
          </button>
        }
      />
      <div className="family-actions">
        <button onClick={() => setMode("create")}>
          <Home size={20} />
          <strong>{t("创建家庭", "Create Family")}</strong>
          <small>{t("开始一个新的共享小家", "Start a new shared home")}</small>
        </button>
        <button onClick={() => setMode("join")}>
          <Users size={20} />
          <strong>{t("邀请码加入", "Join with Code")}</strong>
          <small>{t("连接已有的家", "Connect to an existing home")}</small>
        </button>
      </div>
      <div className="stack">
        {(families.data?.families ?? []).map((family) => (
          <FamilyCard family={family} key={family.id} />
        ))}
      </div>
      <button
        className="text-button"
        onClick={() => setDeleted((value) => !value)}
      >
        {deleted ? t("收起已删除的家庭", "Hide Deleted Families") : t("查看已删除的家庭", "View Deleted Families")}
      </button>
      {deleted && (
        <DeletedFamilies
          onRestored={() => {
            setToast(t("家庭已恢复。", "Family restored."));
            invalidate();
          }}
        />
      )}
      {mode && (
        <FamilyForm
          mode={mode}
          onClose={() => setMode(null)}
          onSaved={(message) => {
            setMode(null);
            setToast(message);
            invalidate();
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
  );
}

export function FamilyCard({ family }: { family: Family }) {
  const detail = useQuery({
    queryKey: queryKeys.family(family.id),
    queryFn: () =>
      api.get<{ family: Family; members: Member[] }>(`/families/${family.id}`),
  });
  const pets = useQuery({
    queryKey: ["family-pets", family.id],
    queryFn: () => api.get<{ pets: Pet[] }>(`/families/${family.id}/pets`),
  });
  const t = useT();
  return (
    <Link className="family-card" to={`/families/${family.id}`}>
      <span className="family-icon">
        <Home size={22} />
      </span>
      <div>
        <span className="role-pill">{roleLabel(family.role)}</span>
        <h2>{family.name}</h2>
        <p>{timezoneCity(family.timezone)}</p>
        <small>
          {detail.isLoading || pets.isLoading
            ? t("统计加载中…", "Loading stats…")
            : detail.error || pets.error
              ? t("统计暂不可用", "Stats unavailable")
              : t(
                  `${detail.data?.members.length ?? 0} 位成员 · ${pets.data?.pets.length ?? 0} 只宠物`,
                  `${detail.data?.members.length ?? 0} members · ${pets.data?.pets.length ?? 0} pets`,
                )}
        </small>
      </div>
      <ChevronRight size={19} />
    </Link>
  );
}
export function FamilyForm({
  mode,
  onClose,
  onSaved,
  pageVariant = false,
}: {
  mode: "create" | "join";
  onClose: () => void;
  onSaved: (message: string) => void;
  /** 作为独立页面渲染时去掉遮罩与关闭钮。 */
  pageVariant?: boolean;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  const t = useT();
  async function previewInvite() {
    setBusy(true);
    try {
      setPreview(
        await api.get<Record<string, unknown>>(
          `/invite/${encodeURIComponent(code.trim())}`,
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      if (mode === "create") {
        const result = await api.post<{ family: Family; invite_code: string }>(
          "/families",
          { name: name.trim(), timezone },
          { idempotencyKey: commandId.current },
        );
        commandId.current = createCommandId();
        onSaved(t(
          `家庭已创建。邀请码：${result.invite_code}`,
          `Family created. Invite code: ${result.invite_code}`,
        ));
        navigate(`/families/${result.family.id}`);
      } else {
        const result = await api.post<{ family: Family }>(
          "/families/join",
          { code: code.trim() },
          { idempotencyKey: commandId.current },
        );
        commandId.current = createCommandId();
        onSaved(t(`已加入「${result.family.name}」。`, `Joined "${result.family.name}".`));
        navigate(`/families/${result.family.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`modal-backdrop ${pageVariant ? "page-variant" : ""}`} onMouseDown={pageVariant ? undefined : (event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${pageVariant ? "page-variant" : ""}`}>
        {!pageVariant && (
          <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={18} />
          </button>
        )}
        <span className="eyebrow">
          {mode === "create" ? t("一个新的共享小家", "A New Shared Home") : t("你收到邀请了", "You've Been Invited")}
        </span>
        <h2>{mode === "create" ? t("创建家庭", "Create Family") : t("加入家庭", "Join Family")}</h2>
        {mode === "create" ? (
          <>
            <label className="form-field">
              <span>{t("名称", "Name")}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <label className="form-field">
              <span>{t("时区（默认跟随本机）", "Time Zone (defaults to this device)")}</span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {timezoneOptions(timezone).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz === timezone ? t(`${timezoneLabel(tz)} · 本机`, `${timezoneLabel(tz)} · This device`) : timezoneLabel(tz)}
                  </option>
                ))}
              </select>
              <small className="field-help">{t("家庭时区决定「今天」从几点算起。", "The family time zone decides when “Today” begins.")}</small>
            </label>
          </>
        ) : (
          <>
            <label className="form-field">
              <span>{t("邀请码", "Invite Code")}</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder={t("如 KU4BAK2XEP", "e.g. KU4BAK2XEP")}
                autoFocus
              />
            </label>
            {preview && (
              <Card className="preview">
                <strong>
                  {preview.inviter_name
                    ? t(
                        `${String(preview.inviter_name)} 邀请你一起照顾 ${String(preview.pet_name ?? "他们的宠物")}`,
                        `${String(preview.inviter_name)} invited you to help care for ${String(preview.pet_name ?? "their pet")}`,
                      )
                    : t("家庭邀请", "Family Invite")}
                </strong>
                <p>{t("确认上面的信息，再点击加入。", "Confirm the details above, then tap Join.")}</p>
              </Card>
            )}
            <button
              className="button ghost full"
              disabled={!code.trim() || busy}
              onClick={() => void previewInvite()}
            >
              {t("预览邀请", "Preview Invite")}
            </button>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {mode === "create" ? t("创建家庭", "Create Family") : t("加入", "Join")}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
export function DeletedFamilies({ onRestored }: { onRestored: () => void }) {
  const query = useQuery({
    queryKey: queryKeys.deletedFamilies(),
    queryFn: () =>
      api.get<{
        families: Array<{ id: string; name: string; deleted_at: string }>;
      }>("/families/deleted"),
  });
  const [error, setError] = useState("");
  const t = useT();
  if (query.isLoading) return <PageSkeleton />;
  return (
    <div className="stack compact">
      {(query.data?.families ?? []).map((family) => (
        <Card key={family.id}>
          <div className="row-between">
            <div>
              <strong>{family.name}</strong>
              <small>
                {t("删除于", "Deleted on")} {formatDate(family.deleted_at)}
              </small>
            </div>
            <button
              className="button ghost"
              onClick={async () => {
                setError("");
                try {
                  await api.post(`/families/${family.id}/restore`, undefined, { idempotencyKey: createCommandId() });
                  onRestored();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              {t("恢复", "Restore")}
            </button>
          </div>
        </Card>
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export function FamilyPage() {
  const { familyId = "" } = useParams();
  const query = useQuery({
    queryKey: queryKeys.family(familyId),
    queryFn: () =>
      api.get<{ family: Family; members: Member[] }>(`/families/${familyId}`),
    enabled: Boolean(familyId),
  });
  const pets = useQuery({
    queryKey: ["family-pets", familyId],
    queryFn: () => api.get<{ pets: Pet[] }>(`/families/${familyId}/pets`),
    enabled: Boolean(familyId),
  });
  const [edit, setEdit] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | Member | null>(
    null,
  );
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const t = useT();
  if (query.isLoading || pets.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (query.error || !query.data)
    return (
      <Page>
        <InlineError error={query.error ?? new Error(t("这个家庭不存在或对你不可见", "This family doesn't exist or isn't visible to you"))} />
      </Page>
    );
  const { family, members } = query.data;
  const isOwner = family.role === "owner";
  async function destructive() {
    if (confirm === "delete") {
      await api.delete(`/families/${family.id}`, { confirm: family.name });
      navigate("/families");
    } else if (confirm === "leave") {
      await api.post(`/families/${family.id}/leave`);
      navigate("/families");
    } else if (confirm && typeof confirm === "object") {
      await api.delete(`/families/${family.id}/members/${confirm.user_id}`);
      await query.refetch();
    }
    setConfirm(null);
    invalidate();
  }
  async function refreshInvite() {
    setError("");
    try {
      const result = await api.post<{ invite_code: string }>(
        `/families/${family.id}/invite/refresh`,
        undefined,
        { idempotencyKey: createCommandId() },
      );
      setInvite(result.invite_code);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="detail-view">
      <BackHeader title={family.name} />
      <Page className="more-page family-detail-page">
        {error && <p className="form-error" role="alert">{error}</p>}
        <section className="family-hero">
          <span className="family-icon" aria-hidden>
            <Home size={22} />
          </span>
          <div>
            <h1>{family.name}</h1>
            <p>
              {timezoneLabel(family.timezone)} ·{" "}
              {t(
                `${members.length} 位成员 · ${pets.data?.pets.length ?? 0} 只宠物`,
                `${members.length} members · ${pets.data?.pets.length ?? 0} pets`,
              )}
            </p>
          </div>
          <span className="role-pill">{roleLabel(family.role)}</span>
        </section>
        {invite && (
          <Card className="invite-card">
            <span className="eyebrow">{t("邀请码", "Invite Code")}</span>
            <strong>{invite}</strong>
            <button
              className="copy-link"
              onClick={() => void navigator.clipboard?.writeText(invite)}
            >
              <Copy size={15} /> {t("复制", "Copy")}
            </button>
          </Card>
        )}
        <MoreGroup label={t(`成员 · ${members.length}`, `Members · ${members.length}`)}>
          {members.map((member) => (
            <div className="more-row member-row-in-card" key={member.user_id}>
              <span className="avatar-dot" aria-hidden>
                {member.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="more-row-copy">
                <strong>{member.display_name}</strong>
                <small>{member.email ?? roleLabel(member.role)}</small>
              </span>
              <span className="role-pill">{roleLabel(member.role)}</span>
              {isOwner && member.role !== "owner" && (
                <button
                  className="icon-button subtle"
                  onClick={() => setConfirm(member)}
                  aria-label={t(`移除 ${member.display_name}`, `Remove ${member.display_name}`)}
                >
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
          {isOwner && (
            <MoreRow
              icon={<UserPlus size={19} />}
              title={t("邀请加入", "Invite People")}
              sub={t("生成新的邀请码，分享给要一起照顾的人", "Generate a new invite code to share with the people who'll care together")}
              onClick={() => void refreshInvite()}
            />
          )}
        </MoreGroup>
        <MoreGroup label={t(`宠物 · ${pets.data?.pets.length ?? 0}`, `Pets · ${pets.data?.pets.length ?? 0}`)}>
          <FamilyHandoffSummary familyId={family.id} />
          {(pets.data?.pets ?? []).map((pet) => (
            <MoreRow
              key={pet.id}
              icon={<PetAvatar petId={pet.id} species={pet.species} size={38} decorative />}
              title={pet.name}
              sub={[pet.breed || speciesLabel(pet.species), ageShort(pet.birth_date)]
                .filter(Boolean)
                .join(" · ")}
              to={`/pets/${pet.id}`}
            />
          ))}
          {(pets.data?.pets ?? []).length === 0 && (
            <p className="scope-sheet-empty">{t("这个家庭还没有宠物", "This family has no pets yet")}</p>
          )}
          <MoreRow
            icon={<PawPrint size={19} />}
            title={t("管理宠物", "Manage Pets")}
            sub={t("档案、照护提醒、健康趋势", "Profiles, care reminders, health trends")}
            to="/pets"
          />
        </MoreGroup>
        <MoreGroup label={t("设置", "Settings")}>
          <MoreRow
            icon={<Pencil size={19} />}
            title={t("家庭信息", "Family Info")}
            sub={isOwner ? t("名称与时区", "Name and time zone") : t("只有圈主可以修改", "Only the owner can change this")}
            onClick={isOwner ? () => setEdit(true) : undefined}
            right={isOwner ? undefined : <span className="role-pill">{t("仅圈主", "Owner only")}</span>}
          />
          {isOwner && (
            <MoreRow
              icon={<Users size={19} />}
              title={t("转让圈主", "Transfer Ownership")}
              sub={t("选择一位成员接任，你会变成照护者", "Pick a member to take over; you'll become a caregiver")}
              onClick={() => setTransferOpen(true)}
            />
          )}
          <MoreRow
            icon={<Undo2 size={19} />}
            title={t("宠物转移请求", "Pet Transfer Requests")}
            sub={t("转入与转出的记录，待处理需在此响应", "Incoming and outgoing transfers; respond to pending ones here")}
            to={`/families/${family.id}/transfers`}
          />
        </MoreGroup>
        <div className="more-danger">
          <button
            className="danger-link"
            onClick={() => {
              if (!isOwner) {
                setConfirm("leave");
                return;
              }
              // 删除家庭前必须清空宠物链接（后端 409 FAMILY_NOT_EMPTY）。
              // 有宠物时先进引导面板逐只安置，而不是让用户撞英文 409。
              if ((pets.data?.pets.length ?? 0) > 0) setRelocating(true);
              else setConfirm("delete");
            }}
          >
            <Trash2 size={16} /> {isOwner ? t("删除家庭", "Delete Family") : t("退出家庭", "Leave Family")}
          </button>
        </div>
        {edit && (
          <FamilyEdit
            family={family}
            onClose={() => setEdit(false)}
            onSaved={() => {
              setEdit(false);
              void query.refetch();
            }}
          />
        )}
        {transferOpen && (
          <TransferOwner
            familyId={family.id}
            members={members.filter((member) => member.role !== "owner")}
            onClose={() => setTransferOpen(false)}
            onSaved={() => {
              setTransferOpen(false);
              void query.refetch();
              invalidate();
            }}
          />
        )}
        {relocating && (
          <RelocateDialog
            family={family}
            pets={pets.data?.pets ?? []}
            onClose={() => setRelocating(false)}
            onChanged={() => {
              void pets.refetch();
              invalidate();
            }}
            onReadyToDelete={() => {
              setRelocating(false);
              setConfirm("delete");
            }}
          />
        )}
        {confirm && (
          <ConfirmDialog
            title={
              confirm === "delete"
                ? t(`删除「${family.name}」？`, `Delete "${family.name}"?`)
                : confirm === "leave"
                  ? t(`退出「${family.name}」？`, `Leave "${family.name}"?`)
                  : t(`移除 ${confirm!.display_name}？`, `Remove ${confirm!.display_name}?`)
            }
            consequence={
              confirm === "delete"
                ? t(
                    "成员关系与邀请立即结束；宠物已在别处安置，历史数据不受影响。",
                    "Membership and invites end immediately; pets are settled elsewhere and history is unaffected.",
                  )
                : t("你的访问会立即结束；已有历史不受影响。", "Your access ends immediately; existing history is unaffected.")
            }
            confirmLabel={
              confirm === "delete"
                ? t("删除家庭", "Delete Family")
                : confirm === "leave"
                  ? t("退出家庭", "Leave Family")
                  : t("移除成员", "Remove Member")
            }
            requireText={confirm === "delete" ? family.name : undefined}
            onCancel={() => setConfirm(null)}
            onConfirm={destructive}
          />
        )}
      </Page>
    </div>
  );
}

/** 删家庭前的宠物安置引导：逐只「转移」或「解除链接」，清空后解锁删除。 */
function RelocateDialog({
  family,
  pets,
  onClose,
  onChanged,
  onReadyToDelete,
}: {
  family: Family;
  pets: Pet[];
  onClose: () => void;
  onChanged: () => void;
  onReadyToDelete: () => void;
}) {
  const t = useT();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  async function unlink(pet: Pet) {
    setBusyId(pet.id);
    setError("");
    try {
      await api.delete(`/pets/${pet.id}/families/${family.id}`);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId("");
    }
  }
  return createPortal(
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="relocate-title">
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          ×
        </button>
        <span className="eyebrow">{t("删除家庭 · 先安置宠物", "Delete Family · Settle Pets First")}</span>
        <h2 id="relocate-title">
          {pets.length > 0
            ? t(`「${family.name}」里还有 ${pets.length} 只宠物`, `${pets.length} pets are still linked to "${family.name}"`)
            : t("全部宠物已安置妥当", "All pets are settled")}
        </h2>
        <p>
          {pets.length > 0
            ? t(
                "删除家庭前，先把每只宠物转移到另一个家庭，或解除它与这个家庭的链接（每只宠物至少保留一个家庭）。历史记录不会受影响。",
                "Before deleting, transfer each pet to another family or unlink it here (every pet keeps at least one family). History is unaffected.",
              )
            : t("现在可以安全删除这个家庭了。", "The family is now safe to delete.")}
        </p>
        <div className="stack compact">
          {pets.map((pet) => {
            const multiFamily = (pet.family_ids ?? []).length > 1;
            return (
              <div className="row-between" key={pet.id}>
                <span className="more-row-copy">
                  <strong>{pet.name}</strong>
                  <small>
                    {multiFamily
                      ? t("已链接多个家庭，可直接解除", "Linked to multiple families — safe to unlink")
                      : t("只链接了这个家庭，需要先转移", "Only this family — transfer first")}
                  </small>
                </span>
                <span className="row-actions">
                  <Link className="button ghost" to={`/pets/${pet.id}/transfer`}>
                    {t("转移", "Transfer")}
                  </Link>
                  {multiFamily && (
                    <BusyButton
                      className="button ghost"
                      busy={busyId === pet.id}
                      onClick={() => void unlink(pet)}
                    >
                      {t("解除链接", "Unlink")}
                    </BusyButton>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("稍后再说", "Later")}
          </button>
          {pets.length === 0 && (
            <button className="button primary" onClick={onReadyToDelete}>
              {t("继续删除家庭", "Continue to Delete")}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
export function FamilyEdit({
  family,
  onClose,
  onSaved,
}: {
  family: Family;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(family.name);
  const [timezone, setTimezone] = useState(family.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  const t = useT();
  async function save() {
    setError("");
    setBusy(true);
    try {
      await api.patch(
        `/families/${family.id}`,
        { name, timezone },
        { idempotencyKey: commandId.current },
      );
      commandId.current = createCommandId();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("家庭设置", "Family Settings")}</span>
        <h2>{t("编辑家庭", "Edit Family")}</h2>
        <label className="form-field">
          <span>{t("名称", "Name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label className="form-field">
          <span>{t("时区", "Time Zone")}</span>
          <select
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            {timezoneOptions(timezone).map((tz) => (
              <option key={tz} value={tz}>
                {timezoneLabel(tz)}
              </option>
            ))}
          </select>
          <small className="field-help">{t("改动会影响家庭「今天」的边界与提醒时间。", "Changes affect the family's “Today” boundary and reminder times.")}</small>
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {t("保存修改", "Save Changes")}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function TransferOwner({
  familyId,
  members,
  onClose,
  onSaved,
}: {
  familyId: string;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(members[0]?.user_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useT();
  async function transfer() {
    if (!userId) {
      setError(t("请选择一位家庭成员。", "Please choose a family member."));
      return;
    }
    setBusy(true);
    try {
      await api.post(
        `/families/${familyId}/transfer`,
        { to_user_id: userId },
        { idempotencyKey: createCommandId() },
      );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("家庭治理", "Family Governance")}</span>
        <h2>{t("转让圈主", "Transfer Ownership")}</h2>
        <p>
          {t("服务端确认后，你会变成普通照护者。", "Once the server confirms, you'll become a regular caregiver.")}
        </p>
        <label className="form-field">
          <span>{t("新圈主", "New Owner")}</span>
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={transfer}>
            {t("确认转让", "Confirm Transfer")}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

function ageShort(birthDate: string | undefined): string {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (months < 12) return tt("未满岁", "Under 1 yr");
  return tt(`${Math.floor(months / 12)} 岁`, `${Math.floor(months / 12)} yr`);
}
