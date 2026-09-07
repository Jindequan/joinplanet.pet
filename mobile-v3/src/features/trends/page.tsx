/* 趋势页：用户只管记，系统按 scope 与时间区间归档、统计、呈现结果。 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../core/api/client";
import { InlineError, PageSkeleton, EmptyState } from "../../core/ui";
import { Page, ScopeCascade, useFamilies, usePets, useScope, type Event } from "../../app/shared";
import { PetAvatar } from "../../ui/pet-avatar";
import { WeightChart, type WeightPoint } from "../../ui/weight-chart";
import { speciesLabel } from "../../core/display";
import { useT } from "../../core/i18n";

function civilFromDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function civilToday(): string {
  return civilFromDays(0);
}
type CareStats = {
  total: number; completed: number; skipped: number; missed: number; handled: number;
  rate: number | null;
  per_pet: Array<{ pet_id: string; pet_name: string; total: number; completed: number; skipped: number; missed: number; handled: number; rate: number | null }>;
};

const RANGES = [
  { key: "1m", label: "近一个月", days: 30 },
  { key: "3m", label: "三个月", days: 90 },
  { key: "6m", label: "六个月", days: 180 },
  { key: "1y", label: "一年", days: 365 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

// RANGES 的 label 保留中文原文（zh 模式零回归），英文在渲染时按 key 取。
const RANGE_LABELS_EN: Record<RangeKey, string> = {
  "1m": "Past Month",
  "3m": "3 Months",
  "6m": "6 Months",
  "1y": "1 Year",
};

/** 分页抓取时间区间内的事件（后端游标上限 200/页）。 */
async function fetchEventsInRange(
  scope: { type: "all" | "family" | "pet"; id?: string },
  startMs: number,
): Promise<Event[]> {
  const all: Event[] = [];
  let cursor: { before: string; before_id: string } | undefined;
  for (let page = 0; page < 40; page += 1) {
    const q = new URLSearchParams({ limit: "100" });
    if (scope.type === "family" && scope.id) q.set("family_id", scope.id);
    if (scope.type === "pet" && scope.id) q.set("pet_id", scope.id);
    if (cursor) {
      q.set("before", cursor.before);
      q.set("before_id", cursor.before_id);
    }
    const res = await api.get<{
      events: Event[];
      next_cursor?: { before: string; before_id: string };
    }>(`/timeline?${q.toString()}`);
    all.push(...res.events);
    const oldest = res.events.at(-1);
    if (!res.next_cursor || !oldest || new Date(oldest.occurred_at).getTime() < startMs)
      break;
    cursor = res.next_cursor;
  }
  return all.filter((event) => new Date(event.occurred_at).getTime() >= startMs);
}

