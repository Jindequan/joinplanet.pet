/* eslint-disable react-refresh/only-export-components -- app shell colocates shared hooks, context, and presentational primitives. */
import * as React from "react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../core/auth/session-context";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { api } from "../core/api/client";
import { InlineError, PageSkeleton } from "../core/ui";
import { queryKeys } from "../core/query/keys";
import type { Scope } from "../core/scope/scope";
import { scopeLabel } from "../core/scope/scope";
import { ArrowLeft, Bell, CalendarDays, ChevronDown, ChevronRight, Home, Menu, PawPrint, Users } from "lucide-react";

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
  frequency: Record<string, unknown>;
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

export const ScopeContext = React.createContext<ScopeContextValue | null>(null);
export function useScope() {
  const value = React.useContext(ScopeContext);
  if (!value) throw new Error("useScope must be used inside AppLayout");
  return value;
}
export function useFamilies() {
  return useQuery({
    queryKey: queryKeys.families(),
    queryFn: () => api.get<{ families: Family[] }>("/families"),
  });
}
export function usePets() {
  return useQuery({
    queryKey: queryKeys.pets(),
    queryFn: () => api.get<{ pets: Pet[] }>("/pets"),
  });
}
export function invalidateAll(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ["families"] });
  void client.invalidateQueries({ queryKey: ["pets"] });
  void client.invalidateQueries({ queryKey: ["today"] });
  void client.invalidateQueries({ queryKey: ["timeline"] });
  void client.invalidateQueries({ queryKey: ["care-plans"] });
  void client.invalidateQueries({ queryKey: ["medications"] });
  void client.invalidateQueries({ queryKey: ["shares"] });
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
  const navigate = useNavigate();
  return (
    <header className="detail-header">
      <button
        className="icon-button"
        onClick={() => navigate(-1)}
        aria-label="Back"
      >
        <ArrowLeft size={20} />
      </button>
      <strong>{title}</strong>
      <div>{action}</div>
    </header>
  );
}

export function AppHeader({ families, pets }: { families: Family[]; pets: Pet[] }) {
  const { scope, setScope } = useScope();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const label = scopeLabel(scope, families, pets);
  const user = useSession().user;
  return (
    <header className="page-header">
      <div className="mobile-brand"><Brand /></div>
      <div className="header-context">
        <span className="eyebrow">CARE SPACE</span>
        <strong>{label}</strong>
      </div>
      <div className="header-actions">
        <div className="scope-picker">
          <button
            className="scope-button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <PawPrint size={16} />
            <span>{label}</span>
            <ChevronDown size={15} />
          </button>
          {open && (
            <div className="scope-menu">
              <button
                onClick={() => {
                  setScope({ type: "all" });
                  setOpen(false);
                }}
                className={scope.type === "all" ? "selected" : ""}
              >
                <PawPrint size={16} />
                All pets
              </button>
              {families.map((family) => (
                <div key={family.id}>
                  <button
                    onClick={() => {
                      setScope({ type: "family", id: family.id });
                      setOpen(false);
                    }}
                    className={
                      scope.type === "family" && scope.id === family.id
                        ? "selected"
                        : ""
                    }
                  >
                    <Users size={16} />
                    {family.name}
                  </button>
                  {pets
                    .filter((pet) => pet.family_ids.includes(family.id))
                    .map((pet) => (
                      <button
                        className={`scope-pet ${scope.type === "pet" && scope.id === pet.id ? "selected" : ""}`}
                        key={`${family.id}-${pet.id}`}
                        onClick={() => {
                          setScope({ type: "pet", id: pet.id });
                          setOpen(false);
                        }}
                      >
                        <PawPrint size={14} />
                        {pet.name}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <Link className="icon-button" to="/account" aria-label="Account">
          <span className="avatar-dot">
            {(user?.display_name || "?").slice(0, 1).toUpperCase()}
          </span>
        </Link>
        <button
          className="icon-button"
          onClick={() => navigate("/settings/notifications")}
          aria-label="Notifications"
        >
          <Bell size={19} />
        </button>
      </div>
    </header>
  );
}
export function DesktopNav() {
  const location = useLocation();
  const items = [
    ["/today", "Today", HomeIcon, "What needs care now"],
    ["/timeline", "Timeline", CalendarDays, "Health & care history"],
    ["/pets", "Pets", PawPrint, "Profiles and care plans"],
    ["/families", "Families", Users, "People, homes and access"],
  ] as const;
  return (
    <nav className="desktop-nav" aria-label="Workspace navigation">
      <span className="nav-label">WORKSPACE</span>
      {items.map(([path, label, Icon, description]) => (
        <Link
          className={location.pathname.startsWith(path) ? "active" : ""}
          to={path}
          key={path}
        >
          <span className="nav-icon"><Icon size={19} /></span>
          <span><strong>{label}</strong><small>{description}</small></span>
        </Link>
      ))}
    </nav>
  );
}
export function BottomNav() {
  const location = useLocation();
  const items = [
    ["/today", "Today", HomeIcon],
    ["/timeline", "Timeline", CalendarDays],
    ["/pets", "Pets", PawPrint],
    ["/families", "Families", Users],
    ["/account", "Account", Menu],
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(([path, label, Icon]) => (
        <Link
          className={location.pathname.startsWith(path) ? "active" : ""}
          to={path}
          key={path}
        >
          <Icon size={21} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
export function HomeIcon(props: React.ComponentProps<typeof Home>) {
  return <Home {...props} />;
}

export function UsageSummary({ usage }: { usage: UsageSnapshot }) {
  const resources = Object.entries(usage.resources ?? {});
  return (
    <div className="usage-summary">
      <div className="row-between">
        <span className="eyebrow">{usage.period ?? "CURRENT PLAN"}</span>
        <span className="role-pill">{usage.plan ?? "free"}</span>
      </div>
      {resources.length === 0 ? (
        <p className="muted-copy">Usage details are not available yet.</p>
      ) : (
        <div className="usage-metrics">
          {resources.map(([key, value]) => (
            <div key={key}>
              <span>{key.replaceAll("_", " ")}</span>
              <strong>
                {value.used ?? 0}
                {value.limit !== undefined ? ` / ${value.limit}` : ""}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { token, user, isLoading, meError, retryMe } = useSession();
  const navigate = useNavigate();
  const families = useFamilies();
  const pets = usePets();
  const preferences = useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: () =>
      api.get<{
        preferences: { default_family_id?: string; default_pet_id?: string };
      }>("/me/preferences"),
  });
  const [scope, setScope] = useState<Scope>(() => {
    const saved = localStorage.getItem("planet.scope");
    return saved ? (JSON.parse(saved) as Scope) : { type: "all" };
  });
  const [hasSavedScope] = useState(() =>
    Boolean(localStorage.getItem("planet.scope")),
  );
  useEffect(
    () => localStorage.setItem("planet.scope", JSON.stringify(scope)),
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
            <span className="eyebrow">SHARED CARE</span>
            <p>One reliable place for every person who helps.</p>
          </div>
          <Link className="rail-account" to="/account">
            <span className="avatar-dot">
              {(user.display_name || "?").slice(0, 1).toUpperCase()}
            </span>
            <span><strong>{user.display_name}</strong><small>Account & settings</small></span>
            <ChevronRight size={16} />
          </Link>
        </aside>
        <div className="app-shell">
          <AppHeader
            families={families.data?.families ?? []}
            pets={pets.data?.pets ?? []}
          />
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </ScopeContext.Provider>
  );
}
