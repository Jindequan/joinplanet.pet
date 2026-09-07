/* eslint-disable react-refresh/only-export-components -- app shell colocates shared hooks, context, and presentational primitives. */
import * as React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../core/auth/session-context";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { api } from "../core/api/client";
import { humanBytes, usageResourceLabel } from "../core/display";
import { safeStorage } from "../core/storage";
import { InlineError, PageSkeleton } from "../core/ui";
import { queryKeys } from "../core/query/keys";
import type { Scope } from "../core/scope/scope";
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Home, LayoutGrid, MoreHorizontal, PawPrint, TrendingUp, Users } from "lucide-react";
import { PetAvatar } from "../ui/pet-avatar";
import { useT } from "../core/i18n";

export type Family = {
  id: string;
  name: string;
  timezone: string;
  role: "owner" | "caregiver" | "editor" | "viewer" | "read_only";
  created_at: string;
};
export type Member = {
  user_id: string;
  email?: string;
  display_name: string;
  role: Family["role"];
  joined_at: string;
};
export type Pet = {
  id: string;
  family_ids: string[];
  name: string;
  species: string;
  breed: string;
  birth_date?: string;
  sex: string;
  neutered: boolean;
  weight_g?: number;
  archived_at?: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export type Profile = {
  allergies: unknown;
  conditions: unknown;
  emergency_contacts: unknown;
  med_decision_maker: unknown;
  notes: string;
};
export type Task = {
  id: string;
  pet_id: string;
  title: string;
  description: string;
  schedule: unknown;
  timezone: string;
  time_of_day?: string;
  due_date?: string;
  due_at?: string;
  status?: string;
  assigned_to_name?: string;
};
export type TaskLog = {
  id: string;
  status: "done" | "completed" | "skipped";
  done_by_name?: string;
};
export type PendingTask = {
  userId: string;
  taskId: string;
  status: "done" | "skipped";
  date: string;
  note: string;
  commandId: string;
  lastError?: string;
};
export type TodayGroup = {
  pet_id: string;
  pet_name: string;
  items: Array<{ task: Task; log: TaskLog | null }>;
};
export type Event = {
  id: string;
  pet_id: string;
  type: string;
  occurred_at: string;
  recorded_by_name?: string;
  payload: Record<string, unknown>;
  source: string;
};
export type CarePlan = {
  id: string;
  pet_id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  /** 服务端字段名就是 schedule（kind/days/day/every_n…），与 care_rules.frequency 对应。 */
  schedule?: Record<string, unknown>;
  start_date: string;
  end_date?: string;
  timezone: string;
  time_of_day?: string;
};
export type Medication = {
  id: string;
  pet_id: string;
  name: string;
  dose: string;
  schedule: string;
  started_on: string;
  ended_on?: string;
  note: string;
};
export type Share = {
  id: string;
  pet_id: string;
  kind: string;
  expires_at: string;
  revoked_at?: string;
  view_count: number;
  created_at: string;
};
export type AccessGrant = {
  id: string;
  user_id: string;
  role: string;
  expires_at?: string;
};
export type Transfer = {
  id: string;
  pet_id: string;
  pet_name?: string;
  from_family_id: string;
  to_family_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
};
export type SessionInfo = {
  id: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
};
export type UsageSnapshot = {
  period?: string;
  plan?: string;
  resources?: Record<string, { used?: number; limit?: number }>;
};
export type DigestPet = {
  pet_id: string;
  pet_name: string;
  done: Array<{ title: string; by_name?: string; at?: string }>;
  pending: Array<{ title: string; time_of_day?: string }>;
  skipped: Array<{ title: string; by_name?: string; at?: string }>;
  alerts: Array<{ title: string; body: string; severity: string }>;
};
export type DigestView = { date: string; timezone: string; pets: DigestPet[] };
export type AlertSummary = {
  id: string;
  pet_name: string;
  title: string;
  body: string;
  severity: string;
};
export type SharedViewResponse = {
  kind: string;
  expires_at: string;
  data: Record<string, unknown>;
};
export type ScopeContextValue = { scope: Scope; setScope: (scope: Scope) => void };

function formatUsageValue(key: string, value: number | undefined) {
  if (key === "storage_bytes") return humanBytes(value);
  return value ?? 0;
}

export const ScopeContext = React.createContext<ScopeContextValue | null>(null);
export function useScope() {
  const value = React.useContext(ScopeContext);
  if (!value) throw new Error("useScope must be used inside AppLayout");
  return value;
}

/** 范围级联选择器：按钮是当前范围摘要（图标+名称+箭头），弹层分步选择 全部→家庭→宠物。 */
export function ScopeCascade({ variant = "header" }: { variant?: "header" | "page" }) {
  const t = useT();
  const { scope, setScope } = useScope();
  const families = useFamilies();
  const pets = usePets();
  const [open, setOpen] = useState(false);
  const [stepFamilyId, setStepFamilyId] = useState<string | null>(null);
  const familyList = families.data?.families ?? [];
  const petList = pets.data?.pets ?? [];
  const stepFamily = stepFamilyId
    ? familyList.find((family) => family.id === stepFamilyId) ?? null
    : null;
  const stepPets = stepFamilyId
    ? petList.filter((pet) => pet.family_ids.includes(stepFamilyId))
    : [];

  const current =
    scope.type === "all"
      ? { label: t("全部宠物", "All pets"), icon: <LayoutGrid size={16} /> }
      : scope.type === "family"
        ? {
            label: familyList.find((family) => family.id === scope.id)?.name ?? t("家庭", "Family"),
            icon: <Home size={16} />,
          }
        : {
            label: petList.find((pet) => pet.id === scope.id)?.name ?? t("宠物", "Pet"),
            icon: (
              <PetAvatar
                petId={scope.id}
                species={petList.find((pet) => pet.id === scope.id)?.species}
                size={20}
                decorative
              />
            ),
          };

  function pick(next: Scope) {
    setScope(next);
    setOpen(false);
    setStepFamilyId(null);
  }

  const ready = !families.isLoading && !pets.isLoading;
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return (
    <div className={`scope-cascade-wrap scope-cascade-${variant}`}>
      <button
        className="scope-cascade"
        onClick={() => { setOpen((value) => !value); setStepFamilyId(null); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={!ready}
      >
        <span className="scope-cascade-icon" aria-hidden>{current.icon}</span>
        <span className="scope-cascade-label">{current.label}</span>
        <ChevronDown size={14} className="scope-cascade-chevron" aria-hidden />
      </button>
      {open && createPortal(
        <div className="modal-backdrop scope-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="modal scope-sheet" role="dialog" aria-modal="true" aria-label={t("选择查看范围", "Choose scope")}>
            <div className="scope-sheet-head">
              {stepFamily ? (
                <button className="scope-sheet-back" onClick={() => setStepFamilyId(null)} aria-label={t("返回", "Back")}>
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <span className="scope-sheet-title-ghost" aria-hidden />
              )}
              <strong>{stepFamily ? stepFamily.name : t("选择查看范围", "Choose scope")}</strong>
              {scope.type !== "all" ? (
                <button className="scope-sheet-reset" onClick={() => pick({ type: "all" })}>
                  {t("回到全部", "Back to all")}
                </button>
              ) : (
                <span className="scope-sheet-title-ghost" aria-hidden />
              )}
            </div>
            {!stepFamily ? (
              <div className="scope-sheet-list">
                <button
                  className={`scope-row ${scope.type === "all" ? "selected" : ""}`}
                  onClick={() => pick({ type: "all" })}
                >
                  <span className="scope-row-icon all" aria-hidden><LayoutGrid size={18} /></span>
                  <span className="scope-row-label">{t("全部宠物", "All pets")}</span>
                  {scope.type === "all" && <Check size={17} className="scope-row-check" aria-hidden />}
                </button>
                {familyList.map((family) => (
                  <button
                    key={family.id}
                    className={`scope-row ${scope.type === "family" && scope.id === family.id ? "selected" : ""}`}
                    onClick={() => setStepFamilyId(family.id)}
                  >
                    <span className="scope-row-icon" aria-hidden><Home size={17} /></span>
                    <span className="scope-row-label">{family.name}</span>
                    <ChevronRight size={16} className="scope-row-go" aria-hidden />
                  </button>
                ))}
              </div>
            ) : (
              <div className="scope-sheet-list">
                <button
                  className={`scope-row ${scope.type === "family" && scope.id === stepFamily.id ? "selected" : ""}`}
                  onClick={() => pick({ type: "family", id: stepFamily.id })}
                >
                  <span className="scope-row-icon" aria-hidden><Home size={17} /></span>
                  <span className="scope-row-label">{t(`整个${stepFamily.name}`, `All of ${stepFamily.name}`)}</span>
                  {scope.type === "family" && scope.id === stepFamily.id && (
                    <Check size={17} className="scope-row-check" aria-hidden />
                  )}
                </button>
                {stepPets.map((pet) => (
                  <button
                    key={pet.id}
                    className={`scope-row ${scope.type === "pet" && scope.id === pet.id ? "selected" : ""}`}
                    onClick={() => pick({ type: "pet", id: pet.id })}
                  >
                    <PetAvatar petId={pet.id} species={pet.species} size={30} decorative />
                    <span className="scope-row-label">{pet.name}</span>
                    {scope.type === "pet" && scope.id === pet.id && (
                      <Check size={17} className="scope-row-check" aria-hidden />
                    )}
                  </button>
                ))}
                {stepPets.length === 0 && (
                  <p className="scope-sheet-empty">{t("这个家庭还没有宠物", "This family doesn't have any pets yet.")}</p>
                )}
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
export function useFamilies(enabled = true) {
  return useQuery({
    queryKey: queryKeys.families(),
    queryFn: () => api.get<{ families: Family[] }>("/families"),
    enabled,
  });
}
export function usePets(enabled = true) {
  return useQuery({
    queryKey: queryKeys.pets(),
    queryFn: async () => {
      const res = await api.get<{ pets: Pet[] }>("/pets");
      // 服务端对空 family_ids 会省略字段，前端统一补齐避免 undefined 崩溃
      return { pets: (res.pets ?? []).map((pet) => ({ ...pet, family_ids: pet.family_ids ?? [] })) };
    },
    enabled,
  });
}
export function invalidateAll(client: ReturnType<typeof useQueryClient>) {
  const prefixes = [
    ["families"],
    ["pets"],
    ["pet"], // 单宠详情(["pet", id])
    ["today"],
    ["timeline"],
    ["care-plans"],
    ["medications"],
    ["shares"],
    ["design-pet-today"],
    ["weight-events"],
    ["trends-events"],
    ["family-pets"],
    ["assignments"],
    ["access-grants"],
    ["deleted-pets"],
    ["family-transfers"],
  ];
  for (const prefix of prefixes)
    void client.invalidateQueries({ queryKey: prefix });
}
export function useInvalidate() {
  const client = useQueryClient();
  return () => invalidateAll(client);
}
export function localCivilDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateTimeLocalInTimezone(value: string | Date, timezone?: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!timezone) {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  try {
    return formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return dateTimeLocalInTimezone(date);
  }
}

export function instantFromCivilDateTime(value: string, timezone?: string) {
  if (!timezone) return new Date(value).toISOString();
  try {
    return fromZonedTime(value, timezone).toISOString();
  } catch {
    return new Date(value).toISOString();
  }
}

/** 按指定时区格式化；timezone 缺失或非法时退回浏览器本地时间。 */
export function formatInTimeZoneSafe(
  value: string | Date,
  timezone: string | undefined,
  pattern: string,
) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!timezone) {
    const pad = (part: number) => String(part).padStart(2, "0");
    if (pattern === "yyyy-MM-dd")
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return date.toISOString();
  }
  try {
    return formatInTimeZone(date, timezone, pattern);
  } catch {
    return formatInTimeZoneSafe(date, undefined, pattern);
  }
}

export function civilDateInTimezone(timezone: string | undefined, date = new Date()) {
  if (!timezone) return localCivilDate(date);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return localCivilDate(date);
  }
}

export function Brand() {
  return (
    <Link to="/today" className="brand">
      <span className="brand-orbit">
        <i />
      </span>
      <span>PLANET</span>
    </Link>
  );
}
export function Page({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <main className={`page ${className}`}>{children}</main>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function BackHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <header className="detail-header">
      <button
        className="icon-button"
        onClick={() => navigate(-1)}
        aria-label={t("返回", "Back")}
      >
        <ArrowLeft size={20} />
      </button>
      <strong>{title}</strong>
      <div>{action}</div>
    </header>
  );
}

export function DesktopNav() {
  const t = useT();
  const location = useLocation();
  const items = [
    ["/today", t("今天", "Today"), HomeIcon, t("现在需要照护什么", "What needs care right now")],
    ["/timeline", t("时间线", "Timeline"), CalendarDays, t("健康与照护历史", "Health and care history")],
    ["/trends", t("趋势", "Trends"), TrendingUp, t("长期监测与统计", "Long-term tracking and stats")],
    ["/pets", t("宠物", "Pets"), PawPrint, t("档案与照护计划", "Profiles and care plans")],
    ["/families", t("家庭", "Family"), Users, t("成员、圈子和访问", "Members, circles, and access")],
  ] as const;
  return (
    <nav className="desktop-nav" aria-label={t("工作区导航", "Workspace navigation")}>
      <span className="nav-label">{t("工作区", "Workspace")}</span>
      {items.map(([path, label, Icon, description]) => (
        <Link
          className={location.pathname.startsWith(path) ? "active" : ""}
          to={path}
          key={path}
          aria-current={location.pathname.startsWith(path) ? "page" : undefined}
        >
          <span className="nav-icon"><Icon size={19} /></span>
          <span><strong>{label}</strong><small>{description}</small></span>
        </Link>
      ))}
    </nav>
  );
}
export function BottomNav() {
  const t = useT();
  const location = useLocation();
  const items = [
    ["/today", t("今天", "Today"), HomeIcon],
    ["/timeline", t("时间线", "Timeline"), CalendarDays],
    ["/pets", t("宠物", "Pets"), PawPrint],
    ["/account", t("更多", "More"), MoreHorizontal],
  ] as const;
  const activeFor = (path: string) =>
    path === "/account"
      ? ["/account", "/families", "/settings", "/trends"].some((prefix) =>
          location.pathname.startsWith(prefix),
        )
      : location.pathname.startsWith(path);
  return (
    <nav className="bottom-nav" aria-label={t("主导航", "Main navigation")}>
      {items.map(([path, label, Icon]) => {
        const active = activeFor(path);
        return (
          <Link
            className={active ? "active" : ""}
            to={path}
            key={path}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
export function HomeIcon(props: React.ComponentProps<typeof Home>) {
  return <Home {...props} />;
}

function MobileHeader({ displayName }: { displayName: string }) {
  const t = useT();
  const location = useLocation();
  const labels: Array<[string, string]> = [
    ["/today", t("今天", "Today")],
    ["/timeline", t("时间线", "Timeline")],
    ["/trends", t("趋势", "Trends")],
    ["/pets", t("宠物", "Pets")],
    ["/families", t("家庭", "Family")],
    ["/settings", t("设置", "Settings")],
    ["/account", t("更多", "More")],
  ];
  const label = labels.find(([path]) => location.pathname.startsWith(path))?.[1] ?? "PLANET";
  const initial = (displayName || "?").slice(0, 1).toUpperCase();
  return (
    <header className="mobile-header">
      <Link className="mobile-brand" to="/today" aria-label={t("PLANET 首页", "PLANET home")}>
        <span className="brand-orbit" aria-hidden><i /></span>
      </Link>
      <span className="mobile-header-label">{label}</span>
      <Link className="mobile-account" to="/account" aria-label={t("账户与设置", "Account and settings")}>
        {initial}
      </Link>
    </header>
  );
}

export function UsageSummary({ usage }: { usage: UsageSnapshot }) {
  const t = useT();
  const resources = Object.entries(usage.resources ?? {});
  return (
    <div className="usage-summary">
      <div className="row-between">
        <span className="eyebrow">{usage.period ?? t("当前套餐", "Current plan")}</span>
        <span className="role-pill">{usage.plan === "free" || !usage.plan ? t("免费版", "Free") : usage.plan}</span>
      </div>
      {resources.length === 0 ? (
        <p className="muted-copy">{t("用量信息暂时不可用。", "Usage info isn't available right now.")}</p>
      ) : (
        <div className="usage-metrics">
          {resources.map(([key, value]) => (
            <div key={key}>
              <span>{usageResourceLabel(key)}</span>
              <strong>
                {formatUsageValue(key, value.used)}
                {value.limit !== undefined
                  ? ` / ${formatUsageValue(key, value.limit)}`
                  : ""}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const t = useT();
  const { token, user, isLoading, meError, retryMe } = useSession();
  const navigate = useNavigate();
  const families = useFamilies(Boolean(token));
  const pets = usePets(Boolean(token));
  const preferences = useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: () =>
      api.get<{
        preferences: { default_family_id?: string; default_pet_id?: string };
      }>("/me/preferences"),
    enabled: Boolean(token),
  });
  const [scope, setScope] = useState<Scope>(() => {
    return safeStorage.getJSON<Scope>("planet.scope") ?? { type: "all" };
  });
  const [hasSavedScope] = useState(() =>
    Boolean(localStorage.getItem("planet.scope")),
  );
  useEffect(
    () => safeStorage.set("planet.scope", JSON.stringify(scope)),
    [scope],
  );
  useEffect(() => {
    if (hasSavedScope || !preferences.data) return;
    const defaults = preferences.data.preferences;
    if (defaults.default_pet_id) {
      // The preference is external server state; apply it once after bootstrap.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScope({ type: "pet", id: defaults.default_pet_id });
    } else if (defaults.default_family_id) {
      setScope({ type: "family", id: defaults.default_family_id });
    }
  }, [hasSavedScope, preferences.data]);
  useEffect(() => {
    if (families.isLoading || pets.isLoading) return;
    if (
      scope.type === "family" &&
      !(families.data?.families ?? []).some((family) => family.id === scope.id)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScope({ type: "all" });
    }
    if (
      scope.type === "pet" &&
      !(pets.data?.pets ?? []).some((pet) => pet.id === scope.id)
    ) {
      setScope({ type: "all" });
    }
  }, [
    families.data?.families,
    families.isLoading,
    pets.data?.pets,
    pets.isLoading,
    scope,
  ]);
  useEffect(() => {
    if (!token && !isLoading) navigate("/auth", { replace: true });
  }, [isLoading, navigate, token]);
  // 路由切换回到顶部：移动端 SPA 不带浏览器滚动恢复
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  if (!token) return <Navigate to="/auth" replace />;
  if (isLoading)
    return <PageSkeleton />;
  if (meError || !user)
    return (
      <main className="center-page">
        <InlineError error={meError ?? new Error("Session is still loading")} onRetry={() => void retryMe()} />
      </main>
    );
  if (families.isLoading || pets.isLoading) return <PageSkeleton />;
  if (families.error || pets.error)
    return (
      <main className="center-page">
        <InlineError
          error={families.error ?? pets.error}
          onRetry={() => {
            void families.refetch();
            void pets.refetch();
          }}
        />
      </main>
    );
  return (
    <ScopeContext.Provider value={{ scope, setScope }}>
      <div className="app-stage">
        <aside className="app-rail">
          <Brand />
          <DesktopNav />
          <div className="rail-note">
            <span className="eyebrow">{t("共养", "Shared care")}</span>
            <p>{t("每个帮忙照顾它的人，都看同一份可靠的记录。", "Everyone who helps care for them sees the same reliable record.")}</p>
          </div>
          <Link className="rail-account" to="/account">
            <span className="avatar-dot">
              {(user.display_name || "?").slice(0, 1).toUpperCase()}
            </span>
            <span><strong>{user.display_name}</strong><small>{t("账户与设置", "Account and settings")}</small></span>
            <ChevronRight size={16} />
          </Link>
        </aside>
        <div className="app-shell">
          <MobileHeader displayName={user.display_name} />
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </ScopeContext.Provider>
  );
}
