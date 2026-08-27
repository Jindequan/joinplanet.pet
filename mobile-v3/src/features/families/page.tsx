import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage } from "../../core/api/errors";
import { EmptyState, InlineError, PageSkeleton, Toast, BusyButton, ConfirmDialog } from "../../core/ui";
import { queryKeys } from "../../core/query/keys";
import { Check, ChevronRight, Copy, Home, Pencil, PawPrint, Plus, ShieldCheck, Trash2, Undo2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { AccessGrant, BackHeader, Card, Family, Member, Medication, Pet, Share, Transfer, Page, PageTitle, useFamilies, useInvalidate } from "../../app/shared";
import { roleLabel, speciesLabel, timezoneCity, timezoneLabel, timezoneOptions, TRANSFER_STATUS_LABELS } from "../../core/display";
import { MoreGroup, MoreRow } from "../../ui/more";
import { PetAvatar } from "../../ui/pet-avatar";

function transferStatus(status: string) {
  return TRANSFER_STATUS_LABELS[status] ?? status;
}

/** 「永久」分享用 100 年过期时间实现；展示层识别为永久。 */
function isPermanentExpiry(expiresAt: string): boolean {
  const year = new Date(expiresAt).getFullYear();
  return year >= new Date().getFullYear() + 50;
}

export function AssignmentsPage() {
  const { petId = "", planId = "" } = useParams();
  const pet = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => api.get<{ pet: Pet }>(`/pets/${petId}`),
    enabled: Boolean(petId),
  });
  const familyId = pet.data?.pet.family_ids[0] ?? "";
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
      <BackHeader title="照护负责人" />
      <Page>
        <PageTitle
          eyebrow="谁负责什么"
          title="照护负责人"
          description="负责人按当前家庭成员设置，由服务端校验权限。"
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
                      {isAssigned ? "已负责" : "未负责"}
                    </span>
                    {isOwner ? (
                      <small className="muted-copy">圈主</small>
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
                          ? "保存中…"
                          : isAssigned
                            ? "移除"
                            : "指派"}
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
            title={`移除 ${removeUser.display_name} 的负责？`}
            consequence="对方将不再负责这个照护计划。"
            confirmLabel="移除负责人"
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
  const current = new Set(pet.data.pet.family_ids);
  const options = (families.data?.families ?? []).filter(
    (family) => !current.has(family.id),
  );
  async function transfer() {
    if (!familyId) {
      setError("请选择目标家庭。");
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
      <BackHeader title="转移宠物" />
      <Page>
        <PageTitle
          eyebrow="宠物归属"
          title={`转移 ${pet.data.pet.name}`}
          description="需要目标家庭的圈主接受后，所有权才会真正变更。"
        />
        <Card>
          <label className="form-field">
            <span>目标家庭</span>
            <select
              value={familyId}
              onChange={(event) => setFamilyId(event.target.value)}
            >
              <option value="">选择家庭…</option>
              {options.map((family) => (
                <option value={family.id} key={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </label>
          {options.length === 0 && (
            <p className="muted-copy">
              请先创建或加入另一个家庭，再发起转移。
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <BusyButton
            className="button primary"
            busy={busy}
            disabled={!familyId}
            onClick={() => void transfer()}
          >
            发送转移请求
          </BusyButton>
        </Card>
      </Page>
    </div>
  );
}

export function FamilyTransfersPage() {
  const { familyId = "" } = useParams();
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
      setToast(`转移请求已${action === "accept" ? "接受" : action === "decline" ? "婉拒" : "取消"}。`);
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
      <BackHeader title="宠物转移" />
      <Page>
        <PageTitle
          eyebrow="宠物归属"
          title="转移请求"
          description="只有目标家庭的圈主接受后，所有权才会变更。"
        />
        <div className="segmented">
          <button
            className={direction === "incoming" ? "selected" : ""}
            onClick={() => setDirection("incoming")}
          >
            收到的
          </button>
          <button
            className={direction === "outgoing" ? "selected" : ""}
            onClick={() => setDirection("outgoing")}
          >
            发出的
          </button>
        </div>
        {transfers.length === 0 ? (
          <EmptyState
            title="暂无转移请求"
            description="这个家庭收到的待处理请求会显示在这里。"
          />
        ) : (
          <div className="stack">
            {transfers.map((transfer) => (
              <Card key={transfer.id}>
                <div className="row-between">
                  <div>
                    <strong>{transfer.pet_name || transfer.pet_id}</strong>
                    <small>
                      {transferStatus(transfer.status)} ·{" "}
                      {new Date(transfer.created_at).toLocaleString("zh-CN")}
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
                          接受
                        </button>
                        <button
                          className="button ghost"
                          disabled={busyTransferId === transfer.id}
                          onClick={() => void act(transfer, "decline")}
                        >
                          婉拒
                        </button>
                      </div>
                    ) : (
                      <button
                        className="button ghost"
                        onClick={() => setTransferToCancel(transfer)}
                      >
                        取消请求
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
            title={`取消 ${transferToCancel.pet_name || "这只宠物"} 的转移？`}
            consequence="目标家庭将无法再接受这条请求。"
            confirmLabel="取消转移"
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
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
        <span className="eyebrow">用药</span>
        <h2>{initial ? `编辑 ${initial.name}` : "添加药物"}</h2>
        <label className="form-field">
          <span>药名</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>剂量</span>
          <input
            value={dose}
            onChange={(event) => setDose(event.target.value)}
            placeholder="1 片 / 5 ml"
          />
        </label>
        <label className="form-field">
          <span>频率</span>
          <input
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
            placeholder="每日 2 次 · 随餐"
          />
        </label>
        <label className="form-field">
          <span>备注</span>
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
            取消
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {initial ? "保存修改" : "添加药物"}
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
          <span className="eyebrow">私密链接</span>
          <h2>谨慎分享</h2>
        </div>
        {!pet.archived_at && (
          <button className="button primary" onClick={() => setShow(true)}>
            <Plus size={16} /> 创建分享
          </button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {created && (
        <Card className="success">
          <Check size={18} />
          <div>
            <strong>链接已复制，请尽快发给对方</strong>
            <p>明文 token 只显示这一次。</p>
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
          title="没有进行中的分享"
          description="可以为信任的人创建一条临时、只读的照护卡片或健康摘要。"
        />
      ) : (
        <div className="stack">
          {(query.data?.shares ?? []).map((share) => (
            <Card key={share.id}>
              <div className="row-between">
                <div>
                  <span className="eyebrow">{share.kind === "care_card" ? "照护卡片" : share.kind === "summary" ? "健康摘要" : share.kind}</span>
                  <h3>私密分享</h3>
                  <p>
                    {isPermanentExpiry(share.expires_at)
                      ? "永久有效"
                      : `${new Date(share.expires_at).toLocaleString("zh-CN")} 过期`}{" "}
                    · 已被查看 {share.view_count} 次
                  </p>
                </div>
                <button
                  className="icon-button subtle"
                  onClick={() => setConfirm(share)}
                  aria-label="撤销分享"
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
          title="撤销这条分享？"
          consequence="任何拿到链接的人都会立即失去只读访问。"
          confirmLabel="撤销分享"
          onCancel={() => setConfirm(null)}
          onConfirm={revoke}
        />
      )}
      <Card>
        <div className="section-heading">
          <div>
            <span className="eyebrow">直接授权</span>
            <h2>受托照护人</h2>
          </div>
          {!pet.archived_at && (
            <button className="button ghost" onClick={() => setShowGrant(true)}>
              <UserPlus size={15} /> 添加授权
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
            还没有直接授权；家庭可见性是另一条独立通道。
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
                    ? `${grant.expires_at} 到期`
                    : "永久有效"}
                </small>
              </div>
              <span className="role-pill">{roleLabel(grant.role)}</span>
              <button
                className="icon-button subtle"
                onClick={() => setGrantConfirm(grant)}
                aria-label="撤销授权"
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
          title={`撤销这位用户的授权？`}
          consequence="对方会立即失去对这只宠物的直接访问。"
          confirmLabel="撤销授权"
          onCancel={() => setGrantConfirm(null)}
          onConfirm={revokeGrant}
        />
      )}
      {!pet.archived_at && (
        <MoreGroup label="归属治理">
          <MoreRow
            icon={<Users size={19} />}
            title="转移所有权"
            sub="把这只宠物转给另一个家庭，需对方圈主接受"
            to={`/pets/${pet.id}/transfer`}
          />
        </MoreGroup>
      )}
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
  async function save() {
    if (!userId.trim()) {
      setError("先填用户 ID。");
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
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
        <span className="eyebrow">直接授权</span>
        <h2>授权访问这只宠物</h2>
        <p>当前契约按用户 ID 授权，不支持按邮箱查找。</p>
        <label className="form-field">
          <span>用户 ID</span>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>角色</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="editor">可编辑</option>
            <option value="viewer">可查看</option>
            <option value="read_only">只读</option>
          </select>
        </label>
        <label className="form-field">
          <span>过期时间（选填）</span>
          <input
            type="datetime-local"
            value={expires}
            min={new Date(new Date().getTime() - 60_000).toISOString().slice(0, 16)}
            onChange={(event) => setExpires(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <BusyButton
            className="button primary"
            busy={busy}
            disabled={!userId.trim()}
            onClick={save}
          >
            授予访问
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
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
        <span className="eyebrow">临时访问</span>
        <h2>创建私密分享</h2>
        <label className="form-field">
          <span>内容视图</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="care_card">照护卡片(今日行动)</option>
            <option value="summary">健康摘要</option>
          </select>
        </label>
        <label className="form-field">
          <span>有效期</span>
          <select value={ttl} onChange={(event) => setTtl(event.target.value)}>
            <option value="24">24 小时</option>
            <option value="72">3 天</option>
            <option value="168">7 天</option>
            <option value="720">30 天</option>
            <option value="2160">90 天</option>
            <option value="8760">1 年</option>
            <option value="876000">永久</option>
          </select>
          <p className="field-help">
            这是公开只读链接：任何人无需注册即可查看；到期或撤销后立即失效，可随时撤销。
          </p>
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            创建链接
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
          eyebrow="共同的家"
          title="把大家放进同一个照护空间"
          description="家庭把人、宠物和日常流程连在一起；你可以同时属于多个家庭。"
        />
        <section className="family-onboarding">
          <div className="family-onboarding-art">
            <span className="eyebrow">为什么先建家庭</span>
            <p>当每个人都看到同一份计划、知道谁做了什么、交接不再靠群聊，照顾才可靠。</p>
          </div>
          <div className="family-onboarding-actions">
            <Link to="/families/new">
              <span className="family-icon"><Home size={21} /></span>
              <span><strong>新建一个家庭</strong><small>你会成为圈主，接着可以添加宠物和邀请家人。</small></span>
              <ChevronRight size={19} />
            </Link>
            <Link to="/families/join">
              <span className="family-icon coral"><Users size={21} /></span>
              <span><strong>用邀请码加入</strong><small>连上别人已经建好的家庭。</small></span>
              <ChevronRight size={19} />
            </Link>
            <div className="privacy-note"><ShieldCheck size={17} /><span><strong>你们的记录保持私密。</strong><small>访问权限跟随家庭角色，圈主随时可以收回。</small></span></div>
          </div>
        </section>
      </Page>
    );
  return (
    <Page>
      <PageTitle
        eyebrow="每个家，一个视角"
        title="你的家庭"
        description="在家庭之间切换，不丢失任何一只宠物的完整图景。"
        action={
          <button className="button primary" onClick={() => setMode("create")}>
            <Plus size={16} /> 新建家庭
          </button>
        }
      />
      <div className="family-actions">
        <button onClick={() => setMode("create")}>
          <Home size={20} />
          <strong>创建家庭</strong>
          <small>开始一个新的共享小家</small>
        </button>
        <button onClick={() => setMode("join")}>
          <Users size={20} />
          <strong>邀请码加入</strong>
          <small>连接已有的家</small>
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
        {deleted ? "收起已删除的家庭" : "查看已删除的家庭"}
      </button>
      {deleted && (
        <DeletedFamilies
          onRestored={() => {
            setToast("家庭已恢复。");
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
            ? "统计加载中…"
            : detail.error || pets.error
              ? "统计暂不可用"
              : `${detail.data?.members.length ?? 0} 位成员 · ${pets.data?.pets.length ?? 0} 只宠物`}
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
        onSaved(`家庭已创建。邀请码：${result.invite_code}`);
        navigate(`/families/${result.family.id}`);
      } else {
        const result = await api.post<{ family: Family }>(
          "/families/join",
          { code: code.trim() },
          { idempotencyKey: commandId.current },
        );
        commandId.current = createCommandId();
        onSaved(`已加入「${result.family.name}」。`);
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
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        )}
        <span className="eyebrow">
          {mode === "create" ? "一个新的共享小家" : "你收到邀请了"}
        </span>
        <h2>{mode === "create" ? "创建家庭" : "加入家庭"}</h2>
        {mode === "create" ? (
          <>
            <label className="form-field">
              <span>名称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <label className="form-field">
              <span>时区（默认跟随本机）</span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {timezoneOptions(timezone).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz === timezone ? `${timezoneLabel(tz)} · 本机` : timezoneLabel(tz)}
                  </option>
                ))}
              </select>
              <small className="field-help">家庭时区决定「今天」从几点算起。</small>
            </label>
          </>
        ) : (
          <>
            <label className="form-field">
              <span>邀请码</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="如 ABCD-1234"
                autoFocus
              />
            </label>
            {preview && (
              <Card className="preview">
                <strong>
                  {preview.inviter_name
                    ? `${String(preview.inviter_name)} 邀请你一起照顾 ${String(preview.pet_name ?? "他们的宠物")}`
                    : "家庭邀请"}
                </strong>
                <p>确认上面的信息，再点击加入。</p>
              </Card>
            )}
            <button
              className="button ghost full"
              disabled={!code.trim() || busy}
              onClick={() => void previewInvite()}
            >
              预览邀请
            </button>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {mode === "create" ? "创建家庭" : "加入"}
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
  if (query.isLoading) return <PageSkeleton />;
  return (
    <div className="stack compact">
      {(query.data?.families ?? []).map((family) => (
        <Card key={family.id}>
          <div className="row-between">
            <div>
              <strong>{family.name}</strong>
              <small>
                删除于 {new Date(family.deleted_at).toLocaleDateString("zh-CN")}
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
              恢复
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
  const [confirm, setConfirm] = useState<"delete" | "leave" | Member | null>(
    null,
  );
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  if (query.isLoading || pets.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (query.error || !query.data)
    return (
      <Page>
        <InlineError error={query.error ?? new Error("这个家庭不存在或对你不可见")} />
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
      <Page>
        {error && <p className="form-error" role="alert">{error}</p>}
        <section className="family-hero">
          <span className="family-icon" aria-hidden>
            <Home size={22} />
          </span>
          <div>
            <h1>{family.name}</h1>
            <p>
              {timezoneLabel(family.timezone)} · {members.length} 位成员 ·{" "}
              {pets.data?.pets.length ?? 0} 只宠物
            </p>
          </div>
          <span className="role-pill">{roleLabel(family.role)}</span>
        </section>
        {invite && (
          <Card className="invite-card">
            <span className="eyebrow">邀请码</span>
            <strong>{invite}</strong>
            <button
              className="copy-link"
              onClick={() => void navigator.clipboard?.writeText(invite)}
            >
              <Copy size={15} /> 复制
            </button>
          </Card>
        )}
        <MoreGroup label={`成员 · ${members.length}`}>
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
                  aria-label={`移除 ${member.display_name}`}
                >
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
          {isOwner && (
            <MoreRow
              icon={<UserPlus size={19} />}
              title="邀请加入"
              sub="生成新的邀请码，分享给要一起照顾的人"
              onClick={() => void refreshInvite()}
            />
          )}
        </MoreGroup>
        <MoreGroup label={`宠物 · ${pets.data?.pets.length ?? 0}`}>
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
            <p className="scope-sheet-empty">这个家庭还没有宠物</p>
          )}
          <MoreRow
            icon={<PawPrint size={19} />}
            title="管理宠物"
            sub="档案、照护提醒、健康趋势"
            to="/pets"
          />
        </MoreGroup>
        <MoreGroup label="设置">
          <MoreRow
            icon={<Pencil size={19} />}
            title="家庭信息"
            sub={isOwner ? "名称与时区" : "只有圈主可以修改"}
            onClick={isOwner ? () => setEdit(true) : undefined}
            right={isOwner ? undefined : <span className="role-pill">仅圈主</span>}
          />
          {isOwner && (
            <MoreRow
              icon={<Users size={19} />}
              title="转让圈主"
              sub="选择一位成员接任，你会变成照护者"
              onClick={() => setTransferOpen(true)}
            />
          )}
          <MoreRow
            icon={<Undo2 size={19} />}
            title="宠物转移请求"
            sub="转入与转出的记录，待处理需在此响应"
            to={`/families/${family.id}/transfers`}
          />
        </MoreGroup>
        <div className="more-danger">
          <button
            className="danger-link"
            onClick={() => setConfirm(isOwner ? "delete" : "leave")}
          >
            <Trash2 size={16} /> {isOwner ? "删除家庭" : "退出家庭"}
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
        {confirm && (
          <ConfirmDialog
            title={
              confirm === "delete"
                ? `删除「${family.name}」？`
                : confirm === "leave"
                  ? `退出「${family.name}」？`
                  : `移除 ${confirm!.display_name}？`
            }
            consequence={
              confirm === "delete"
                ? "成员关系立即结束；已链接的宠物和历史依然受保护保留。"
                : "你的访问会立即结束；已有历史不受影响。"
            }
            confirmLabel={
              confirm === "delete"
                ? "删除家庭"
                : confirm === "leave"
                  ? "退出家庭"
                  : "移除成员"
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
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
        <span className="eyebrow">家庭设置</span>
        <h2>编辑家庭</h2>
        <label className="form-field">
          <span>名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label className="form-field">
          <span>时区</span>
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
          <small className="field-help">改动会影响家庭「今天」的边界与提醒时间。</small>
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            保存修改
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
  async function transfer() {
    if (!userId) {
      setError("请选择一位家庭成员。");
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
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
        <span className="eyebrow">家庭治理</span>
        <h2>转让圈主</h2>
        <p>
          服务端确认后，你会变成普通照护者。
        </p>
        <label className="form-field">
          <span>新圈主</span>
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
            取消
          </button>
          <BusyButton className="button primary" busy={busy} onClick={transfer}>
            确认转让
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
  if (months < 12) return "未满岁";
  return `${Math.floor(months / 12)} 岁`;
}
