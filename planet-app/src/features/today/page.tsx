import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../core/api/client";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage, isApiError } from "../../core/api/errors";
import { InlineError, PageSkeleton, Toast, BusyButton } from "../../core/ui";
import { queryKeys } from "../../core/query/keys";
import { CalendarDays, Check, ChevronRight, CircleAlert, MoreHorizontal, PawPrint, X } from "lucide-react";
import {
  Card, Page, PageTitle, useFamilies, usePets, useInvalidate, useScope, civilDateInTimezone,
  type Task, type TaskLog, type PendingTask, type TodayGroup,
} from "../../app/shared";
import { useSession } from "../../core/auth/session-context";

function readPending(userId: string): PendingTask[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(`planet.pending.today.${userId}`) ?? "[]",
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

export function TodayPage() {
  const { scope } = useScope();
  const { user } = useSession();
  const families = useFamilies();
  const pets = usePets();
  const family = scope.type === "family"
    ? families.data?.families.find((item) => item.id === scope.id)
    : scope.type === "pet"
      ? families.data?.families.find((item) => pets.data?.pets.find((pet) => pet.id === scope.id)?.family_ids.includes(item.id))
      : undefined;
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = civilDateInTimezone(family?.timezone, clock);
  const [selectedDate, setSelectedDate] = useState("");
  const scopeKey = `${scope.type}:${scope.type === "all" ? "" : scope.id}`;
  useEffect(() => setSelectedDate(""), [scopeKey]);
  const date = selectedDate || today;
  const params = new URLSearchParams({ date });
  if (scope.type === "family") params.set("family_id", scope.id);
  if (scope.type === "pet") params.set("pet_id", scope.id);
  const query = useQuery({
    queryKey: queryKeys.today({
      date,
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
  const [retrying, setRetrying] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  useEffect(() => {
    setPending(readPending(userId));
  }, [userId]);
  useEffect(() => {
    localStorage.setItem(pendingStorageKey, JSON.stringify(pending));
  }, [pending, pendingStorageKey]);
  const retryPending = useCallback(async () => {
    if (retrying || pending.length === 0) return;
    setRetrying(true);
    const remaining: PendingTask[] = [];
    let synced = 0;
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
        const message = errorMessage(error);
        firstError ||= message;
        remaining.push({ ...item, lastError: message });
      }
    }
    setPending(remaining);
    setRetrying(false);
    if (remaining.length === 0) {
      setToast(`${synced} queued care action${synced === 1 ? "" : "s"} synced.`);
      invalidate();
    } else {
      setToast(`${remaining.length} action${remaining.length === 1 ? "" : "s"} still pending: ${firstError}`);
    }
  }, [invalidate, pending, retrying]);
  useEffect(() => {
    const retry = () => {
      if (navigator.onLine) void retryPending();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [retryPending]);
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
    onSuccess: (_, variables) => {
      setToast(
        variables.status === "done"
          ? "Care marked complete."
          : "Task skipped and recorded.",
      );
      invalidate();
    },
    onError: (e, variables) => {
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
        setToast("You’re offline. This care action is queued for sync.");
      } else setToast(errorMessage(e));
    },
    onSettled: (_, __, variables) => {
      setBusyTaskId((current) =>
        current === variables.task.id ? null : current,
      );
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
  const items = (query.data?.pets ?? []).flatMap((group) =>
    group.items.map((item) => ({ ...item, petName: group.pet_name })),
  );
  const completed = items.filter(
    (item) => item.log?.status === "done" || item.log?.status === "completed",
  ).length;
  const skipped = items.filter((item) => item.log?.status === "skipped").length;
  const resolved = completed + skipped;
  async function toggle(item: (typeof items)[number]) {
    if (busyTaskId === item.task.id) return;
    setBusyTaskId(item.task.id);
    try {
      if (item.log) {
        await api.post(`/task-logs/${item.log.id}/undo`);
        setToast("Task moved back to Today.");
        invalidate();
      } else {
        complete.mutate({
          task: item.task,
          status: "done",
          date,
          note: "",
          commandId: createCommandId(),
        });
      }
    } catch (error) {
      setToast(errorMessage(error));
      setBusyTaskId(null);
    }
  }
  return (
    <Page className="today-page">
      <PageTitle
        eyebrow={date === today ? "TODAY" : date}
        title={
          resolved === items.length && items.length > 0
            ? "Beautifully done."
            : "Good morning."
        }
        description={`${completed} completed · ${skipped} skipped · ${items.length - resolved} upcoming`}
        action={
          <label className="date-control">
            <CalendarDays size={16} />
            <input
              type="date"
              value={date}
              max={today}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        }
      />
      {pending.length > 0 && (
        <Card className="notice">
          <CircleAlert size={18} />
          <div>
            <strong>
              {pending.length} action{pending.length === 1 ? "" : "s"} pending
              sync
            </strong>
            <p>They will use the same idempotency key when retried.</p>
          </div>
          <button className="button ghost" disabled={retrying} onClick={() => void retryPending()}>
            Retry sync
          </button>
        </Card>
      )}
      <section className="care-summary">
        <div>
          <span className="eyebrow">CARE PROGRESS</span>
          <strong>
            {resolved} <small>of {items.length}</small>
          </strong>
          <p>
            {items.length === 0
              ? "No care plan occurrences yet."
              : items.length === resolved
                ? "Everything is cared for."
                : "A gentle day of care, shared together."}
          </p>
        </div>
        <div
          className="progress-ring"
          style={
            {
              "--progress": `${items.length ? (resolved / items.length) * 360 : 0}deg`,
            } as React.CSSProperties
          }
        >
          <b>{items.length ? Math.round((resolved / items.length) * 100) : 0}%</b>
        </div>
      </section>
      {items.length === 0 ? (
        scope.type === "pet" ? (
          <section className="guided-empty pet-care-empty">
            <div className="empty-copy">
              <span className="eyebrow">NEXT BEST ACTION</span>
              <h2>Give this pet a care rhythm</h2>
              <p>A care plan turns medication, feeding and routines into a shared checklist—so nobody has to ask whether it was done.</p>
              <Link className="button primary" to={`/pets/${scope.id}`}>
                Open care workspace <ChevronRight size={16} />
              </Link>
            </div>
          </section>
        ) : (
          <section className="setup-journey">
            <div className="setup-intro">
              <span className="eyebrow">SET UP ONCE · CARE TOGETHER</span>
              <h2>Build your shared care space</h2>
              <p>Planet becomes useful in three small steps. Each step creates real shared data—not a demo.</p>
            </div>
            <div className="setup-steps">
              <Link className={(families.data?.families.length ?? 0) > 0 ? "complete" : "current"} to="/families">
                <span className="step-number">01</span>
                <span><strong>Create a family</strong><small>Set the home, timezone and people who help.</small></span>
                {(families.data?.families.length ?? 0) > 0 ? <Check size={18} /> : <ChevronRight size={18} />}
              </Link>
              <Link className={(pets.data?.pets.length ?? 0) > 0 ? "complete" : (families.data?.families.length ?? 0) > 0 ? "current" : "locked"} to={(families.data?.families.length ?? 0) > 0 ? "/pets" : "/families/new"}>
                <span className="step-number">02</span>
                <span><strong>Add your pet</strong><small>Keep identity, health and every home connected.</small></span>
                {(pets.data?.pets.length ?? 0) > 0 ? <Check size={18} /> : <ChevronRight size={18} />}
              </Link>
              <Link className={(pets.data?.pets.length ?? 0) > 0 ? "current" : "locked"} to={(pets.data?.pets.length ?? 0) > 0 ? `/pets/${pets.data?.pets[0]?.id}` : "/pets"}>
                <span className="step-number">03</span>
                <span><strong>Plan the care</strong><small>Add routines and assign the right people.</small></span>
                <ChevronRight size={18} />
              </Link>
            </div>
          </section>
        )
      ) : (
        <section className="task-list">
          {items.map((item) => (
            <article
              className={`task-row ${item.log?.status === "skipped" ? "skipped" : item.log ? "complete" : ""}`}
              key={item.task.id}
            >
              <button
                className="task-check"
                onClick={() => void toggle(item)}
                disabled={busyTaskId === item.task.id}
                aria-label={
                  item.log
                    ? `Undo ${item.task.title}`
                    : `Complete ${item.task.title}`
                }
              >
                {item.log?.status === "skipped" ? <X size={16} /> : item.log && <Check size={16} />}
              </button>
              <div className="task-time">
                {item.task.time_of_day ?? "Any time"}
              </div>
              <div>
                <span className="task-pet">
                  <PawPrint size={13} />
                  {item.petName}
                </span>
                <h3>{item.task.title}</h3>
                <p>{item.task.description || "No additional instructions."}</p>
                {item.log?.status === "skipped" && <small>Skipped — this was recorded in the care history.</small>}
                {item.log?.status !== "skipped" && item.log?.done_by_name && (
                  <small>Done by {item.log.done_by_name}</small>
                )}
              </div>
              <button
                className="icon-button subtle"
                onClick={() => setSkip(item.task)}
                disabled={Boolean(item.log) || busyTaskId === item.task.id}
                aria-label={`Skip ${item.task.title}`}
              >
                <MoreHorizontal size={18} />
              </button>
            </article>
          ))}
        </section>
      )}
      {skip && (
        <SkipDialog
          task={skip}
          onCancel={() => setSkip(null)}
          onConfirm={async (note) => {
            try {
              await complete.mutateAsync({
                task: skip,
                status: "skipped",
                date,
                note,
                commandId: createCommandId(),
              });
            } catch {
              // The mutation callback records offline work and exposes the queue banner.
            }
            setSkip(null);
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onCancel} aria-label="Close">
          <X size={18} />
        </button>
        <span className="eyebrow">RECORD A SKIP</span>
        <h2>{task.title}</h2>
        <p>This stays in the care history so everyone knows what happened.</p>
        <label className="form-field">
          <span>Reason or note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
          />
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onCancel}>
            Cancel
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
            Skip and record
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
