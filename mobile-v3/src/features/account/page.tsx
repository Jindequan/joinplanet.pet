import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { errorMessage, isApiError } from "../../core/api/errors";
import { useSession } from "../../core/auth/session-context";
import { EmptyState, InlineError, PageSkeleton, Toast, BusyButton, ConfirmDialog } from "../../core/ui";
import { queryKeys } from "../../core/query/keys";
import { Bell, ChevronRight, Home, PawPrint, Trash2, Users } from "lucide-react";
import { CreatePet } from "../pets/page";
import { DeletedFamilies, FamilyForm } from "../families/page";
import { sexLabel, speciesLabel } from "../../core/display";
import { MoreGroup, MoreRow } from "../../ui/more";
import { AlertSummary, BackHeader, Brand, Card, DigestView, Page, PageTitle, SharedViewResponse, civilDateInTimezone, useFamilies, usePets,
} from "../../app/shared";

export function AccountPage() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () =>
      api.get<{ user: typeof user; entitlements: unknown[] }>("/me"),
  });
  const preferences = useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: () =>
      api.get<{
        preferences: { default_family_id?: string; default_pet_id?: string };
      }>("/me/preferences"),
  });
  const [name, setName] = useState(user?.display_name ?? "");
  const [locale, setLocale] = useState(user?.locale ?? "zh-CN");
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [familyMode, setFamilyMode] = useState<"create" | "join" | null>(null);
  const families = useFamilies();
  const pets = usePets();
  if (!user) return null;
  const accountUser = user;
  async function saveName() {
    setBusy(true);
    try {
      await api.patch("/me", { display_name: name.trim() });
      await me.refetch();
      setToast("账户信息已保存。");
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveLocale(value: string) {
    const previous = locale;
    setLocale(value);
    try {
      await api.patch("/me", { locale: value });
      await me.refetch();
      setToast("语言偏好已保存。");
    } catch (e) {
      setLocale(previous);
      setToast(errorMessage(e));
    }
  }
  async function saveDefault(kind: "family" | "pet", value: string) {
    try {
      await api.patch(
        "/me/preferences",
        kind === "family"
          ? { default_family_id: value || null }
          : { default_pet_id: value || null },
      );
      await preferences.refetch();
      setToast("默认项已更新。");
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  async function deleteAccount() {
    await api.delete("/account", { confirm: accountUser.email });
    navigate("/account/deleted", { replace: true });
    await signOut(false);
  }
  const petCount = pets.data?.pets.filter((pet) => !pet.archived_at).length ?? 0;
  const familyCount = families.data?.families.length ?? 0;
  return (
    <Page className="account-page more-page">
      {/* 身份：唯一的大卡片，之后全部是分区列表 */}
      <section className="more-identity">
        <span className="account-avatar">
          {accountUser.display_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{accountUser.display_name}</strong>
          <small>{accountUser.email}</small>
        </div>
        <span className="role-pill">免费版</span>
      </section>

      <MoreGroup label="照护">
        <MoreRow
          icon={<PawPrint size={19} />}
          title="宠物管理"
          sub={petCount ? `${petCount} 只宠物 · 档案、提醒、健康` : "创建你的第一只宠物"}
          to="/pets"
        />
        <MoreRow
          icon={<Home size={19} />}
          title="家庭管理"
          sub={familyCount ? `${familyCount} 个家庭 · 成员、邀请、移交圈主` : "创建或加入一个家庭"}
          to="/families"
        />
      </MoreGroup>

      <MoreGroup label="偏好">
        <MoreRow
          icon={<Bell size={19} />}
          title="通知"
          sub="照护提醒 · 每日摘要 · 异常警报"
          to="/settings/notifications"
        />
        <MoreRow
          icon={<PawPrint size={19} />}
          title="通用与数据"
          sub="摘要预览 · 照护警报 · 已删除的家庭"
          to="/settings"
        />
        <div className="more-inline">
          <span className="more-inline-label">打开应用时默认看到</span>
          <div className="more-inline-fields">
            <label className="form-field">
              <span>家庭</span>
              <select
                value={preferences.data?.preferences.default_family_id ?? ""}
                onChange={(event) =>
                  void saveDefault("family", event.target.value)
                }
              >
                <option value="">全部家庭</option>
                {(families.data?.families ?? []).map((family) => (
                  <option value={family.id} key={family.id}>
                    {family.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>宠物</span>
              <select
                value={preferences.data?.preferences.default_pet_id ?? ""}
                onChange={(event) =>
                  void saveDefault("pet", event.target.value)
                }
              >
                <option value="">不设默认</option>
                {(pets.data?.pets ?? []).map((pet) => (
                  <option value={pet.id} key={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="more-inline">
          <span className="more-inline-label">语言（消息与日期）</span>
          <select
            className="more-inline-select"
            value={locale}
            onChange={(event) => void saveLocale(event.target.value)}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English（英语）</option>
          </select>
        </div>
      </MoreGroup>

      <MoreGroup label="账号与安全">
        <div className="more-inline">
          <span className="more-inline-label">显示名</span>
          <div className="form-inline">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <BusyButton
              className="button primary"
              busy={busy}
              onClick={saveName}
            >
              保存
            </BusyButton>
          </div>
        </div>
        {/* 登录设备与用量暂时下线，后续随需求恢复 */}
      </MoreGroup>

      <div className="more-danger">
        <button className="sign-out" onClick={() => void signOut(true)}>
          <LogOutIcon /> 退出当前设备
        </button>
        <button className="danger-link muted" onClick={() => setConfirm(true)}>
          <Trash2 size={16} /> 删除账户
        </button>
      </div>

      {confirm && (
        <ConfirmDialog
          title="删除你的 Planet 账户？"
          consequence="名下资源会进入服务端保护期流程；删除成功后你会被退出登录。"
          confirmLabel="删除账户"
          requireText={accountUser.email}
          onCancel={() => setConfirm(false)}
          onConfirm={deleteAccount}
        />
      )}
      {familyMode && (
        <FamilyForm
          mode={familyMode}
          onClose={() => setFamilyMode(null)}
          onSaved={(message) => {
            setFamilyMode(null);
            setToast(message);
            void families.refetch();
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
  );
}

function speciesShort(species: unknown): string {
  return speciesLabel(typeof species === "string" ? species : undefined);
}
function taskStatusLabel(task: Record<string, unknown>): string {
  const raw =
    typeof task.log_status === "string"
      ? task.log_status
      : typeof task.status === "string"
        ? task.status
        : "pending";
  return (
    ({ done: "已完成", completed: "已完成", skipped: "已跳过" } as Record<string, string>)[raw] ??
    "待完成"
  );
}

export function LogOutIcon() {
  return (
    <span className="button-icon">
      <span>↗</span>
    </span>
  );
}

export function NotificationSettings() {
  const families = useFamilies();
  const [familyId, setFamilyId] = useState("");
  const selectedFamilyId = familyId || families.data?.families[0]?.id || "";
  const query = useQuery({
    queryKey: queryKeys.notificationPrefs(selectedFamilyId),
    queryFn: () =>
      api.get<{
        prefs: { reminders: boolean; digest: boolean; alerts: boolean };
      }>(`/families/${selectedFamilyId}/notification-prefs`),
    enabled: Boolean(selectedFamilyId),
  });
  const [toast, setToast] = useState("");
  const prefs = query.data?.prefs;
  async function toggle(
    key: "reminders" | "digest" | "alerts",
    value: boolean,
  ) {
    try {
      await api.put(`/families/${selectedFamilyId}/notification-prefs`, {
        [key]: value,
      });
      await query.refetch();
      setToast("通知偏好已保存。");
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  return (
    <div className="detail-view">
      <BackHeader title="通知设置" />
      <Page>
        <PageTitle
          eyebrow="按家庭生效"
          title="通知设置"
          description="这些开关属于每个家庭，由服务端保存，不是全局假开关。"
        />
        <label className="form-field">
          <span>选择家庭</span>
          <select
            value={selectedFamilyId}
            onChange={(event) => setFamilyId(event.target.value)}
          >
            {(families.data?.families ?? []).map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </select>
        </label>
        <Card>
          {(["reminders", "digest", "alerts"] as const).map((key) => (
            <label className="toggle-row" key={key}>
              <span>
                <strong>
                  {key === "reminders"
                    ? "照护提醒"
                    : key === "digest"
                      ? "每日摘要"
                      : "照护异常警报"}
                </strong>
                <small>由服务端保存的偏好</small>
              </span>
              <input
                type="checkbox"
                checked={Boolean(prefs?.[key])}
                onChange={(event) => void toggle(key, event.target.checked)}
              />
            </label>
          ))}
        </Card>
        {toast && <Toast message={toast} onClose={() => setToast("")} />}
      </Page>
    </div>
  );
}

export function FamilyFormRoute({ mode }: { mode: "create" | "join" }) {
  const navigate = useNavigate();
  return (
    <div className="detail-view">
      <BackHeader title={mode === "create" ? "创建家庭" : "加入家庭"} />
      <Page className="family-form-page">
        <FamilyForm
          mode={mode}
          pageVariant
          onClose={() => navigate("/families")}
          onSaved={() => navigate("/families")}
        />
      </Page>
    </div>
  );
}

export function CreatePetRoute() {
  const families = useFamilies();
  const navigate = useNavigate();
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
  return (
    <Page>
      <CreatePet
        families={families.data?.families ?? []}
        onClose={() => navigate("/pets")}
      />
    </Page>
  );
}
export function DeletedFamiliesPage() {
  const client = useQueryClient();
  return (
    <div className="detail-view">
      <BackHeader title="Deleted families" />
      <Page>
        <PageTitle
          eyebrow="RECOVERY"
          title="Deleted families"
          description="Restore a Family during its protected recovery period."
        />
        <DeletedFamilies
          onRestored={() =>
            void client.invalidateQueries({ queryKey: ["families"] })
          }
        />
      </Page>
    </div>
  );
}
export function SettingsPage() {
  const families = useFamilies();
  const familyId = families.data?.families[0]?.id ?? "";
  const digest = useQuery({
    queryKey: queryKeys.digest(
        familyId,
        civilDateInTimezone(
          families.data?.families.find((item) => item.id === familyId)?.timezone,
        ),
      ),
    queryFn: () => api.get<DigestView>(`/families/${familyId}/digest`),
    enabled: Boolean(familyId),
  });
  const alerts = useQuery({
    queryKey: queryKeys.alerts(familyId),
    queryFn: () =>
      api.get<{ alerts: AlertSummary[] }>(`/families/${familyId}/alerts`),
    enabled: Boolean(familyId),
  });
  return (
    <div className="detail-view">
      <BackHeader title="设置" />
      <Page>
        <PageTitle
          eyebrow="按你的方式"
          title="设置"
          description="这里只展示真实的服务端状态，没有任何假装成功的操作。"
        />
        <div className="settings-links">
          <Link to="/settings/notifications">
            <Bell size={18} />
            <span>
              <strong>通知</strong>
              <small>家庭提醒、每日摘要与异常警报</small>
            </span>
            <ChevronRight size={17} />
          </Link>
          <Link to="/families">
            <Users size={18} />
            <span>
              <strong>家庭</strong>
              <small>成员、邀请与治理</small>
            </span>
            <ChevronRight size={17} />
          </Link>
          <Link to="/account/deleted-families">
            <Trash2 size={18} />
            <span>
              <strong>已删除的家庭</strong>
              <small>保护期内可一键恢复</small>
            </span>
            <ChevronRight size={17} />
          </Link>
        </div>
        <Card>
          <span className="eyebrow">今日摘要</span>
          {digest.isLoading ? (
            <PageSkeleton />
          ) : digest.error ? (
            <InlineError
              error={digest.error}
              onRetry={() => void digest.refetch()}
            />
          ) : digest.data?.pets.length ? (
            <div className="stack compact">
              <p className="muted-copy">
                {digest.data.date}（{digest.data.timezone}）
              </p>
              {digest.data.pets.map((pet) => (
                <div className="data-list" key={pet.pet_id}>
                  <div>
                    <dt>{pet.pet_name}</dt>
                    <dd>
                      完成 {pet.done.length} · 待办 {pet.pending.length} · 已跳过 {pet.skipped.length}
                    </dd>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">这个家庭还没有照护摘要。</p>
          )}
        </Card>
        <Card>
          <span className="eyebrow">照护警报</span>
          {alerts.isLoading ? (
            <PageSkeleton />
          ) : alerts.error ? (
            <InlineError
              error={alerts.error}
              onRetry={() => void alerts.refetch()}
            />
          ) : (alerts.data?.alerts ?? []).length ? (
            <div className="stack compact">
              {alerts.data?.alerts.map((alert) => (
                <div className="notice" key={alert.id}>
                  <div>
                    <strong>
                      {alert.pet_name} · {alert.title}
                    </strong>
                    <p>{alert.body}</p>
                  </div>
                  <span className="role-pill">
                    {alert.severity === "high"
                      ? "高"
                      : alert.severity === "medium"
                        ? "中"
                        : alert.severity === "low"
                          ? "低"
                          : alert.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">当前没有照护异常。</p>
          )}
        </Card>
      </Page>
    </div>
  );
}

export function SharedViewCard({ view }: { view: SharedViewResponse }) {
  const pet =
    view.data.pet && typeof view.data.pet === "object"
      ? (view.data.pet as Record<string, unknown>)
      : {};
  const tasks = Array.isArray(view.data.tasks)
    ? view.data.tasks.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
  const medications = Array.isArray(view.data.medications)
    ? view.data.medications.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
  const contacts = Array.isArray(view.data.emergency_contacts)
    ? view.data.emergency_contacts.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
  const notes =
    typeof view.data.notes === "string" && view.data.notes
      ? view.data.notes
      : "";
  const date =
    typeof view.data.date === "string" && view.data.date ? view.data.date : "";
  return (
    <div className="stack">
      <Card className="family-hero-card">
        <span className="pet-avatar large">
          <PawPrint size={32} />
        </span>
        <span className="eyebrow">{speciesShort(pet.species)}</span>
        <h2>{String(pet.name ?? "Shared pet")}</h2>
        <p>
          {[pet.breed, sexLabel(typeof pet.sex === "string" ? pet.sex : undefined)].filter(Boolean).map(String).join(" · ") ||
            "共享的照护信息"}
        </p>
      </Card>
      {date && (
        <Card>
          <span className="eyebrow">今日照护</span>
          <p className="muted-copy">{date}</p>
          {tasks.length ? (
            <div className="stack compact">
              {tasks.map((task, index) => (
                <div
                  className="row-between"
                  key={`${String(task.id ?? index)}`}
                >
                  <span>
                    <strong>{String(task.title ?? "照护事项")}</strong>
                    <small>{taskStatusLabel(task)}</small>
                  </span>
                  <span>{String(task.time_of_day ?? "时间未定")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">今天没有安排照护。</p>
          )}
        </Card>
      )}
      {medications.length > 0 && (
        <Card>
          <span className="eyebrow">用药</span>
          <div className="stack compact">
            {medications.map((med, index) => (
              <div key={`${String(med.id ?? index)}`}>
                <strong>{String(med.name ?? "药物")}</strong>
                <p>
                  {[med.dose, med.instructions ?? med.schedule]
                    .filter(Boolean)
                    .map(String)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {contacts.length > 0 && (
        <Card>
          <span className="eyebrow">紧急联系人</span>
          <div className="stack compact">
            {contacts.map((contact, index) => (
              <div key={`${String(contact.name ?? index)}`}>
                <strong>{String(contact.name ?? "联系人")}</strong>
                <p>{String(contact.phone ?? contact.email ?? "")}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {notes && (
        <Card>
          <span className="eyebrow">备注</span>
          <p className="long-copy">{notes}</p>
        </Card>
      )}
      <p className="muted-copy">
        这个只读视图将于 {new Date(view.expires_at).toLocaleString("zh-CN")} 过期。
      </p>
    </div>
  );
}

export function PublicSharePage() {
  const { token = "" } = useParams();
  const query = useQuery({
    queryKey: ["public-share", token],
    queryFn: () =>
      api.get<SharedViewResponse>(`/shares/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
  });
  if (query.isLoading)
    return (
      <div className="public-page">
        <PageSkeleton />
      </div>
    );
  if (query.error)
    return (
      <div className="public-page">
        <EmptyState
          title={
            isApiError(query.error) && query.error.status === 410
              ? "分享已过期"
              : "分享不可用"
          }
          description={
            isApiError(query.error) && query.error.status === 410
              ? "链接已失效或被圈主撤销。"
              : errorMessage(query.error, "这条链接已经不可访问。")
          }
        />
      </div>
    );
  return (
    <div className="public-page">
      <Brand />
      <PageTitle
        eyebrow="只读照护视图"
        title="共享的照护信息"
        description="任何人凭链接即可查看，无需注册；这个页面无法修改宠物的任何记录。"
      />
      {query.data && <SharedViewCard view={query.data} />}
    </div>
  );
}
export function NotFound() {
  return (
    <main className="center-page">
      <EmptyState
        title="Page not found"
        description="The route you requested does not exist."
        action={
          <Link className="button primary" to="/today">
            Back to Today
          </Link>
        }
      />
    </main>
  );
}
export function AccountDeletedPage() {
  return (
    <main className="center-page">
      <Brand />
      <EmptyState
        title="Your account is deleted"
        description="Your Planet account and access have been removed. You can start again with a new sign-in if you change your mind."
        action={
          <Link className="button primary" to="/auth">
            Return to sign in
          </Link>
        }
      />
    </main>
  );
}
