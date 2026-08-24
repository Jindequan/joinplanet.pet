import { useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { errorMessage } from "../../core/api/errors";
import { ConfirmDialog, EmptyState, InlineError, PageSkeleton, Toast, BusyButton } from "../../core/ui";
import { createCommandId } from "../../core/api/idempotency";
import { parseEventPayload } from "../../features/timeline/registry";
import { HeartPulse, Pencil, Plus, Search, Syringe, Trash2, Weight, X } from "lucide-react";
import {
  Event, Page, PageTitle, useFamilies, useInvalidate, usePets, useScope,
  dateTimeLocalInTimezone, instantFromCivilDateTime,
} from "../../app/shared";

export function TimelinePage() {
  const { scope } = useScope();
  const { petId: routePetId = "" } = useParams();
  const timelineScope = routePetId
    ? ({ type: "pet", id: routePetId } as const)
    : scope;
  const petId = timelineScope.type === "pet" ? timelineScope.id : "";
  const pets = usePets();
  const families = useFamilies();
  const timezone = timelineScope.type === "family"
    ? families.data?.families.find((family) => family.id === timelineScope.id)?.timezone
    : petId
      ? families.data?.families.find((family) =>
          pets.data?.pets.find((pet) => pet.id === petId)?.family_ids.includes(family.id),
        )?.timezone
      : undefined;
  const query = useInfiniteQuery({
    queryKey: ["timeline", timelineScope],
    initialPageParam: undefined as
      { before: string; before_id: string } | undefined,
    queryFn: ({ pageParam }) => {
      const timelineParams = new URLSearchParams({ limit: "50" });
      if (timelineScope.type === "family")
        timelineParams.set("family_id", timelineScope.id);
      if (timelineScope.type === "pet")
        timelineParams.set("pet_id", timelineScope.id);
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
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
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
  const events = (query.data?.pages.flatMap((page) => page.events) ?? [])
    .filter(
      (event, index, all) =>
        all.findIndex((candidate) => candidate.id === event.id) === index,
    )
    .filter((event) =>
      JSON.stringify(event).toLowerCase().includes(text.toLowerCase()),
    );
  async function remove(event: Event) {
    try {
      await api.delete(`/timeline-events/${event.id}`);
      setEventToDelete(null);
      setToast("Record deleted.");
      invalidate();
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  return (
    <Page>
      <PageTitle
        eyebrow="A LIVING RECORD"
        title="Timeline"
        description="The small details that tell their whole story."
        action={
          petId ? (
            <button
              className="button primary"
              onClick={() => setShowForm(true)}
            >
              <Plus size={16} /> Add record
            </button>
          ) : (
            <span className="eyebrow">READ-ONLY AGGREGATE</span>
          )
        }
      />
      <div className="search-box">
        <Search size={17} />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search records"
        />
      </div>
      <section className="timeline-list">
        {events.length === 0 ? (
          <EmptyState
            title="No records yet"
            description="Add a note, symptom, weight, visit, or vaccine."
          />
        ) : (
          events.map((event) => (
            <EventCard
              event={event}
              key={event.id}
              onEdit={() => setEventToEdit(event)}
              onDelete={() => setEventToDelete(event)}
            />
          ))
        )}
      </section>
      {query.hasNextPage && (
        <button
          className="button secondary full"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading history…" : "Load older records"}
        </button>
      )}
      {showForm && petId && (
          <EventForm
            petId={petId}
            timezone={timezone}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            setToast("Timeline record added.");
            invalidate();
          }}
        />
      )}
      {eventToDelete && (
        <ConfirmDialog
          title={`Delete this ${eventToDelete.type} record?`}
          consequence="This removes the manual record from the timeline. Automatic care history cannot be deleted here."
          confirmLabel="Delete record"
          onCancel={() => setEventToDelete(null)}
          onConfirm={() => remove(eventToDelete)}
        />
      )}
      {eventToEdit && petId && (
        <EventForm
          petId={petId}
          timezone={timezone}
          initial={eventToEdit}
          onClose={() => setEventToEdit(null)}
          onSaved={() => {
            setEventToEdit(null);
            setToast("Timeline record updated.");
            invalidate();
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
  );
}
export function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: Event;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const payload = Object.entries(event.payload ?? {})
    .filter(([key]) => key !== "dedupe")
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
    .join(" · ");
  return (
    <article className="timeline-card">
      <div className="timeline-icon">
        {event.type === "weight" ? (
          <Weight size={19} />
        ) : event.type === "vaccine" ? (
          <Syringe size={19} />
        ) : (
          <HeartPulse size={19} />
        )}
      </div>
      <div>
        <div className="timeline-meta">
          <span>{new Date(event.occurred_at).toLocaleString()}</span>
          <span>{event.source === "user" ? "Manual" : "Automatic"}</span>
        </div>
        <h3>{event.type.replaceAll("_", " ")}</h3>
        <p>{payload || "No details recorded."}</p>
        <small>{event.recorded_by_name ?? "Planet system"}</small>
      </div>
      {event.source === "user" && (
        <div className="row-actions">
          <button
            className="icon-button subtle"
            onClick={onEdit}
            aria-label="Edit record"
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button subtle"
            onClick={onDelete}
            aria-label="Delete record"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </article>
  );
}
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
  const [type, setType] = useState(initial?.type ?? "note");
  const [occurredAt, setOccurredAt] = useState(
    initial
      ? dateTimeLocalInTimezone(initial.occurred_at, timezone)
      : dateTimeLocalInTimezone(new Date(), timezone),
  );
  const [details, setDetails] = useState(
    initial
      ? Object.values(initial.payload ?? {})
          .filter((value) => typeof value !== "object")
          .join(" · ")
      : "",
  );
  const [weight, setWeight] = useState(() => {
    const grams = initial?.payload?.weight_g;
    return typeof grams === "number" ? String(grams / 1000) : "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function save() {
    setBusy(true);
    try {
      const payload = type === "weight"
        ? { weight_g: Math.round(Number(weight) * 1000), note: details }
        : type === "vaccine"
          ? { name: details }
          : type === "vet_visit"
            ? { title: details, summary: details }
            : type === "symptom"
              ? { title: details, detail: details }
              : { text: details };
      if (parseEventPayload(type, payload).kind === "unknown") {
        setError(
          type === "weight"
            ? "Enter a positive weight."
            : "Check the record details.",
        );
        return;
      }
      if (initial) {
        await api.patch(`/timeline-events/${initial.id}`, {
          occurred_at: instantFromCivilDateTime(occurredAt, timezone),
          payload,
        }, { idempotencyKey: commandId.current });
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
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="eyebrow">
          {initial ? "EDIT TIMELINE RECORD" : "NEW TIMELINE RECORD"}
        </span>
        <h2>{initial ? "Edit record" : "What happened?"}</h2>
        <label className="form-field">
          <span>Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            disabled={Boolean(initial)}
          >
            <option value="note">Note</option>
            <option value="symptom">Symptom</option>
            <option value="weight">Weight</option>
            <option value="vet_visit">Visit</option>
            <option value="vaccine">Vaccine</option>
          </select>
        </label>
        <label className="form-field">
          <span>Occurred at</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>
        {type === "weight" && (
          <label className="form-field">
            <span>Weight (kg)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </label>
        )}
        <label className="form-field">
          <span>Details</span>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            Save record
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
