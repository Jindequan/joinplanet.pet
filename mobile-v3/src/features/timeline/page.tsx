import { useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { errorMessage } from "../../core/api/errors";
import { ConfirmDialog, EmptyState, InlineError, PageSkeleton, Toast, BusyButton } from "../../core/ui";
import { createCommandId } from "../../core/api/idempotency";
import {
  describeEvent, isManualEvent, parseEventPayload,
  type EventDescription,
} from "./registry";
import {
  CheckCircle2, Pill, Plus, Stethoscope, Syringe,
  HeartPulse, PenLine, Undo2, Weight, X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { PetAvatar } from "../../ui/pet-avatar";
import {
  Event, Page, useFamilies, useInvalidate, usePets, useScope,
  dateTimeLocalInTimezone, formatInTimeZoneSafe, instantFromCivilDateTime,
} from "../../app/shared";

export function TimelinePage() {
  const { scope } = useScope();
  const [composerOpen, setComposerOpen] = useState(false);
  // 页面内的「看谁的记录」过滤：只影响本页查询，不改全局 scope
  const [filterPetId, setFilterPetId] = useState("");
  const { petId: routePetId = "" } = useParams();
  const timelineScope = routePetId
    ? ({ type: "pet", id: routePetId } as const)
    : scope;
  const petId = timelineScope.type === "pet" ? timelineScope.id : "";
  const pets = usePets();
  const families = useFamilies();
  // 分组与展示时间统一按家庭时区解释；All 视图退回浏览器时区。
  const timezone = timelineScope.type === "family"
    ? families.data?.families.find((family) => family.id === timelineScope.id)?.timezone
    : petId
      ? families.data?.families.find((family) =>
          pets.data?.pets.find((pet) => pet.id === petId)?.family_ids.includes(family.id),
        )?.timezone
      : undefined;
  // 头部：按 scope 展示宠物身份或可横滑的宠物列表
  const familyName = timelineScope.type === "family"
    ? families.data?.families.find((family) => family.id === timelineScope.id)?.name
    : undefined;
  const scopePets = (pets.data?.pets ?? []).filter((pet) =>
    timelineScope.type === "pet"
      ? pet.id === timelineScope.id
      : timelineScope.type === "family"
        ? !pet.archived_at && pet.family_ids.includes(timelineScope.id)
        : !pet.archived_at,
  );
  const routeForcedPetId = routePetId;
  // 过滤器只在当前 scope 的宠物集合里生效；scope 切换后自然失效回聚合
  const effectiveFilterPetId =
    !routeForcedPetId && scopePets.some((pet) => pet.id === filterPetId)
      ? filterPetId
      : "";
  const activePetId = routeForcedPetId || effectiveFilterPetId;
  const query = useInfiniteQuery({
    queryKey: ["timeline", timelineScope, activePetId],
    initialPageParam: undefined as
      { before: string; before_id: string } | undefined,
    queryFn: ({ pageParam }) => {
      const timelineParams = new URLSearchParams({ limit: "50" });
      if (activePetId) timelineParams.set("pet_id", activePetId);
      else if (timelineScope.type === "family")
        timelineParams.set("family_id", timelineScope.id);
      if (pageParam) {
        timelineParams.set("before", pageParam.before);
        timelineParams.set("before_id", pageParam.before_id);
      }
      return api.get<{
        events: Event[];
        next_cursor?: { before: string; before_id: string };
      }>(`/timeline?${timelineParams.toString()}`);
    },
    getNextPageParam: (page) => page.next_cursor,
  });
  const [toast, setToast] = useState("");
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const invalidate = useInvalidate();
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
  const allEvents = (query.data?.pages.flatMap((page) => page.events) ?? []).filter(
    (event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index,
  );
  const events = allEvents;
  async function remove(event: Event) {
    try {
      await api.delete(`/timeline-events/${event.id}`, undefined, {
        idempotencyKey: createCommandId(),
      });
      setEventToDelete(null);
      setToast("记录已删除。");
      invalidate();
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  const petNameById = new Map((pets.data?.pets ?? []).map((pet) => [pet.id, pet.name]));
  // 体重趋势只用已加载的真实事件计算；没有上一条就不显示变化。
  const lastWeightByPet = new Map<string, number>();
  const weightDeltaByEvent = new Map<string, string | null>();
  for (const event of [...allEvents].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  )) {
    if (event.type !== "weight") continue;
    const grams = event.payload?.weight_g;
    if (typeof grams !== "number") continue;
    const previous = lastWeightByPet.get(event.pet_id);
    weightDeltaByEvent.set(
      event.id,
      previous !== undefined && grams !== previous
        ? `${grams > previous ? "↗" : "↘"} ${Math.abs((grams - previous) / 1000).toFixed(2)} kg`
        : null,
    );
    lastWeightByPet.set(event.pet_id, grams);
  }
  const groupKeyOf = (event: Event) => formatInTimeZoneSafe(event.occurred_at, timezone, "yyyy-MM-dd");
  const now = new Date();
  const todayKey = formatInTimeZoneSafe(now, timezone, "yyyy-MM-dd");
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = formatInTimeZoneSafe(yesterdayDate, timezone, "yyyy-MM-dd");
  function groupHeading(key: string) {
    if (key === todayKey) return "今天";
    if (key === yesterdayKey) return "昨天";
    const parsed = new Date(`${key}T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? key
      : `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
  }
  const eventGroups = Array.from(
    events.reduce((groups, event) => {
      const key = groupKeyOf(event);
      const list = groups.get(key) ?? [];
      list.push(event);
      groups.set(key, list);
      return groups;
    }, new Map<string, Event[]>() as Map<string, Event[]>).entries(),
  );
  return (
    <Page className={`design-page design-timeline-page ${petId ? "timeline-pet-page" : "timeline-aggregate-page"}`}>
      <section className="timeline-head">
        {timelineScope.type === "family" && (
          <p className="timeline-head-scope">{familyName ?? "家庭"}</p>
        )}
        {timelineScope.type === "all" && (
          <p className="timeline-head-scope">全部宠物</p>
        )}
        <div className="timeline-head-strip">
          {scopePets.map((pet) => {
            const isFiltered = activePetId === pet.id;
            return (
            <button
              key={pet.id}
              className={`tl-chip ${isFiltered ? "selected" : ""}`}
              onClick={() =>
                setFilterPetId(isFiltered ? "" : pet.id)
              }
              aria-pressed={isFiltered}
            >
              <PetAvatar petId={pet.id} species={pet.species} size={52} decorative />
              <span>{pet.name}</span>
            </button>
            );
          })}
        </div>
      </section>
      {createPortal(
        <>
          {scopePets.length > 0 && composerOpen && (
        <>
          <div className="timeline-composer-layer" onClick={() => setComposerOpen(false)} aria-hidden />
          <div className="timeline-composer-pop">
            <EventComposer
              pets={scopePets}
              defaultPetId={activePetId || scopePets[0]?.id || ""}
              onSaved={() => {
                setComposerOpen(false);
                setToast("已记录。");
                invalidate();
              }}
            />
          </div>
        </>
      )}
      {scopePets.length > 0 && (
        <button
          className={`timeline-fab ${composerOpen ? "open" : ""}`}
          onClick={() => setComposerOpen((value) => !value)}
          aria-label={composerOpen ? "收起记录" : "记一笔"}
          aria-expanded={composerOpen}
        >
          <Plus size={24} />
        </button>
      )}
        </>,
        document.body,
      )}
      <section className="design-timeline-stream">
        {events.length === 0 ? (
          <EmptyState
            image="/backgrounds/today-1.webp"
            title="还没有记录"
            description="点右下角的 +，记一条笔记、症状、体重、就诊或疫苗，让照护历史可追溯。"
          />
        ) : (
          eventGroups.map(([dateKey, group]) => (
            <div className="design-timeline-group" key={dateKey}>
              <h2>{groupHeading(dateKey)}</h2>
              {group.map((event) => (
                <EventCard
                  event={event}
                  petName={petNameById.get(event.pet_id)}
                  weightDelta={weightDeltaByEvent.get(event.id)}
                  key={event.id}
                  onEdit={() => setEventToEdit(event)}
                  onDelete={() => setEventToDelete(event)}
                />
              ))}
            </div>
          ))
        )}
      </section>
      {query.hasNextPage && (
        <button
          className="button secondary full"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "加载更早的记录…" : "查看更早的记录"}
        </button>
      )}
      {eventToEdit && (eventToEdit.pet_id ? eventToEdit.pet_id : petId) && (
        <EventForm
          petId={(eventToEdit.pet_id ? eventToEdit.pet_id : petId)}
          timezone={timezone}
          initial={eventToEdit}
          onClose={() => setEventToEdit(null)}
          onSaved={() => {
            setEventToEdit(null);
            setToast("记录已更新。");
            invalidate();
          }}
        />
      )}
      {eventToDelete && (
        <ConfirmDialog
          title={`删除这条${describeEvent(eventToDelete.type, eventToDelete.payload).category}记录？`}
          consequence="只删除这条手动记录。系统自动产生的照护历史不能在这里删除。"
          confirmLabel="删除记录"
          onCancel={() => setEventToDelete(null)}
          onConfirm={() => remove(eventToDelete)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
  );
}

function EventIcon({ icon }: { icon: EventDescription["icon"] }) {
  switch (icon) {
    case "weight":
      return <Weight size={19} />;
    case "syringe":
      return <Syringe size={19} />;
    case "stethoscope":
      return <Stethoscope size={19} />;
    case "pill":
      return <Pill size={19} />;
    case "care":
      return <CheckCircle2 size={19} />;
    case "undo":
      return <Undo2 size={19} />;
    case "note":
      return <PenLine size={19} />;
    default:
      return <HeartPulse size={19} />;
  }
}

export function EventCard({
  event,
  petName,
  weightDelta,
  onEdit,
  onDelete,
}: {
  event: Event;
  petName?: string;
  weightDelta?: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const description = describeEvent(event.type, event.payload);
  const manual = isManualEvent(event.source);
  const timeText = new Date(event.occurred_at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <article className="design-event-card">
      <div className={`design-event-icon design-event-icon-${description.icon}`}>
        <EventIcon icon={description.icon} />
      </div>
      <div className="design-event-content">
        <div className="design-event-topline">
          <h3>{[description.category, petName].filter(Boolean).join(" · ")}</h3>
          <span>{timeText}</span>
        </div>
        {description.icon === "weight" && description.headline ? (
          <div className="design-weight-line">
            <strong>{description.headline}</strong>
            {weightDelta ? <span>{weightDelta}</span> : null}
          </div>
        ) : (
          <>
            {description.headline && <p className="design-event-headline">{description.headline}</p>}
            {description.detail && <p className="design-event-detail">{description.detail}</p>}
          </>
        )}
        <small>{event.recorded_by_name ?? "Planet 系统"}</small>
      </div>
      {manual && (
        <div className="row-actions">
          <button
            className="icon-button subtle"
            onClick={onEdit}
            aria-label="编辑记录"
          >
            <PenLine size={16} />
          </button>
          <button
            className="icon-button subtle"
            onClick={onDelete}
            aria-label="删除记录"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </article>
  );
}

type EventType = "note" | "symptom" | "weight" | "vet_visit" | "vaccine";
const EVENT_TYPE_LABELS: Record<EventType, string> = {
  note: "笔记",
  symptom: "症状",
  weight: "体重",
  vet_visit: "就诊",
  vaccine: "疫苗",
};

export function EventForm({
  petId,
  timezone,
  initial,
  onClose,
  onSaved,
}: {
  petId: string;
  timezone?: string;
  initial?: Event;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<EventType>(
    (initial?.type as EventType) in EVENT_TYPE_LABELS
      ? (initial!.type as EventType)
      : "note",
  );
  const [occurredAt, setOccurredAt] = useState(
    initial
      ? dateTimeLocalInTimezone(initial.occurred_at, timezone)
      : dateTimeLocalInTimezone(new Date(), timezone),
  );
  // 按类型读取对应 payload 字段，避免编辑时把无关字段拍平丢失。
  const readPayload = (key: string) => {
    const value = initial?.payload?.[key];
    return typeof value === "string" ? value : "";
  };
  const readWeightKg = () => {
    const grams = initial?.payload?.weight_g;
    return typeof grams === "number" ? String(grams / 1000) : "";
  };
  const [primary, setPrimary] = useState(() =>
    type === "note"
      ? readPayload("text") || readPayload("title")
      : type === "symptom"
        ? readPayload("title")
        : type === "vaccine"
          ? readPayload("name")
          : type === "vet_visit"
            ? readPayload("title")
            : "",
  );
  const [secondary, setSecondary] = useState(() =>
    type === "symptom"
      ? readPayload("detail")
      : type === "vet_visit"
        ? readPayload("summary") || readPayload("clinic")
        : type === "weight"
          ? readPayload("note")
          : "",
  );
  const [weight, setWeight] = useState(readWeightKg);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  const PRIMARY_LABELS: Record<EventType, string> = {
    note: "内容",
    symptom: "症状",
    weight: "",
    vet_visit: "就诊事项",
    vaccine: "疫苗名称",
  };
  const SECONDARY_LABELS: Partial<Record<EventType, string>> = {
    symptom: "补充说明",
    vet_visit: "小结（诊所 / 结论）",
    weight: "备注（选填）",
  };
  async function save() {
    const detailText = secondary.trim();
    let payload: Record<string, unknown>;
    if (type === "weight")
      payload = { weight_g: Math.round(Number(weight) * 1000), note: detailText };
    else if (type === "symptom")
      payload = { title: primary.trim(), detail: detailText };
    else if (type === "vaccine")
      payload = { name: primary.trim(), ...(detailText ? { text: detailText } : {}) };
    else if (type === "vet_visit")
      payload = { title: primary.trim(), summary: detailText };
    else payload = { text: primary.trim() };
    const manualCheck =
      type === "weight"
        ? !primaryFieldValid()
        : !primary.trim();
    if (parseEventPayload(type, payload).kind === "unknown" || manualCheck) {
      setError(type === "weight" ? "请输入大于 0 的体重。" : "请填写必填内容。");
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await api.patch(`/timeline-events/${initial.id}`, {
          occurred_at: instantFromCivilDateTime(occurredAt, timezone),
          payload,
        }, { idempotencyKey: commandId.current });
        commandId.current = createCommandId();
      } else {
        await api.post(
          `/pets/${petId}/timeline`,
          { type, occurred_at: instantFromCivilDateTime(occurredAt, timezone), payload },
          { idempotencyKey: commandId.current },
        );
      }
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function primaryFieldValid() {
    return type !== "weight" || (Number(weight) > 0 && Number.isFinite(Number(weight)));
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
        <span className="eyebrow">{initial ? "编辑记录" : "新记录"}</span>
        <h2>{initial ? "编辑这条记录" : "发生了什么？"}</h2>
        <label className="form-field">
          <span>类型</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as EventType)}
            disabled={Boolean(initial)}
          >
            {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => (
              <option key={value} value={value}>
                {EVENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>发生时间{timezone ? `（${timezone}）` : ""}</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>
        {type === "weight" && (
          <label className="form-field">
            <span>体重（kg）</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </label>
        )}
        {PRIMARY_LABELS[type] && (
          <label className="form-field">
            <span>{PRIMARY_LABELS[type]}</span>
            <textarea
              value={primary}
              onChange={(event) => setPrimary(event.target.value)}
            />
          </label>
        )}
        {SECONDARY_LABELS[type] && (
          <label className="form-field">
            <span>{SECONDARY_LABELS[type]}</span>
            <textarea
              value={secondary}
              onChange={(event) => setSecondary(event.target.value)}
            />
          </label>
        )}
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
            保存记录
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

/** flomo 式常驻记录条：想记就写，回车/点一下就好；编辑仍走完整表单。 */
function EventComposer({
  pets: petOptions,
  defaultPetId,
  onSaved,
}: {
  pets: Array<{ id: string; name: string; species?: string }>;
  defaultPetId: string;
  onSaved: () => void;
}) {
  const [chosenPetId, setChosenPetId] = useState("");
  const targetPetId = chosenPetId || defaultPetId;
  const [type, setType] = useState<EventType>("note");
  const [text, setText] = useState("");
  const [extra, setExtra] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());

  const PLACEHOLDERS: Record<EventType, string> = {
    note: "记一笔…它今天怎么样？",
    symptom: "症状，如 软便",
    weight: "体重多少？",
    vet_visit: "就诊事项，如 年度体检",
    vaccine: "疫苗名称，如 狂犬疫苗",
  };
  const EXTRA_LABELS: Partial<Record<EventType, string>> = {
    symptom: "补充说明（选填）",
    vet_visit: "小结（诊所 / 结论，选填）",
    vaccine: "备注（选填）",
    weight: "备注（选填）",
  };

  async function save() {
    if (busy) return;
    let payload: Record<string, unknown>;
    if (type === "weight") {
      const grams = Math.round(Number(weight) * 1000);
      if (!(grams > 0)) {
        setError("先填一个大于 0 的体重");
        return;
      }
      payload = { weight_g: grams, note: extra.trim() };
    } else if (!text.trim()) {
      setError("写一句再记");
      return;
    } else if (type === "symptom") payload = { title: text.trim(), detail: extra.trim() };
    else if (type === "vaccine") payload = { name: text.trim(), ...(extra.trim() ? { text: extra.trim() } : {}) };
    else if (type === "vet_visit") payload = { title: text.trim(), summary: extra.trim() };
    else payload = { text: text.trim() };

    setBusy(true);
    setError("");
    try {
      await api.post(
        `/pets/${targetPetId}/timeline`,
        { type, occurred_at: new Date().toISOString(), payload },
        { idempotencyKey: commandId.current },
      );
      commandId.current = createCommandId();
      setText("");
      setExtra("");
      setWeight("");
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="event-composer open">
      <div className="composer-main">
        <input
          id="event-composer-input"
          value={type === "weight" ? weight : text}
          onChange={(event) => {
            if (type === "weight") setWeight(event.target.value);
            else setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && type !== "weight") void save();
          }}
          placeholder={PLACEHOLDERS[type]}
          aria-label="快速记录"
          type={type === "weight" ? "number" : "text"}
          min={type === "weight" ? "0" : undefined}
          step={type === "weight" ? "0.01" : undefined}
        />
        <BusyButton className="composer-send" busy={busy} onClick={() => void save()}>
          记下
        </BusyButton>
      </div>
      <>
          {petOptions.length > 1 && (
            <div className="composer-pets" role="group" aria-label="记录归属宠物">
              {petOptions.map((pet) => (
                <button
                  key={pet.id}
                  className={`composer-pet ${targetPetId === pet.id ? "selected" : ""}`}
                  onClick={() => setChosenPetId(pet.id)}
                  aria-pressed={targetPetId === pet.id}
                >
                  <PetAvatar petId={pet.id} species={pet.species} size={26} decorative />
                  <span>{pet.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="composer-types" role="tablist" aria-label="记录类型">
            {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => (
              <button
                key={value}
                className={type === value ? "selected" : ""}
                onClick={() => setType(value)}
                aria-pressed={type === value}
              >
                {EVENT_TYPE_LABELS[value]}
              </button>
            ))}
          </div>
          {(EXTRA_LABELS[type] || type === "weight") && (
            <input
              className="composer-extra"
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
              placeholder={EXTRA_LABELS[type] ?? ""}
              aria-label={EXTRA_LABELS[type] ?? "备注"}
            />
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
      </>
    </section>
  );
}
