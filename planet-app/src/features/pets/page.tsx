import * as React from "react";
/* eslint-disable react-refresh/only-export-components -- pet helpers stay private to this feature module. */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage } from "../../core/api/errors";
import { EmptyState, InlineError, PageSkeleton, Toast, BusyButton, ConfirmDialog } from "../../core/ui";
import { queryClient } from "../../core/query/client";
import { queryKeys } from "../../core/query/keys";
import { Check, ChevronRight, CircleAlert, Download, PawPrint, Pencil, Plus, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { MedicationForm, Sharing } from "../families/page";
import { BackHeader, Card, CarePlan, Family, Medication, Page, PageTitle, Pet, Profile, civilDateInTimezone, useFamilies, useInvalidate, usePets, invalidateAll } from "../../app/shared";

export function PetsPage() {
  const pets = usePets();
  const families = useFamilies();
  const [showCreate, setShowCreate] = useState(false);
  const [archived, setArchived] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [toast, setToast] = useState("");
  if (pets.isLoading || families.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (pets.error || families.error)
    return (
      <Page>
        <InlineError
          error={pets.error ?? families.error}
          onRetry={() => {
            void pets.refetch();
            void families.refetch();
          }}
        />
      </Page>
    );
  const rows = (pets.data?.pets ?? []).filter((pet) =>
    archived ? pet.archived_at : !pet.archived_at,
  );
  return (
    <Page>
      <PageTitle
        eyebrow="THEIR LITTLE WORLDS"
        title="Your pets"
        description="One profile for every pet, shared across all their homes."
        action={
          families.data?.families.length ? (
            <button
              className="button primary"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={16} /> Add pet
            </button>
          ) : (
            <Link className="button primary" to="/families/new">
              <Plus size={16} /> Create Family first
            </Link>
          )
        }
      />
      <div className="segmented">
        <button
          className={!archived ? "selected" : ""}
          onClick={() => setArchived(false)}
        >
          Active
        </button>
        <button
          className={archived ? "selected" : ""}
          onClick={() => setArchived(true)}
        >
          Archived
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={
            archived
              ? "No archived pets"
              : families.data?.families.length
                ? "No pets yet"
                : "Create a Family first"
          }
          description={
            archived
              ? "Archived profiles stay read-only."
              : families.data?.families.length
                ? "Create your first pet profile inside a Family."
                : "Pets belong to a Family so everyone can share care and history."
          }
          action={
            !archived && families.data?.families.length ? (
              <button
                className="button primary"
                onClick={() => setShowCreate(true)}
              >
                Create pet
              </button>
            ) : !archived ? (
              <Link className="button primary" to="/families/new">
                Create Family
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="pet-grid">
          {rows.map((pet) => (
            <Link className="pet-card" to={`/pets/${pet.id}`} key={pet.id}>
              <div className="pet-portrait">
                <span className="pet-avatar">
                  <PawPrint size={30} />
                </span>
                <span className="status-pill">
                  {pet.archived_at ? "ARCHIVED" : "ACTIVE"}
                </span>
              </div>
              <div>
                <span className="eyebrow">{pet.species || "PET"}</span>
                <h2>{pet.name}</h2>
                <p>
                  {[pet.breed, pet.sex].filter(Boolean).join(" · ") ||
                    "Profile details not set"}
                </p>
                <small>
                  {pet.family_ids.length} family link
                  {pet.family_ids.length === 1 ? "" : "s"}
                </small>
              </div>
              <ChevronRight className="card-chevron" size={20} />
            </Link>
          ))}
        </div>
      )}
      <button
        className="text-button"
        onClick={() => setDeleted((value) => !value)}
      >
        {deleted ? "Hide deleted pets" : "View deleted pets"}
      </button>
      {deleted && (
        <DeletedPets
          onRestored={() => {
            setToast("Pet restored.");
            invalidateAll(queryClient);
          }}
        />
      )}
      {showCreate && (
        <CreatePet
          families={families.data?.families ?? []}
          onClose={() => setShowCreate(false)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
  );
}

export function DeletedPets({ onRestored }: { onRestored: () => void }) {
  const query = useQuery({
    queryKey: ["deleted-pets"],
    queryFn: () => api.get<{ pets: Pet[] }>("/pets/deleted"),
  });
  const [error, setError] = useState("");
  if (query.isLoading) return <PageSkeleton />;
  if (query.error)
    return (
      <InlineError error={query.error} onRetry={() => void query.refetch()} />
    );
  return (
    <div className="stack compact">
      {(query.data?.pets ?? []).map((pet) => (
        <Card key={pet.id}>
          <div className="row-between">
            <span>
              <strong>{pet.name}</strong>
              <small>{pet.species} · deleted profile</small>
            </span>
            <button
              className="button ghost"
              onClick={async () => {
                setError("");
                try {
                  await api.post(`/pets/${pet.id}/restore`);
                  await query.refetch();
                  onRestored();
                } catch (reason) {
                  setError(errorMessage(reason));
                }
              }}
            >
              Restore
            </button>
          </div>
        </Card>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {(query.data?.pets ?? []).length === 0 && (
        <p className="muted-copy">No deleted pets in the recovery list.</p>
      )}
    </div>
  );
}
export function CreatePet({
  families,
  onClose,
}: {
  families: Family[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [familyId, setFamilyId] = useState(families[0]?.id ?? "");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("dog");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [neutered, setNeutered] = useState(false);
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function save() {
    if (!familyId || !name.trim()) {
      setError("Choose a family and enter a name.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ pet: Pet }>(
        `/families/${familyId}/pets`,
        {
          name: name.trim(),
          species,
          breed,
          birth_date: birthDate,
          sex,
          neutered,
          weight_g: weight ? Math.round(Number(weight)) : undefined,
        },
        { idempotencyKey: commandId.current },
      );
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
      onClose();
      navigate(`/pets/${result.pet.id}`);
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
        <span className="eyebrow">A NEW LITTLE WORLD</span>
        <h2>Add a pet</h2>
        <label className="form-field">
          <span>Family</span>
          <select
            value={familyId}
            onChange={(event) => setFamilyId(event.target.value)}
          >
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>Species</span>
          <select
            value={species}
            onChange={(event) => setSpecies(event.target.value)}
          >
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="form-field">
          <span>Breed</span>
          <input
            value={breed}
            onChange={(event) => setBreed(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="form-field">
            <span>Birth date</span>
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Sex</span>
            <select
              value={sex}
              onChange={(event) => setSex(event.target.value)}
            >
              <option value="">Not set</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>
        </div>
        <label className="toggle-row">
          <span>
            <strong>Neutered</strong>
            <small>Record this in the medical profile.</small>
          </span>
          <input
            type="checkbox"
            checked={neutered}
            onChange={(event) => setNeutered(event.target.checked)}
          />
        </label>
        <label className="form-field">
          <span>Initial weight (grams, optional)</span>
          <input
            type="number"
            min="1"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            Create profile
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function PetPage() {
  const { petId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const families = useFamilies();
  const petQuery = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => api.get<{ pet: Pet; profile: Profile }>(`/pets/${petId}`),
    enabled: Boolean(petId),
  });
  const tab: "overview" | "care" | "meds" | "sharing" =
    location.pathname.includes("/care")
      ? "care"
      : location.pathname.includes("/medications")
        ? "meds"
        : location.pathname.includes("/sharing") ||
            location.pathname.includes("/access")
          ? "sharing"
          : "overview";
  const [edit, setEdit] = useState(() => location.pathname.endsWith("/edit"));
  const [confirm, setConfirm] = useState<"delete" | "archive" | null>(null);
  const invalidate = useInvalidate();
  const [toast, setToast] = useState("");
  const commandId = useRef(createCommandId());
  if (petQuery.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (petQuery.error || !petQuery.data)
    return (
      <Page>
        <InlineError error={petQuery.error ?? new Error("Pet not found")} />
      </Page>
    );
  const { pet, profile } = petQuery.data;
  const update = async (payload: Record<string, unknown>) => {
    await api.patch(
      `/pets/${pet.id}/record`,
      { ...payload, version: pet.version },
      { idempotencyKey: commandId.current },
    );
    await petQuery.refetch();
    setEdit(false);
    setToast("Pet profile saved.");
  };
  async function destroy() {
    await api.delete(`/pets/${pet.id}`, { confirm: pet.id });
    await invalidate();
    navigate("/pets");
  }
  async function archive() {
    await api.post(
      `/pets/${pet.id}/${pet.archived_at ? "unarchive" : "archive"}`,
    );
    await petQuery.refetch();
    setConfirm(null);
    setToast(pet.archived_at ? "Pet restored to active." : "Pet archived.");
  }
  return (
    <div className="detail-view">
      <BackHeader
        title={pet.name}
        action={
          <Link className="button ghost" to={`/pets/${pet.id}/timeline`}>
            Timeline
          </Link>
        }
      />
      <Page className="pet-page">
        <section className="pet-hero">
          <span className="pet-avatar large">
            <PawPrint size={42} />
          </span>
          <span className="status-pill">
            {pet.archived_at ? "ARCHIVED" : "ACTIVE"}
          </span>
        </section>
        <div className="pet-heading">
          <span className="eyebrow">{pet.species || "PET"}</span>
          <h1>{pet.name}</h1>
          <p>
            {[pet.breed, pet.sex, pet.birth_date && `Born ${pet.birth_date}`]
              .filter(Boolean)
              .join(" · ") ||
              "Complete this profile to help your family care well."}
          </p>
        </div>
        {pet.archived_at && (
          <Card className="notice">
            <CircleAlert size={19} />
            <div>
              <strong>This pet is read-only.</strong>
              <p>
                Unarchive it before adding Care Plans, Medication, or Timeline
                records.
              </p>
            </div>
          </Card>
        )}
        <div className="tab-row">
          <button
            className={tab === "overview" ? "selected" : ""}
            onClick={() => navigate(`/pets/${pet.id}`)}
          >
            Overview
          </button>
          <button
            className={tab === "care" ? "selected" : ""}
            onClick={() => navigate(`/pets/${pet.id}/care`)}
          >
            Care
          </button>
          <button
            className={tab === "meds" ? "selected" : ""}
            onClick={() => navigate(`/pets/${pet.id}/medications`)}
          >
            Medication
          </button>
          <button
            className={tab === "sharing" ? "selected" : ""}
            onClick={() => navigate(`/pets/${pet.id}/sharing`)}
          >
            Sharing
          </button>
        </div>
        {tab === "overview" && (
          <PetOverview
            pet={pet}
            profile={profile}
            onEdit={() => setEdit(true)}
            onArchive={() => setConfirm("archive")}
            onDelete={() => setConfirm("delete")}
          />
        )}
        {tab === "care" && (
          <CarePlans
            pet={pet}
            timezone={families.data?.families.find((family) => pet.family_ids.includes(family.id))?.timezone}
            initialShow={location.pathname.endsWith("/care/new")}
          />
        )}
        {tab === "meds" && <Medications pet={pet} />}
        {tab === "sharing" && <Sharing pet={pet} />}
        {edit && (
          <PetEdit
            pet={pet}
            profile={profile}
            onClose={() => setEdit(false)}
            onSave={update}
          />
        )}
        {confirm === "archive" && (
          <ConfirmDialog
            title={
              pet.archived_at
                ? `Unarchive ${pet.name}?`
                : `Archive ${pet.name}?`
            }
            consequence={
              pet.archived_at
                ? "The profile and its write actions become active again."
                : "The profile becomes read-only. History is kept and no new care can be added."
            }
            confirmLabel={pet.archived_at ? "Unarchive" : "Archive"}
            onCancel={() => setConfirm(null)}
            onConfirm={archive}
          />
        )}
        {confirm === "delete" && (
          <ConfirmDialog
            title={`Delete ${pet.name}?`}
            consequence="The profile leaves active views. Existing history is retained by the server during its protected recovery period."
            confirmLabel="Delete pet"
            requireText={pet.id}
            onCancel={() => setConfirm(null)}
            onConfirm={destroy}
          />
        )}
        {toast && <Toast message={toast} onClose={() => setToast("")} />}
      </Page>
    </div>
  );
}
export function PetOverview({
  pet,
  profile,
  onEdit,
  onArchive,
  onDelete,
}: {
  pet: Pet;
  profile: Profile;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const exportPet = async () => {
    const data = await api.get<unknown>(`/pets/${pet.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${pet.name.toLowerCase().replace(/\s+/g, "-")}-planet-export.json`;
    link.click();
    URL.revokeObjectURL(href);
  };
  return (
    <>
      <div className="action-grid">
        <button onClick={onEdit}>
          <Pencil size={18} />
          <strong>Edit profile</strong>
          <small>Identity & medical notes</small>
        </button>
        <button onClick={() => void exportPet()}>
          <Download size={18} />
          <strong>Export</strong>
          <small>Download JSON record</small>
        </button>
        <Link className="action-card" to={`/pets/${pet.id}/transfer`}>
          <Users size={18} />
          <strong>Transfer ownership</strong>
          <small>Move this Pet to another Family</small>
        </Link>
      </div>
      <Card>
        <div className="section-heading">
          <span className="eyebrow">IDENTITY</span>
          <button className="text-button" onClick={onEdit}>
            Edit
          </button>
        </div>
        <dl className="data-list">
          <div>
            <dt>Species</dt>
            <dd>{pet.species || "Not set"}</dd>
          </div>
          <div>
            <dt>Breed</dt>
            <dd>{pet.breed || "Not set"}</dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd>
              {pet.weight_g
                ? `${(pet.weight_g / 1000).toFixed(2)} kg`
                : "Add a weight event in Timeline"}
            </dd>
          </div>
          <div>
            <dt>Family links</dt>
            <dd>{pet.family_ids.length}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <span className="eyebrow">MEDICAL PROFILE</span>
        <p className="long-copy">{profile.notes || "No medical notes yet."}</p>
      </Card>
      <PetFamilyLinks pet={pet} />
      <button className="danger-link" onClick={onArchive}>
        <ShieldCheck size={16} />{" "}
        {pet.archived_at ? "Unarchive pet" : "Archive pet"}
      </button>
      <button className="danger-link muted" onClick={onDelete}>
        <Trash2 size={16} /> Delete pet profile
      </button>
    </>
  );
}

export function PetFamilyLinks({ pet }: { pet: Pet }) {
  const families = useFamilies();
  const client = useQueryClient();
  const [familyId, setFamilyId] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const available = (families.data?.families ?? []).filter(
    (family) => !pet.family_ids.includes(family.id),
  );
  async function share() {
    if (!familyId) return;
    try {
      await api.post(`/pets/${pet.id}/families`, { family_id: familyId });
      setToast("Family link added.");
      await families.refetch();
      await client.invalidateQueries({ queryKey: queryKeys.pet(pet.id) });
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  async function unshare() {
    if (!removeId) return;
    try {
      await api.delete(`/pets/${pet.id}/families/${removeId}`);
      setToast("Family link removed.");
      setRemoveId(null);
      await client.invalidateQueries({ queryKey: queryKeys.pet(pet.id) });
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  return (
    <Card>
      <div className="section-heading">
        <div>
          <span className="eyebrow">FAMILY LINKS</span>
          <h2>Where {pet.name} is cared for</h2>
        </div>
      </div>
      <div className="stack compact">
        {(families.data?.families ?? [])
          .filter((family) => pet.family_ids.includes(family.id))
          .map((family) => (
            <div className="row-between" key={family.id}>
              <span>
                <strong>{family.name}</strong>
                <small>{family.timezone}</small>
              </span>
              {pet.family_ids.length > 1 && (
                <button
                  className="text-button"
                  onClick={() => setRemoveId(family.id)}
                >
                  Unlink
                </button>
              )}
            </div>
          ))}
      </div>
      {!pet.archived_at && available.length > 0 && (
        <div className="form-inline">
          <select
            value={familyId}
            onChange={(event) => setFamilyId(event.target.value)}
          >
            <option value="">Link another Family…</option>
            {available.map((family) => (
              <option value={family.id} key={family.id}>
                {family.name}
              </option>
            ))}
          </select>
          <button
            className="button ghost"
            onClick={() => void share()}
            disabled={!familyId}
          >
            Link
          </button>
        </div>
      )}
      {removeId && (
        <ConfirmDialog
          title="Unlink this Family?"
          consequence="People in that Family lose access to this Pet. Pet history remains unchanged."
          confirmLabel="Unlink Family"
          onCancel={() => setRemoveId(null)}
          onConfirm={unshare}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Card>
  );
}
export function PetEdit({
  pet,
  profile,
  onClose,
  onSave,
}: {
  pet: Pet;
  profile: Profile;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(pet.name);
  const [species, setSpecies] = useState(pet.species);
  const [breed, setBreed] = useState(pet.breed);
  const [sex, setSex] = useState(pet.sex);
  const [birthDate, setBirthDate] = useState(pet.birth_date ?? "");
  const [neutered, setNeutered] = useState(pet.neutered);
  const [notes, setNotes] = useState(profile.notes);
  const [allergies, setAllergies] = useState(
    profileLines(profile.allergies, "name"),
  );
  const [conditions, setConditions] = useState(
    profileLines(profile.conditions, "name"),
  );
  const [emergencyContacts, setEmergencyContacts] = useState(
    profileContacts(profile.emergency_contacts),
  );
  const [decisionMaker, setDecisionMaker] = useState(
    profileObjectName(profile.med_decision_maker),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="eyebrow">PET RECORD</span>
        <h2>Edit {pet.name}</h2>
        {[
          ["Name", name, setName],
          ["Species", species, setSpecies],
          ["Breed", breed, setBreed],
          ["Sex", sex, setSex],
        ].map(([label, value, setter]) => (
          <label className="form-field" key={label as string}>
            <span>{label as string}</span>
            <input
              value={value as string}
              onChange={(event) =>
                (setter as React.Dispatch<React.SetStateAction<string>>)(
                  event.target.value,
                )
              }
            />
          </label>
        ))}
        <label className="form-field">
          <span>Medical notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Allergies (one per line)</span>
          <textarea
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Conditions (one per line)</span>
          <textarea
            value={conditions}
            onChange={(event) => setConditions(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Emergency contacts (name | phone, one per line)</span>
          <textarea
            value={emergencyContacts}
            onChange={(event) => setEmergencyContacts(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Medication decision maker</span>
          <input
            value={decisionMaker}
            onChange={(event) => setDecisionMaker(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="form-field">
            <span>Birth date</span>
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Neutered</strong>
            </span>
            <input
              type="checkbox"
              checked={neutered}
              onChange={(event) => setNeutered(event.target.checked)}
            />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton
            className="button primary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({
                  name: name.trim(),
                  species,
                  breed,
                  sex,
                  birth_date: birthDate,
                  neutered,
                  notes,
                  allergies: profileLinesPayload(allergies),
                  conditions: profileLinesPayload(conditions),
                  emergency_contacts: profileContactsPayload(emergencyContacts),
                  med_decision_maker: decisionMaker.trim()
                    ? { name: decisionMaker.trim() }
                    : null,
                });
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save changes
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function profileLines(value: unknown, key: string) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const current = (item as Record<string, unknown>)[key];
      return typeof current === "string" ? current : "";
    })
    .filter(Boolean)
    .join("\n");
}
export function profileLinesPayload(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}
export function profileContacts(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const contact = item as Record<string, unknown>;
      const name = typeof contact.name === "string" ? contact.name : "";
      const phone = typeof contact.phone === "string" ? contact.phone : "";
      return phone ? `${name} | ${phone}` : name;
    })
    .filter(Boolean)
    .join("\n");
}
export function profileContactsPayload(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...phone] = line.split("|");
      return { name: name.trim(), phone: phone.join("|").trim() };
    });
}
export function profileObjectName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" ? name : "";
}

export function CarePlans({
  pet,
  timezone,
  initialShow = false,
}: {
  pet: Pet;
  timezone?: string;
  initialShow?: boolean;
}) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.carePlans(pet.id),
    queryFn: () =>
      api.get<{ care_plans: CarePlan[] }>(
        `/pets/${pet.id}/care-plans?include_archived=true`,
      ),
  });
  const [show, setShow] = useState(initialShow);
  const [confirm, setConfirm] = useState<CarePlan | null>(null);
  const [editing, setEditing] = useState<CarePlan | null>(null);
  const invalidate = useInvalidate();
  if (query.isLoading) return <PageSkeleton />;
  if (query.error)
    return (
      <InlineError error={query.error} onRetry={() => void query.refetch()} />
    );
  const plans = query.data?.care_plans ?? [];
  async function remove(plan: CarePlan) {
    await api.delete(`/care-plans/${plan.id}`);
    setConfirm(null);
    invalidate();
  }
  return (
    <section className="subpage">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CARE PLANS</span>
          <h2>Reliable routines</h2>
        </div>
        {!pet.archived_at && (
          <button className="button primary" onClick={() => { setShow(true); navigate(`/pets/${pet.id}/care/new`); }}>
            <Plus size={16} /> New plan
          </button>
        )}
      </div>
      {plans.length === 0 ? (
        <EmptyState
          title="No care plans"
          description="Create a daily, weekly, monthly, or interval routine."
        />
      ) : (
        <div className="stack">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={plan.status === "archived" ? "dimmed" : ""}
            >
              <div className="row-between">
                <div>
                  <span className="eyebrow">{plan.type}</span>
                  <h3>{plan.title}</h3>
                  <p>
                    {plan.description || "No description"} · {ruleSummary(plan)}
                  </p>
                </div>
                <div className="row-actions">
                  <Link
                    className="icon-button subtle"
                    to={`/pets/${pet.id}/care/${plan.id}/assignments`}
                    aria-label="Manage assignments"
                  >
                    <Users size={16} />
                  </Link>
                  <button
                    className="icon-button subtle"
                    onClick={() => setEditing(plan)}
                    aria-label="Edit care plan"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button subtle"
                    onClick={() => setConfirm(plan)}
                    aria-label="Delete care plan"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {show && (
        <CarePlanForm
          petId={pet.id}
          timezone={timezone}
          onClose={() => { setShow(false); if (initialShow) navigate(`/pets/${pet.id}/care`, { replace: true }); }}
          onSaved={() => {
            setShow(false);
            if (initialShow) navigate(`/pets/${pet.id}/care`, { replace: true });
            invalidate();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.title}?`}
          consequence="Future occurrences stop; completed history remains in the timeline."
          confirmLabel="Delete plan"
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      )}
      {editing && (
        <CarePlanEdit
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
    </section>
  );
}
export function ruleSummary(plan: CarePlan) {
  const kind =
    typeof plan.frequency?.kind === "string" ? plan.frequency.kind : "daily";
  return `${kind}${plan.time_of_day ? ` · ${plan.time_of_day}` : ""} · ${plan.timezone}`;
}
export function CarePlanForm({
  petId,
  timezone,
  onClose,
  onSaved,
}: {
  petId: string;
  timezone?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("custom");
  const [rule, setRule] = useState<"daily" | "weekly" | "monthly" | "interval">(
    "daily",
  );
  const [time, setTime] = useState("");
  const [days, setDays] = useState<number[]>([1]);
  const [day, setDay] = useState("1");
  const [interval, setIntervalValue] = useState("1");
  const [startDate, setStartDate] = useState(civilDateInTimezone(timezone));
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  const valid =
    Boolean(title.trim()) &&
    (rule !== "weekly" || days.length > 0) &&
    (rule !== "interval" || Number(interval) >= 1) &&
    (!endDate || endDate >= startDate);
  async function save() {
    if (!valid) {
      setError("Check the rule fields before saving.");
      return;
    }
    setBusy(true);
    try {
      await api.post(
        `/pets/${petId}/care-plans`,
        {
          type,
          title: title.trim(),
          description,
          rule: {
            type: rule,
            interval: Number(interval),
            days,
            day: Number(day),
            ...(time ? { time } : {}),
            start_date: startDate,
            end_date: endDate,
          },
        },
        { idempotencyKey: commandId.current },
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
      <section className="modal wide">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="eyebrow">CARE PLAN</span>
        <h2>Build a routine</h2>
        <label className="form-field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Morning medication"
          />
        </label>
        <div className="form-grid">
          <label className="form-field">
            <span>Type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="custom">Custom</option>
              <option value="feeding">Feeding</option>
              <option value="health">Health</option>
              <option value="grooming">Grooming</option>
              <option value="exercise">Exercise</option>
              <option value="medication">Medication</option>
            </select>
          </label>
          <label className="form-field">
            <span>Rule</span>
            <select
              value={rule}
              onChange={(event) => setRule(event.target.value as typeof rule)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="interval">Interval</option>
            </select>
          </label>
        </div>
        {rule === "weekly" && (
          <div className="weekday-row">
            {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
              <button
                type="button"
                className={days.includes(index + 1) ? "selected" : ""}
                key={`${label}-${index}`}
                onClick={() =>
                  setDays((current) =>
                    current.includes(index + 1)
                      ? current.filter((dayValue) => dayValue !== index + 1)
                      : [...current, index + 1],
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {rule === "monthly" && (
          <label className="form-field">
            <span>Day of month (1–31)</span>
            <input
              type="number"
              min="1"
              max="31"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
        )}
        {rule === "interval" && (
          <label className="form-field">
            <span>Every N days</span>
            <input
              type="number"
              min="1"
              value={interval}
              onChange={(event) => setIntervalValue(event.target.value)}
            />
          </label>
        )}
        <div className="form-grid">
          <label className="form-field">
            <span>Time (Family timezone)</span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
        </div>
        <label className="form-field">
          <span>End date (optional)</span>
          <input
            type="date"
            min={startDate}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            Create care plan
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function CarePlanEdit({
  plan,
  onClose,
  onSaved,
}: {
  plan: CarePlan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [description, setDescription] = useState(plan.description);
  const [time, setTime] = useState(plan.time_of_day ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function save() {
    setBusy(true);
    try {
      await api.patch(`/care-plans/${plan.id}`, {
        title: title.trim(),
        description,
        schedule: plan.frequency,
        time_of_day: time || null,
      }, { idempotencyKey: commandId.current });
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
        <span className="eyebrow">CARE PLAN</span>
        <h2>Edit {plan.title}</h2>
        <label className="form-field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Time ({plan.timezone})</span>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            Save changes
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function Medications({ pet }: { pet: Pet }) {
  const query = useQuery({
    queryKey: queryKeys.medications(pet.id),
    queryFn: () =>
      api.get<{ medications: Medication[] }>(`/pets/${pet.id}/medications`),
  });
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [confirm, setConfirm] = useState<{
    med: Medication;
    action: "stop" | "delete";
    commandId: string;
  } | null>(null);
  const invalidate = useInvalidate();
  const families = useFamilies();
  if (query.isLoading) return <PageSkeleton />;
  if (query.error)
    return (
      <InlineError error={query.error} onRetry={() => void query.refetch()} />
    );
  const meds = query.data?.medications ?? [];
  async function mutate() {
    if (!confirm) return;
    if (confirm.action === "stop")
      await api.post(`/medications/${confirm.med.id}/stop`, {
        ended_on: civilDateInTimezone(
          families.data?.families.find((family) => pet.family_ids.includes(family.id))?.timezone,
        ),
      }, { idempotencyKey: confirm.commandId });
    else await api.delete(`/medications/${confirm.med.id}`, undefined, { idempotencyKey: confirm.commandId });
    setConfirm(null);
    invalidate();
  }
  return (
    <section className="subpage">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MEDICATIONS</span>
          <h2>Medication log</h2>
        </div>
        {!pet.archived_at && (
          <button className="button primary" onClick={() => setShow(true)}>
            <Plus size={16} /> Add medication
          </button>
        )}
      </div>
      {meds.length === 0 ? (
        <EmptyState
          title="No medication"
          description="Track name, dose, schedule, and notes with a real medication record."
        />
      ) : (
        <div className="stack">
          {meds.map((med) => (
            <Card key={med.id} className={med.ended_on ? "dimmed" : ""}>
              <div className="row-between">
                <div>
                  <span className="eyebrow">
                    {med.ended_on ? `STOPPED ${med.ended_on}` : "ACTIVE"}
                  </span>
                  <h3>{med.name}</h3>
                  <p>
                    {med.dose} · {med.schedule}
                  </p>
                  {med.note && <small>{med.note}</small>}
                </div>
                {!med.ended_on && (
                  <div className="row-actions">
                    <button
                      className="icon-button subtle"
                      onClick={() => setEditing(med)}
                      aria-label="Edit medication"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button subtle"
                      onClick={() => setConfirm({ med, action: "stop", commandId: createCommandId() })}
                      aria-label="Stop medication"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="icon-button subtle"
                      onClick={() => setConfirm({ med, action: "delete", commandId: createCommandId() })}
                      aria-label="Delete medication"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {show && (
        <MedicationForm
          petId={pet.id}
          onClose={() => setShow(false)}
          onSaved={() => {
            setShow(false);
            invalidate();
          }}
        />
      )}
      {editing && (
        <MedicationForm
          petId={pet.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`${confirm.action === "stop" ? "Stop" : "Delete"} ${confirm.med.name}?`}
          consequence={
            confirm.action === "stop"
              ? "The medication stays in history but is no longer active."
              : "This removes erroneous medication data and its related history."
          }
          confirmLabel={
            confirm.action === "stop" ? "Stop medication" : "Delete medication"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={mutate}
        />
      )}
    </section>
  );
}
