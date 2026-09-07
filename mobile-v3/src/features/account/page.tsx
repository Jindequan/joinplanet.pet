import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { errorMessage, isApiError } from "../../core/api/errors";
import { useSession } from "../../core/auth/session-context";
import { useLang, useT, tt } from "../../core/i18n";
import { EmptyState, InlineError, PageSkeleton, Toast, BusyButton, ConfirmDialog } from "../../core/ui";
import { queryKeys } from "../../core/query/keys";
import { Bell, Home, PawPrint, Trash2, TrendingUp, Users } from "lucide-react";
import { CreatePet } from "../pets/page";
import { DeletedFamilies, FamilyForm } from "../families/page";
import { sexLabel, speciesLabel } from "../../core/display";
import { MoreGroup, MoreRow } from "../../ui/more";
import { AlertSummary, BackHeader, Brand, Card, DigestView, Page, PageTitle, SharedViewResponse, civilDateInTimezone, useFamilies, usePets,
} from "../../app/shared";

export function AccountPage() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const t = useT();
  const { lang, setLang } = useLang();
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
  const families = useFamilies();
  const pets = usePets();
  if (!user) return null;
  const accountUser = user;
  async function saveName() {
    setBusy(true);
    try {
      await api.patch("/me", { display_name: name.trim() });
      await me.refetch();
      setToast(t("账户信息已保存。", "Account info saved."));
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
      setToast(t("语言偏好已保存。", "Language preference saved."));
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
      setToast(t("默认项已更新。", "Default updated."));
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
    <Page className="more-page">
      {/* 身份：唯一的大卡片，之后全部是分区列表 */}
      <section className="more-identity">
        <span className="account-avatar" aria-hidden>
          {accountUser.display_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="more-identity-copy">
          <strong>{accountUser.display_name}</strong>
          <small>{accountUser.email}</small>
        </div>
        <span className="role-pill">{t("免费版", "Free plan")}</span>
      </section>

      <MoreGroup label={t("照护", "Care")}>
        <MoreRow
          icon={<PawPrint size={19} />}
          title={t("宠物管理", "Pet Management")}
          sub={petCount ? t(`${petCount} 只宠物 · 档案、提醒、健康`, `${petCount} pets · Profiles, reminders, health`) : t("创建你的第一只宠物", "Create your first pet")}
          to="/pets"
        />
        <MoreRow
          icon={<Home size={19} />}
          title={t("家庭管理", "Family Management")}
          sub={familyCount ? t(`${familyCount} 个家庭 · 成员、邀请、移交圈主`, `${familyCount} families · Members, invites, owner transfer`) : t("创建或加入一个家庭", "Create or join a family")}
          to="/families"
        />
        <MoreRow
          icon={<TrendingUp size={19} />}
          title={t("照护趋势", "Care Trends")}
          sub={t("完成率、体重变化与长期记录", "Completion, weight changes, and long-term records")}
          to="/trends"
        />
      </MoreGroup>

      <MoreGroup label={t("偏好", "Preferences")}>
        <MoreRow
          icon={<Bell size={19} />}
          title={t("通知", "Notifications")}
          sub={t("照护提醒 · 每日摘要 · 异常警报", "Care reminders · Daily digest · Alerts")}
          to="/settings/notifications"
        />
        <MoreRow
          icon={<PawPrint size={19} />}
          title={t("通用与数据", "General & Data")}
          sub={t("摘要预览 · 照护警报 · 已删除的家庭", "Digest preview · Care alerts · Deleted families")}
          to="/settings"
        />
        <div className="more-inline">
          <span className="more-inline-label">{t("打开应用时默认看到", "Default view on open")}</span>
          <div className="more-inline-fields">
            <label className="form-field">
              <span>{t("家庭", "Family")}</span>
              <select
                value={preferences.data?.preferences.default_family_id ?? ""}
                onChange={(event) =>
                  void saveDefault("family", event.target.value)
                }
              >
                <option value="">{t("全部家庭", "All families")}</option>
                {(families.data?.families ?? []).map((family) => (
                  <option value={family.id} key={family.id}>
                    {family.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>{t("宠物", "Pet")}</span>
              <select
                value={preferences.data?.preferences.default_pet_id ?? ""}
                onChange={(event) =>
                  void saveDefault("pet", event.target.value)
                }
              >
                <option value="">{t("不设默认", "No default")}</option>
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
          <span className="more-inline-label">{t("语言（消息与日期）", "Language (messages & dates)")}</span>
          <select
            className="more-inline-select"
            value={locale}
            onChange={(event) => void saveLocale(event.target.value)}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English（英语）</option>
          </select>
        </div>
        <div className="more-inline">
          <span className="more-inline-label">{t("界面语言", "Interface language")}</span>
          <select
            className="more-inline-select"
            value={lang}
            onChange={(event) =>
              setLang(event.target.value === "en" ? "en" : "zh")
            }
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </MoreGroup>

      <MoreGroup label={t("账号与安全", "Account & Security")}>
        <div className="more-inline">
          <span className="more-inline-label">{t("显示名", "Display name")}</span>
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
              {t("保存", "Save")}
            </BusyButton>
          </div>
        </div>
        {/* 登录设备与用量暂时下线，后续随需求恢复 */}
      </MoreGroup>

      <div className="more-danger">
        <button className="sign-out" onClick={() => void signOut(true)}>
          <LogOutIcon /> {t("退出当前设备", "Sign out of this device")}
        </button>
        <button className="danger-link muted" onClick={() => setConfirm(true)}>
          <Trash2 size={16} /> {t("删除账户", "Delete account")}
        </button>
      </div>

      {confirm && (
        <ConfirmDialog
          title={t("删除你的 Planet 账户？", "Delete your Planet account?")}
          consequence={t("名下资源会进入服务端保护期流程；删除成功后你会被退出登录。", "Resources under your account enter a server-side protection period; once deleted you'll be signed out.")}
          confirmLabel={t("删除账户", "Delete account")}
          requireText={accountUser.email}
          onCancel={() => setConfirm(false)}
          onConfirm={deleteAccount}
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
    ({ done: tt("已完成", "Done"), completed: tt("已完成", "Done"), skipped: tt("已跳过", "Skipped") } as Record<string, string>)[raw] ??
    tt("待完成", "To do")
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
  const t = useT();
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
      setToast(t("通知偏好已保存。", "Notification preferences saved."));
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  return (
    <div className="detail-view">
      <BackHeader title={t("通知设置", "Notification Settings")} />
      <Page className="more-page">
        <PageTitle
          eyebrow={t("按家庭生效", "Per family")}
          title={t("通知设置", "Notification Settings")}
          description={t("这些开关属于每个家庭，由服务端保存，不是全局假开关。", "These toggles belong to each family and are saved on the server — not fake global switches.")}
        />
        <label className="form-field">
          <span>{t("选择家庭", "Select family")}</span>
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
        <Card className="settings-toggle-card">
          {(["reminders", "digest", "alerts"] as const).map((key) => (
            <label className="toggle-row" key={key}>
              <span>
                <strong>
                  {key === "reminders"
                    ? t("照护提醒", "Care Reminders")
                    : key === "digest"
                      ? t("每日摘要", "Daily Digest")
                      : t("照护异常警报", "Care Alerts")}
                </strong>
                <small>{t("由服务端保存的偏好", "Saved on the server")}</small>
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
  const t = useT();
  return (
    <div className="detail-view">
      <BackHeader title={mode === "create" ? t("创建家庭", "Create Family") : t("加入家庭", "Join Family")} />
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
  const t = useT();
  return (
    <div className="detail-view">
      <BackHeader title={t("已删除的家庭", "Deleted Families")} />
      <Page className="more-page">
        <PageTitle
          eyebrow={t("保护期恢复", "Protection Period Recovery")}
          title={t("已删除的家庭", "Deleted Families")}
          description={t("在服务端保护期结束前，可以恢复误删的家庭和相关记录。", "Before the server-side protection period ends, you can restore accidentally deleted families and their records.")}
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
  const t = useT();
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
      <BackHeader title={t("设置", "Settings")} />
      <Page className="more-page">
        <PageTitle
          eyebrow={t("按你的方式", "Your Way")}
          title={t("设置", "Settings")}
          description={t("这里只展示真实的服务端状态，没有任何假装成功的操作。", "Only real server state is shown here — no fake success actions.")}
        />
        <MoreGroup label={t("快捷入口", "Quick Links")}>
          <MoreRow
            icon={<Bell size={19} />}
            title={t("通知", "Notifications")}
            sub={t("家庭提醒、每日摘要与异常警报", "Family reminders, daily digest, and alerts")}
            to="/settings/notifications"
          />
          <MoreRow
            icon={<Users size={19} />}
            title={t("家庭", "Families")}
            sub={t("成员、邀请与治理", "Members, invites, and governance")}
            to="/families"
          />
          <MoreRow
            icon={<Trash2 size={19} />}
            title={t("已删除的家庭", "Deleted Families")}
            sub={t("保护期内可一键恢复", "One-tap restore during the protection period")}
            to="/account/deleted-families"
          />
        </MoreGroup>
        <Card>
          <span className="eyebrow">{t("今日摘要", "Today's Digest")}</span>
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
                {t(`${digest.data.date}（${digest.data.timezone}）`, `${digest.data.date} (${digest.data.timezone})`)}
              </p>
              {digest.data.pets.map((pet) => (
                <div className="data-list" key={pet.pet_id}>
                  <div>
                    <dt>{pet.pet_name}</dt>
                    <dd>
                      {t(`完成 ${pet.done.length} · 待办 ${pet.pending.length} · 已跳过 ${pet.skipped.length}`, `Done ${pet.done.length} · To-do ${pet.pending.length} · Skipped ${pet.skipped.length}`)}
                    </dd>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">{t("这个家庭还没有照护摘要。", "No care digest for this family yet.")}</p>
          )}
        </Card>
        <Card>
          <span className="eyebrow">{t("照护警报", "Care Alerts")}</span>
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
                      ? t("高", "High")
                      : alert.severity === "medium"
                        ? t("中", "Medium")
                        : alert.severity === "low"
                          ? t("低", "Low")
                          : alert.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">{t("当前没有照护异常。", "No care issues right now.")}</p>
          )}
        </Card>
      </Page>
    </div>
  );
}

export function SharedViewCard({ view }: { view: SharedViewResponse }) {
  const t = useT();
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
            t("共享的照护信息", "Shared care info")}
        </p>
      </Card>
      {date && (
        <Card>
          <span className="eyebrow">{t("今日照护", "Today's Care")}</span>
          <p className="muted-copy">{date}</p>
          {tasks.length ? (
            <div className="stack compact">
              {tasks.map((task, index) => (
                <div
                  className="row-between"
                  key={`${String(task.id ?? index)}`}
                >
                  <span>
                    <strong>{String(task.title ?? t("照护事项", "Care item"))}</strong>
                    <small>{taskStatusLabel(task)}</small>
                  </span>
                  <span>{String(task.time_of_day ?? t("时间未定", "Time not set"))}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">{t("今天没有安排照护。", "No care scheduled today.")}</p>
          )}
        </Card>
      )}
      {medications.length > 0 && (
        <Card>
          <span className="eyebrow">{t("用药", "Medications")}</span>
          <div className="stack compact">
            {medications.map((med, index) => (
              <div key={`${String(med.id ?? index)}`}>
                <strong>{String(med.name ?? t("药物", "Medication"))}</strong>
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
          <span className="eyebrow">{t("紧急联系人", "Emergency Contacts")}</span>
          <div className="stack compact">
            {contacts.map((contact, index) => (
              <div key={`${String(contact.name ?? index)}`}>
                <strong>{String(contact.name ?? t("联系人", "Contact"))}</strong>
                <p>{String(contact.phone ?? contact.email ?? "")}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {notes && (
        <Card>
          <span className="eyebrow">{t("备注", "Notes")}</span>
          <p className="long-copy">{notes}</p>
        </Card>
      )}
      <p className="muted-copy">
        {t(`这个只读视图将于 ${new Date(view.expires_at).toLocaleString("zh-CN")} 过期。`, `This read-only view expires on ${new Date(view.expires_at).toLocaleString("zh-CN")}.`)}
      </p>
    </div>
  );
}

export function PublicSharePage() {
  const { token = "" } = useParams();
  const t = useT();
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
              ? t("分享已过期", "Share Expired")
              : t("分享不可用", "Share Unavailable")
          }
          description={
            isApiError(query.error) && query.error.status === 410
              ? t("链接已失效或被圈主撤销。", "The link has expired or was revoked by the owner.")
              : errorMessage(query.error, t("这条链接已经不可访问。", "This link is no longer accessible."))
          }
        />
      </div>
    );
  return (
    <div className="public-page">
      <Brand />
      <PageTitle
        eyebrow={t("只读照护视图", "Read-Only Care View")}
        title={t("共享的照护信息", "Shared Care Info")}
        description={t("任何人凭链接即可查看，无需注册；这个页面无法修改宠物的任何记录。", "Anyone with the link can view it, no sign-up needed; nothing on this page can modify the pet's records.")}
      />
      {query.data && <SharedViewCard view={query.data} />}
    </div>
  );
}
export function NotFound() {
  const t = useT();
  return (
    <main className="center-page">
      <EmptyState
        title={t("没有找到这个页面", "Page Not Found")}
        description={t("这个链接不存在，或页面已经被移动。", "This link doesn't exist, or the page has moved.")}
        action={
          <Link className="button primary" to="/today">
            {t("回到今天", "Back to Today")}
          </Link>
        }
      />
    </main>
  );
}
export function AccountDeletedPage() {
  const t = useT();
  return (
    <main className="center-page">
      <Brand />
      <EmptyState
        title={t("账户已删除", "Account Deleted")}
        description={t("你的 Planet 账户和相关访问权限已移除。如果以后改变主意，可以重新登录并创建新账户。", "Your Planet account and its access have been removed. If you change your mind later, you can sign in again and create a new account.")}
        action={
          <Link className="button primary" to="/auth">
            {t("返回登录", "Back to Sign In")}
          </Link>
        }
      />
    </main>
  );
}
