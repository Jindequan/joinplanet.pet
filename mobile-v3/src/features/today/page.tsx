import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../core/api/client";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage, isApiError } from "../../core/api/errors";
import { InlineError, PageSkeleton, Toast, BusyButton } from "../../core/ui";
import { useT, tt } from "../../core/i18n";
import { queryKeys } from "../../core/query/keys";
import { CalendarDays, Check, ChevronRight, CircleAlert, Clock3, PartyPopper, Undo2 } from "lucide-react";
import { PetAvatar } from "../../ui/pet-avatar";
import {
  Card, Page, ScopeCascade, useFamilies, usePets, useInvalidate, useScope, civilDateInTimezone,
  type Task, type TaskLog, type PendingTask, type TodayGroup,
} from "../../app/shared";

/** 特色卡插画位：品牌扁平插画轮换（装饰，不冒充宠物照片）。 */
function todayIllustration(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `/backgrounds/today-${(hash % 4) + 1}.webp`;
}
import { useSession } from "../../core/auth/session-context";
import { safeStorage } from "../../core/storage";

function readPending(userId: string): PendingTask[] {
  try {
    const value = JSON.parse(
      safeStorage.get(`planet.pending.today.${userId}`) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is PendingTask => Boolean(item && typeof item === "object"))
      .map((item) => ({ ...item, userId }))
      .filter(
        (item) =>
          typeof item.taskId === "string" &&
          (item.status === "done" || item.status === "skipped") &&
          typeof item.date === "string" &&
          typeof item.commandId === "string",
      );
  } catch {
    return [];
  }
}