export function TrendsPage() {
  const t = useT();
  const { scope } = useScope();
  const pets = usePets();
  const families = useFamilies();
  const [rangeKey, setRangeKey] = useState<RangeKey>("1m");
  const range = RANGES.find((item) => item.key === rangeKey) ?? RANGES[0];

  const eventsQuery = useQuery({
    queryKey: ["trends-events", scope.type, scope.type === "all" ? "" : scope.id, range.key],
    queryFn: () => fetchEventsInRange(scope, Date.now() - range.days * 86_400_000),
  });
  // 服务端事实的照护执行统计:分母含 missed(该做没做),不是前端拼凑
  const statsQuery = useQuery({
    queryKey: ["care-stats", scope.type, scope.type === "all" ? "" : scope.id, range.key],
    queryFn: () => {
      const params = new URLSearchParams({ from: civilFromDays(range.days), to: civilToday() });
      if (scope.type === "family") params.set("family_id", scope.id);
      if (scope.type === "pet") params.set("pet_id", scope.id);
      return api.get<CareStats>(`/care-stats?${params.toString()}`);
    },
  });

  const familyList = families.data?.families ?? [];
  const allPets = pets.data?.pets ?? [];
  const petsInScope = scope.type === "pet"
    ? allPets.filter((pet) => pet.id === scope.id)
    : scope.type === "family"
      ? allPets.filter((pet) => !pet.archived_at && pet.family_ids.includes(scope.id))
      : allPets.filter((pet) => !pet.archived_at);
  const scopeText = scope.type === "all"
    ? t("全部宠物", "All pets")
    : scope.type === "family"
      ? familyList.find((family) => family.id === scope.id)?.name ?? t("家庭", "Family")
      : allPets.find((pet) => pet.id === scope.id)?.name ?? t("宠物", "Pet");

  if (pets.isLoading || families.isLoading || eventsQuery.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (pets.error || families.error || eventsQuery.error)
    return (
      <Page>
        <InlineError
          error={pets.error ?? families.error ?? eventsQuery.error}
          onRetry={() => {
            void pets.refetch();
            void families.refetch();
            void eventsQuery.refetch();
          }}
        />
      </Page>
    );

  const events = eventsQuery.data ?? [];
  const eventsByPet = new Map<string, Event[]>();
  for (const event of events) {
    const list = eventsByPet.get(event.pet_id) ?? [];
    list.push(event);
    eventsByPet.set(event.pet_id, list);
  }

  return (
    <Page className="design-page trends-page">
      <section className="trends-head">
        <div>
          <span className="eyebrow">{t("趋势 · 长期监测", "Trends · Long-term tracking")}</span>
          <h1>{scopeText}</h1>
        </div>
        <div className="trends-head-tools">
          <ScopeCascade variant="page" />
          <div className="trends-ranges" role="group" aria-label={t("统计时间区间", "Stats time range")}>
            {RANGES.map((item) => (
              <button
                key={item.key}
                className={`trends-range ${rangeKey === item.key ? "selected" : ""}`}
                onClick={() => setRangeKey(item.key)}
                aria-pressed={rangeKey === item.key}
              >
                {t(item.label, RANGE_LABELS_EN[item.key])}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="trends-summary">
        {statsQuery.isLoading ? (
          <p className="muted-copy">{t("正在汇总照护统计…", "Summing up care stats…")}</p>
        ) : statsQuery.error ? (
          <InlineError error={statsQuery.error} onRetry={() => void statsQuery.refetch()} />
        ) : (
          <>
            {statsQuery.data && (
              <>
                <div>
                  <strong>
                    {statsQuery.data.rate === null
                      ? "—"
                      : `${statsQuery.data.rate}%`}
                  </strong>
                  <span>{t("按时完成率", "On-time completion rate")}</span>
                </div>
                <i />
                <div>
                  <strong>{statsQuery.data.completed}</strong>
                  <span>{t("完成", "Completed")}</span>
                </div>
                <i />
                <div>
                  <strong>{statsQuery.data.missed}</strong>
                  <span>{t("该做未做", "Missed")}</span>
                </div>
                <i />
              </>
            )}
            <div>
              <strong>{events.length}</strong>
              <span>{t("条动态记录", "Timeline records")}</span>
            </div>
          </>
        )}
      </section>

      {petsInScope.length === 0 ? (
        <EmptyState
          title={t("这个范围还没有活跃的宠物", "No active pets in this scope yet")}
          description={t("去「更多 → 宠物管理」创建，或回今天页切换范围。", "Create one under More → Pet Management, or switch the scope on the Today page.")}
        />
      ) : (
        <div className="trend-pet-list">
          {petsInScope.map((pet) => (
            <TrendPetCard
              key={pet.id}
              petId={pet.id}
              name={pet.name}
              species={pet.species}
              events={eventsByPet.get(pet.id) ?? []}
            />
          ))}
        </div>
      )}
    </Page>
  );
}

function TrendPetCard({
  petId,
  name,
  species,
  events,
}: {
  petId: string;
  name: string;
  species?: string;
  events: Event[];
}) {
  const t = useT();
  const weights: WeightPoint[] = events
    .filter((event) => event.type === "weight" && typeof event.payload?.weight_g === "number")
    .map((event) => {
      const date = new Date(event.occurred_at);
      return {
        at: date.getTime(),
        kg: Math.round((event.payload.weight_g as number) / 100) / 10,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
      };
    })
    .sort((a, b) => a.at - b.at);
  const firstWeight = weights[0];
  const lastWeight = weights.at(-1);
  const weightDelta =
    firstWeight && lastWeight && weights.length >= 2
      ? Math.round((lastWeight.kg - firstWeight.kg) * 100) / 100
      : null;
  const completed = events.filter(
    (event) =>
      event.type === "care_task_completed" && event.payload?.status !== "skipped",
  ).length;
  const skipped = events.filter(
    (event) =>
      event.type === "care_task_completed" && event.payload?.status === "skipped",
  ).length;
  const symptoms = events.filter((event) => event.type === "symptom").length;
  const visits = events.filter((event) => event.type === "vet_visit").length;
  const vaccines = events.filter((event) => event.type === "vaccine").length;
  const notes = events.filter((event) => event.type === "note").length;

  return (
    <article className="trend-pet-card">
      <header className="trend-pet-head">
        <PetAvatar petId={petId} species={species} size={44} decorative />
        <div>
          <h2>{name}</h2>
          <p>{speciesLabel(species)}</p>
        </div>
        {weightDelta !== null && weightDelta !== 0 && (
          <span className={`trend-delta ${weightDelta > 0 ? "up" : "down"}`}>
            {t("体重", "Weight")} {weightDelta > 0 ? "↗" : "↘"} {Math.abs(weightDelta)} kg
          </span>
        )}
      </header>
      {weights.length >= 2 ? (
        <WeightChart points={weights} />
      ) : (
        <p className="trend-hint">
          {weights.length === 1
            ? t(`本区间只记了 1 次体重（${weights[0].kg} kg），再记一次就能看到曲线。`, `Only 1 weight was recorded in this period (${weights[0].kg} kg). Add one more to see the curve.`)
            : t("这段时间没有体重记录。", "No weight records in this period.")}
        </p>
      )}
      <dl className="trend-stats">
        <div>
          <dt>{t("照护", "Care")}</dt>
          <dd>{t(`${completed} 完成 · ${skipped} 跳过`, `${completed} completed · ${skipped} skipped`)}</dd>
        </div>
        <div>
          <dt>{t("健康事件", "Health events")}</dt>
          <dd>{t(`${symptoms} 症状 · ${visits} 就诊 · ${vaccines} 疫苗`, `${symptoms} symptoms · ${visits} vet visits · ${vaccines} vaccines`)}</dd>
        </div>
        <div>
          <dt>{t("笔记", "Notes")}</dt>
          <dd>{t(`${notes} 条`, `${notes} entries`)}</dd>
        </div>
      </dl>
    </article>
  );
}