/** 在 YYYY-MM-DD civil date 上做天数回退（不经过时区换算，纯日历算术）。 */
function civilDaysBefore(base: string, days: number): string {
  const parsed = new Date(`${base}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return base;
  parsed.setDate(parsed.getDate() - days);
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export function TodayPage() {
  const t = useT();
  const { scope } = useScope();
  const { user } = useSession();
  const families = useFamilies();
  const pets = usePets();
  const family = scope.type === "family"
    ? families.data?.families.find((item) => item.id === scope.id)
    : scope.type === "pet"
      ? families.data?.families.find((item) => (pets.data?.pets.find((pet) => pet.id === scope.id)?.family_ids ?? []).includes(item.id))
      : undefined;
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = civilDateInTimezone(family?.timezone, clock);
  const [selectedDate, setSelectedDate] = useState("");
  const scopeKey = `${scope.type}:${scope.type === "all" ? "" : scope.id}`;
  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedDate(""), 0);
    return () => window.clearTimeout(timer);
  }, [scopeKey]);
  const date = selectedDate || today;
  // All 是跨时区聚合。实时视图让 API 按每条规则的时区推导各自的家庭日；
  // 只有显式选择历史日期时才强制同一个自然日。
  const requestDate = scope.type === "all" && !selectedDate ? "" : date;
  const params = new URLSearchParams();
  if (requestDate) params.set("date", requestDate);
  if (scope.type === "family") params.set("family_id", scope.id);
  if (scope.type === "pet") params.set("pet_id", scope.id);
  const query = useQuery({
    queryKey: queryKeys.today({
      date: requestDate || "current",
      familyId: scope.type === "family" ? scope.id : undefined,
      petId: scope.type === "pet" ? scope.id : undefined,
    }),
    queryFn: () =>
      api.get<{ date: string; pets: TodayGroup[] }>(
        `/today?${params.toString()}`,
      ),
    enabled: true,
  });
  const invalidate = useInvalidate();
  const [toast, setToast] = useState("");
  const [skip, setSkip] = useState<Task | null>(null);
  const userId = user?.id ?? "anonymous";
  const pendingStorageKey = `planet.pending.today.${userId}`;
  const [pending, setPending] = useState<PendingTask[]>(() => readPending(userId));
  const pendingUserId = useRef(userId);
  const [retrying, setRetrying] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  // 乐观完成的本地覆盖：id → 服务端尚未确认的状态
  const [optimistic, setOptimistic] = useState<Record<string, "done" | "skipped">>({});
  useEffect(() => {
    pendingUserId.current = userId;
    const timer = window.setTimeout(() => setPending(readPending(userId)), 0);
    return () => window.clearTimeout(timer);
  }, [userId]);
  useEffect(() => {
    if (pendingUserId.current !== userId) return;
    // 写前与存储中的最新队列合并（按 commandId 去重），避免多标签页互相覆盖丢数据
    const stored = safeStorage.get(pendingStorageKey);
    const storedList: PendingTask[] = stored ? JSON.parse(stored) : [];
    const merged = [
      ...storedList.filter((item) => !pending.some((mine) => mine.commandId === item.commandId)),
      ...pending,
    ];
    safeStorage.set(pendingStorageKey, JSON.stringify(merged));
  }, [pending, pendingStorageKey, userId]);
  const retryPending = async () => {
    if (retrying || pending.length === 0) return;
    setRetrying(true);
    const remaining: PendingTask[] = [];
    let synced = 0;
    let converged = 0;
    let firstError = "";
    for (const item of pending) {
      try {
        await api.post(
          `/care-tasks/${item.taskId}/complete`,
          { status: item.status, date: item.date, note: item.note },
          { idempotencyKey: item.commandId },
        );
        synced += 1;
      } catch (error) {
        // 收敛即出队：409 TASK_LOG_EXISTS=家人已记录；409 键复用=同一命令
        // 已按别的请求体生效；404=任务已删除。留在队列只会变成永久横幅。
        if (
          isApiError(error) &&
          (error.status === 404 ||
            (error.status === 409 && (error.code === "TASK_LOG_EXISTS" || error.code === "IDEMPOTENCY_KEY_REUSED")))
        ) {
          converged += 1;
          continue;
        }
        const message = errorMessage(error);
        firstError ||= message;
        remaining.push({ ...item, lastError: message });
      }
    }
    setPending(remaining);
    setRetrying(false);
    if (remaining.length === 0) {
      setToast(
        converged > 0
          ? t(`${synced} 条已同步，${converged} 条家人已处理过。`, `${synced} synced. ${converged} were already handled by family.`)
          : t(`${synced} 条离线照护记录已同步。`, `${synced} offline care records synced.`),
      );
      invalidate();
    } else {
      setToast(t(`还有 ${remaining.length} 条待同步：${firstError}`, `${remaining.length} still waiting to sync: ${firstError}`));
    }
  };
  // 让 online/focus 监听常驻一次，同时总是调用最新一轮的 retryPending。
  const retryPendingRef = useRef(retryPending);
  useEffect(() => {
    retryPendingRef.current = retryPending;
  });
  useEffect(() => {
    const retry = () => {
      if (navigator.onLine) void retryPendingRef.current();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, []);
  const complete = useMutation({
    mutationFn: ({
      task,
      status,
      note,
      commandId,
    }: {
      task: Task;
      status: "done" | "skipped";
      date: string;
      note: string;
      commandId: string;
    }) =>
      api.post<{ log: TaskLog }>(
        `/care-tasks/${task.id}/complete`,
        { status, date, note },
        { idempotencyKey: commandId },
      ),
    onMutate: (variables) => {
      setOptimistic((current) => ({ ...current, [variables.task.id]: variables.status }));
    },
    onSuccess: (_, variables) => {
      setToast(
        variables.status === "done"
          ? t("已记录完成。", "Marked as done.")
          : t("已记录跳过，历史里看得见。", "Marked as skipped — it stays visible in history."),
      );
      invalidate();
    },
    onError: (e, variables) => {
      setOptimistic((current) => {
        if (!(variables.task.id in current)) return current;
        const next = { ...current };
        delete next[variables.task.id];
        return next;
      });
      if (isApiError(e) && e.status === 0) {
        setPending((current) =>
          current.some((item) => item.commandId === variables.commandId)
            ? current
            : [
                ...current,
                {
                  userId,
                  taskId: variables.task.id,
                  status: variables.status,
                  date: variables.date,
                  note: variables.note,
                  commandId: variables.commandId,
                },
              ],
        );
        setToast(t("当前离线，这条操作已排队，恢复网络后自动同步。", "You're offline — this action is queued and will sync automatically once you're back online."));
      } else if (isApiError(e) && e.code === "TASK_LOG_EXISTS") {
        setToast(t("家人已经记录过这条了。", "A family member already recorded this one."));
        invalidate();
      } else if (isApiError(e) && /future occurrences/i.test(e.message)) {
        setToast(t("还没到执行时间——到点了再来记录。", "It's not due yet — come back when it's time."));
      } else {
        setToast(errorMessage(e));
        if (isApiError(e) && e.status !== 0) invalidate();
      }
    },
    onSettled: (_, __, variables) => {
      setBusyTaskId((current) =>
        current === variables.task.id ? null : current,
      );
      setOptimistic((current) => {
        if (!(variables.task.id in current)) return current;
        const next = { ...current };
        delete next[variables.task.id];
        return next;
      });
    },
  });
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
  const allItems = (query.data?.pets ?? []).flatMap((group) =>
    group.items.map((item) => {
      const pendingStatus = optimistic[item.task.id];
      const log = item.log ?? (pendingStatus ? { id: `optimistic-${item.task.id}`, status: pendingStatus } : null);
      return {
        ...item,
        log,
        petName: group.pet_name,
        petSpecies: pets.data?.pets.find((pet) => pet.id === group.pet_id)?.species,
      };
    }),
  );
  // 未完成的排在前面（各自保持时间序），已处理的靠后仍可撤销。
  const items = [
    ...allItems.filter((item) => !item.log),
    ...allItems.filter((item) => item.log),
  ];
  const completed = items.filter(
    (item) => item.log?.status === "done" || item.log?.status === "completed",
  ).length;
  const skipped = items.filter((item) => item.log?.status === "skipped").length;
  const resolved = completed + skipped;
  const actionDate = (task: Task) => task.due_date || date;
  // 服务端只允许补记最近 7 天；查看窗口仍是 30 天。边界一律在家庭时区的
  // civil date 上做天数算术（设备本地日历跨界会差一天）。
  const BACKFILL_DAYS = 7;
  const backfillEarliest = civilDaysBefore(today, BACKFILL_DAYS);
  function beyondBackfill(task: Task) {
    const target = actionDate(task);
    return Boolean(target && target < backfillEarliest);
  }
  async function toggle(item: (typeof items)[number]) {
    if (busyTaskId === item.task.id) return;
    if (beyondBackfill(item.task)) {
      setToast(t("补记只支持最近 7 天,再早的记录请联系家人线下核对。", "Backfill only covers the last 7 days. For anything older, check with your family offline."));
      return;
    }
    setBusyTaskId(item.task.id);
    try {
      if (item.log && !item.log.id.startsWith("optimistic-")) {
        await api.post(`/task-logs/${item.log.id}/undo`);
        setToast(t("已移回今天待完成。", "Moved back to today's to-dos."));
        setBusyTaskId(null);
        invalidate();
      } else {
        complete.mutate({
          task: item.task,
          status: "done",
          date: actionDate(item.task),
          note: "",
          commandId: createCommandId(),
        });
      }
    } catch (error) {
      setToast(errorMessage(error));
      setBusyTaskId(null);
    }
  }
  function dateHeading(value: string) {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    const weekdayZh = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][parsed.getDay()];
    const weekdayEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parsed.getDay()];
    const monthEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parsed.getMonth()];
    return t(
      `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${weekdayZh}`,
      `${weekdayEn}, ${monthEn} ${parsed.getDate()}`,
    );
  }
  // 回看窗口：允许最近 30 天的回看，符合「有限的历史回看」。
  const EARLIEST_VIEW_DATE = civilDaysBefore(today, 30);
  // 最近 7 天（含今天）的周条；label/weekday 一律从家庭时区的 civil date
  // 派生（value 与显示同一口径，设备与家庭跨日时不再错位）。
  const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
  const WEEKDAY_CHARS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const weekStrip = () =>
    Array.from({ length: 7 }, (_, offset) => {
      const parsed = new Date(clock);
      parsed.setDate(parsed.getDate() - (6 - offset));
      const value = civilDateInTimezone(family?.timezone, parsed);
      const civil = new Date(`${value}T00:00:00`);
      return {
        value,
        weekday: t(WEEKDAY_CHARS[civil.getDay()], WEEKDAY_CHARS_EN[civil.getDay()]),
        label: String(civil.getDate()),
      };
    });
  const progress = items.length ? Math.round((resolved / items.length) * 100) : 0;
  return (
    <Page className="design-page design-today-page">
      <section className="design-today-heading">
        <div>
          <span className="eyebrow">{dateHeading(date)}</span>
          <h1>{selectedDate && selectedDate !== today ? t("那一天", "That Day") : t("今天", "Today")}</h1>
          <p>{items.length
            ? t(`还有 ${Math.max(items.length - resolved, 0)} 项照护等待处理`, `${Math.max(items.length - resolved, 0)} care items still to do`)
            : t("照护安排与家人实时同步", "Care plans, synced with your family in real time")}</p>
        </div>
        <div className="design-today-progress" aria-label={t(`${resolved} / ${items.length} 已处理`, `${resolved} / ${items.length} taken care of`)}>
          <strong>{resolved}/{items.length || 0} <span>{t("完成", "Done")}</span></strong>
          <span><i style={{ width: `${progress}%` }} /></span>
        </div>
      </section>
      <section className="design-today-top">
        <ScopeCascade variant="page" />
        {selectedDate && selectedDate !== today && (
          <button className="design-date-chip" onClick={() => setSelectedDate("")}>
            {dateHeading(selectedDate)} · {t("回看", "Looking back")} ×
          </button>
        )}
      </section>
      <div className="design-week-strip" role="group" aria-label={t("按天查看照护", "View care by day")}>
        {weekStrip().map((day) => (
          <button
            key={day.value}
            className={`design-day-chip ${date === day.value ? "selected" : ""}`}
            onClick={() => setSelectedDate(day.value === today ? "" : day.value)}
            aria-pressed={date === day.value}
          >
            <span>{day.weekday}</span>
            <strong>{day.label}</strong>
          </button>
        ))}
        {/* 更早的日期：原生选择器覆盖最近 30 天回看窗口 */}
        <label className="design-day-chip design-day-more" title={t("查看更早日期", "View Earlier Dates")}>
          <CalendarDays size={16} />
          <span>{t("更早", "Earlier")}</span>
          <input
            type="date"
            value={date}
            min={EARLIEST_VIEW_DATE}
            max={today}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label={t("选择历史日期", "Pick a past date")}
          />
        </label>
      </div>
      {pending.length > 0 && (
        <Card className="notice design-notice">
          <CircleAlert size={18} />
          <div>
            <strong>{t(`${pending.length} 条照护操作待同步`, `${pending.length} care actions waiting to sync`)}</strong>
            <p>{t("恢复网络后用同一幂等键重试，不会重复记录。", "They retry with the same idempotency key once you're back online, so nothing gets recorded twice.")}</p>
          </div>
          <button className="button ghost" disabled={retrying} onClick={() => void retryPending()}>
            {t("立即同步", "Sync Now")}
          </button>
        </Card>
      )}
      {items.length === 0 ? (
        scope.type === "pet" ? (
          <section className="guided-empty pet-care-empty">
            <div className="empty-copy">
              <span className="eyebrow">{t("下一步", "Next Step")}</span>
              <h2>{t("给这只宠物建立照护节奏", "Set up a care routine for this pet")}</h2>
              <p>{t("把喂饭、用药和日常流程变成全家共享的清单，谁做了什么一目了然。", "Turn feeding, medication, and daily routines into a checklist the whole family shares — who did what, at a glance.")}</p>
              <Link className="button primary" to={`/pets/${scope.id}`}>
                {t("打开照护工作区", "Open Care Workspace")} <ChevronRight size={16} />
              </Link>
            </div>
          </section>
        ) : (
          <section className="setup-journey">
            <div className="setup-intro">
              <span className="eyebrow">{t("三步开始 · 全家共养", "Three Steps · One Shared Pet")}</span>
              <h2>{t("搭好你们的共同照护空间", "Build Your Shared Care Space")}</h2>
              <p>{t("Planet 分三小步变得有用。每一步都会创建真实的共享数据——不是演示。", "Planet gets useful in three small steps. Each one creates real shared data — not a demo.")}</p>
            </div>
            <div className="setup-steps">
              <Link className={(families.data?.families.length ?? 0) > 0 ? "complete" : "current"} to="/families">
                <span className="step-number">01</span>
                <span><strong>{t("创建家庭", "Create a Family")}</strong><small>{t("设定家的时区，拉上帮忙的人。", "Set your family's timezone and bring in helpers.")}</small></span>
                {(families.data?.families.length ?? 0) > 0 ? <Check size={18} /> : <ChevronRight size={18} />}
              </Link>
              <Link className={(pets.data?.pets.length ?? 0) > 0 ? "complete" : (families.data?.families.length ?? 0) > 0 ? "current" : "locked"} to={(families.data?.families.length ?? 0) > 0 ? "/pets" : "/families/new"}>
                <span className="step-number">02</span>
                <span><strong>{t("添加宠物", "Add a Pet")}</strong><small>{t("档案、健康信息和每个家保持连接。", "Profiles and health info, connected across every home.")}</small></span>
                {(pets.data?.pets.length ?? 0) > 0 ? <Check size={18} /> : <ChevronRight size={18} />}
              </Link>
              <Link className={(pets.data?.pets.length ?? 0) > 0 ? "current" : "locked"} to={(pets.data?.pets.length ?? 0) > 0 ? `/pets/${pets.data?.pets[0]?.id}` : "/pets"}>
                <span className="step-number">03</span>
                <span><strong>{t("排照护计划", "Plan Their Care")}</strong><small>{t("设置日常事务，分配给合适的人。", "Set up routines and assign them to the right person.")}</small></span>
                <ChevronRight size={18} />
              </Link>
            </div>
          </section>
        )
      ) : (
        <>
          {resolved === items.length ? (
            <article className="design-all-done">
              <img src="/backgrounds/today-2.webp" alt="" aria-hidden loading="lazy" />
              <div>
                <span className="eyebrow">{t("今日圆满", "All Done Today")}</span>
                <h2>{t("今天的照护都完成了", "Today's Care Is All Done")}</h2>
                <p>
                  {skipped > 0
                    ? t(`${completed} 项完成 · ${skipped} 项跳过`, `${completed} done · ${skipped} skipped`)
                    : t(`${completed} 项全部完成`, `All ${completed} done`)}
                  {t("，家人都能看到这份记录。", ". Your family can see this record.")}
                </p>
              </div>
              <PartyPopper aria-hidden size={22} />
            </article>
          ) : (
            (() => {
              const featured = items.find((item) => !item.log) ?? items[0];
              return (
                <>
                  <FeatureCard
                    item={featured}
                    busy={busyTaskId === featured.task.id}
                    overdue={!featured.log && Boolean(featured.task.due_date && featured.task.due_date < today)}
                    onToggle={() => void toggle(featured)}
                    onSkip={() => setSkip(featured.task)}
                  />
                  <section className="design-upcoming">
                    <h2>{t("接下来的", "Coming Up")}</h2>
                    <div>
                      {items
                        .filter((item) => item.task.id !== featured.task.id)
                        .map((item) => (
                          <UpcomingRow
                            key={item.task.id}
                            item={item}
                            busy={busyTaskId === item.task.id}
                            onToggle={() => void toggle(item)}
                            onSkip={() => setSkip(item.task)}
                          />
                        ))}
                    </div>
                  </section>
                </>
              );
            })()
          )}
        </>
      )}
      {skip && (
        <SkipDialog
          task={skip}
          onCancel={() => setSkip(null)}
          onConfirm={async (note) => {
            if (beyondBackfill(skip)) {
              setToast(t("补记只支持最近 7 天。", "Backfill only covers the last 7 days."));
              return;
            }
            try {
              await complete.mutateAsync({
                task: skip,
                status: "skipped",
                date: actionDate(skip),
                note,
                commandId: createCommandId(),
              });
            } catch {
              // mutation 回调已负责离线入队并通过横幅提示。
            }
            setSkip(null);
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
  );
}

function statusLabel(log: TaskLog | null | undefined): string {
  if (!log) return "";
  return log.status === "skipped" ? tt("已跳过", "Skipped") : tt("已完成", "Done");
}

function FeatureCard({
  item,
  busy,
  overdue,
  onToggle,
  onSkip,
}: {
  item: {
    task: Task;
    log: TaskLog | null;
    petName: string;
    petSpecies?: string;
  };
  busy: boolean;
  overdue: boolean;
  onToggle: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const { task, log } = item;
  const resolvedText = statusLabel(log);
  return (
    <article className={`design-feature-card ${log ? "is-resolved" : ""}`}>
      <div
        className="design-feature-image"
        style={{ backgroundImage: `linear-gradient(180deg, rgba(31,45,40,.02), rgba(31,45,40,.14)), url(${todayIllustration(task.id)})` }}
        aria-hidden
      >
        {overdue && (
          <span className="design-overdue"><CircleAlert size={15} /> {t("已逾期", "Overdue")}</span>
        )}
      </div>
      <div className="design-feature-body">
        <div className="design-feature-copy">
          <div className="design-task-time">
            <Clock3 size={18} />
            {[item.petName, task.time_of_day || t("时间未定", "Time TBD"), task.assigned_to_name]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <h2>{task.title}</h2>
          <p>{task.description || t("没有额外说明。", "No extra notes.")}</p>
        </div>
        {resolvedText && <span className="role-pill">{resolvedText}</span>}
        {!log && (
          <div className="design-feature-actions">
            <button className="design-complete-button" onClick={onToggle} disabled={busy} aria-label={t(`完成 ${task.title}`, `Mark ${task.title} done`)}>
              <Check size={20} /> {t("完成", "Done")}
            </button>
            <button className="design-skip-button" onClick={onSkip} disabled={busy}>{t("跳过", "Skip")}</button>
          </div>
        )}
        {log && (
          <div className="design-feature-actions">
            <button className="design-skip-button" onClick={onToggle} disabled={busy}>
              <Undo2 size={16} /> {t("撤销", "Undo")}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function UpcomingRow({
  item,
  busy,
  onToggle,
  onSkip,
}: {
  item: {
    task: Task;
    log: TaskLog | null;
    petName: string;
    petSpecies?: string;
  };
  busy: boolean;
  onToggle: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const { task, log } = item;
  return (
    <article className={`design-upcoming-row ${log ? "is-resolved" : ""}`}>
      <PetAvatar petId={task.pet_id} species={item.petSpecies} size={50} />
      <div>
        <h3>{item.petName ? `${item.petName} · ` : ""}{task.title}</h3>
        <p><Clock3 size={15} /> {task.time_of_day || t("时间未定", "Time TBD")}</p>
      </div>
      {log ? (
        <span className="role-pill">{statusLabel(log)}</span>
      ) : (
        <span className="row-actions">
          <button
            className="icon-button subtle"
            onClick={onToggle}
            disabled={busy}
            aria-label={t(`完成 ${task.title}`, `Mark ${task.title} done`)}
          >
            <Check size={17} />
          </button>
          <button
            className="icon-button subtle"
            onClick={onSkip}
            disabled={busy}
            aria-label={t(`跳过 ${task.title}`, `Skip ${task.title}`)}
          >
            <CircleAlert size={17} />
          </button>
        </span>
      )}
    </article>
  );
}

export function SkipDialog({
  task,
  onCancel,
  onConfirm,
}: {
  task: Task;
  onCancel: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skip-dialog-title"
      >
        <button className="modal-close" onClick={onCancel} aria-label={t("关闭", "Close")}>
          ×
        </button>
        <span className="eyebrow">{t("记录一次跳过", "Log a Skip")}</span>
        <h2 id="skip-dialog-title">{task.title}</h2>
        <p>{t("跳过会留在照护历史里，家人都会知道发生了什么。", "Skips stay in the care history, so your family knows what happened.")}</p>
        <label className="form-field">
          <span>{t("原因或备注", "Reason or Note")}</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("选填", "Optional")}
          />
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onCancel}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton
            className="button primary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(note);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("跳过并记录", "Skip & Log")}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
