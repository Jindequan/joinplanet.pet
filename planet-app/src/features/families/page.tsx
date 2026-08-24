import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage } from "../../core/api/errors";
import { EmptyState, InlineError, PageSkeleton, Toast, BusyButton, ConfirmDialog } from "../../core/ui";
import { queryKeys } from "../../core/query/keys";
import { Check, ChevronRight, Copy, Home, PawPrint, Plus, ShieldCheck, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { AccessGrant, BackHeader, Card, Family, Member, Medication, Pet, Share, Transfer, Page, PageTitle, useFamilies, useInvalidate } from "../../app/shared";

export function AssignmentsPage() {
  const { petId = "", planId = "" } = useParams();
  const pet = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => api.get<{ pet: Pet }>(`/pets/${petId}`),
    enabled: Boolean(petId),
  });
  const familyId = pet.data?.pet.family_ids[0] ?? "";
  const family = useQuery({
    queryKey: queryKeys.family(familyId),
    queryFn: () =>
      api.get<{ family: Family; members: Member[] }>(`/families/${familyId}`),
    enabled: Boolean(familyId),
  });
  const assignments = useQuery({
    queryKey: ["assignments", planId],
    queryFn: () =>
      api.get<{ assignments: Array<{ user_id: string; role: string }> }>(
        `/care-plans/${planId}/assignments`,
      ),
    enabled: Boolean(planId),
  });
  const [busyUser, setBusyUser] = useState("");
  const [removeUser, setRemoveUser] = useState<Member | null>(null);
  const [error, setError] = useState("");
  const assigned = new Set(
    (assignments.data?.assignments ?? []).map(
      (assignment) => assignment.user_id,
    ),
  );
  async function setAssignment(userId: string, shouldAssign: boolean) {
    setBusyUser(userId);
    setError("");
    try {
      if (shouldAssign) {
        await api.put(`/care-plans/${planId}/assignments/${userId}`, {
          role: "helper",
        });
      } else {
        await api.delete(`/care-plans/${planId}/assignments/${userId}`);
      }
      await assignments.refetch();
      setRemoveUser(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyUser("");
    }
  }
  return (
    <div className="detail-view">
      <BackHeader title="Care assignments" />
      <Page>
        <PageTitle
          eyebrow="WHO DOES WHAT"
          title="Assignments"
          description="Assignments are managed against the current Family members by the API."
        />
        {pet.isLoading || family.isLoading || assignments.isLoading ? (
          <PageSkeleton />
        ) : pet.error || family.error || assignments.error ? (
          <InlineError
            error={pet.error ?? family.error ?? assignments.error}
            onRetry={() => {
              void pet.refetch();
              void family.refetch();
              void assignments.refetch();
            }}
          />
        ) : (
          <>
            <Card>
              {(family.data?.members ?? []).map((member) => {
                const isAssigned = assigned.has(member.user_id);
                const isOwner = member.role === "owner";
                return (
                  <div className="member-row" key={member.user_id}>
                    <span className="avatar-dot">
                      {member.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{member.display_name}</strong>
                      <small>{member.email ?? member.role}</small>
                    </div>
                    <span className="role-pill">
                      {isAssigned ? "Assigned" : "Available"}
                    </span>
                    {isOwner ? (
                      <small className="muted-copy">Owner</small>
                    ) : (
                      <button
                        className="button ghost"
                        disabled={busyUser === member.user_id}
                        onClick={() =>
                          isAssigned
                            ? setRemoveUser(member)
                            : void setAssignment(member.user_id, true)
                        }
                      >
                        {busyUser === member.user_id
                          ? "Saving…"
                          : isAssigned
                            ? "Remove"
                            : "Assign"}
                      </button>
                    )}
                  </div>
                );
              })}
            </Card>
            {error && <p className="form-error">{error}</p>}
          </>
        )}
        {removeUser && (
          <ConfirmDialog
            title={`Remove ${removeUser.display_name}?`}
            consequence="They will no longer be assigned to this care plan."
            confirmLabel="Remove assignment"
            onCancel={() => setRemoveUser(null)}
            onConfirm={() => setAssignment(removeUser.user_id, false)}
          />
        )}
      </Page>
    </div>
  );
}

export function PetTransferPage() {
  const { petId = "" } = useParams();
  const navigate = useNavigate();
  const pet = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => api.get<{ pet: Pet }>(`/pets/${petId}`),
    enabled: Boolean(petId),
  });
  const families = useFamilies();
  const [familyId, setFamilyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (pet.isLoading || families.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (pet.error || families.error || !pet.data)
    return (
      <Page>
        <InlineError
          error={pet.error ?? families.error ?? new Error("Pet not found")}
        />
      </Page>
    );
  const current = new Set(pet.data.pet.family_ids);
  const options = (families.data?.families ?? []).filter(
    (family) => !current.has(family.id),
  );
  async function transfer() {
    if (!familyId) {
      setError("Choose a destination Family.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/pets/${petId}/transfer`,
        { to_family_id: familyId },
        { idempotencyKey: createCommandId() },
      );
      navigate(`/pets/${petId}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="detail-view">
      <BackHeader title="Transfer ownership" />
      <Page>
        <PageTitle
          eyebrow="PET GOVERNANCE"
          title={`Move ${pet.data.pet.name}`}
          description="The destination Family owner must accept before ownership changes."
        />
        <Card>
          <label className="form-field">
            <span>Destination Family</span>
            <select
              value={familyId}
              onChange={(event) => setFamilyId(event.target.value)}
            >
              <option value="">Choose a Family…</option>
              {options.map((family) => (
                <option value={family.id} key={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </label>
          {options.length === 0 && (
            <p className="muted-copy">
              Create or join another Family before transferring.
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <BusyButton
            className="button primary"
            busy={busy}
            disabled={!familyId}
            onClick={() => void transfer()}
          >
            Send transfer request
          </BusyButton>
        </Card>
      </Page>
    </div>
  );
}

export function FamilyTransfersPage() {
  const { familyId = "" } = useParams();
  const [direction, setDirection] = useState<"incoming" | "outgoing">(
    "incoming",
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["family-transfers", familyId, direction],
    queryFn: () =>
      api.get<{ transfers: Transfer[] }>(
        `/families/${familyId}/transfers?direction=${direction}`,
      ),
    enabled: Boolean(familyId),
  });
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [transferToCancel, setTransferToCancel] = useState<Transfer | null>(
    null,
  );
  async function act(
    transfer: Transfer,
    action: "accept" | "decline" | "cancel",
  ) {
    setError("");
    try {
      if (action === "cancel")
        await api.delete(`/transfers/${transfer.id}`, undefined, {
          idempotencyKey: createCommandId(),
        });
      else
        await api.post(`/transfers/${transfer.id}/${action}`, undefined, {
          idempotencyKey: createCommandId(),
        });
      await query.refetch();
      await client.invalidateQueries({ queryKey: ["families"] });
      await client.invalidateQueries({ queryKey: ["pets"] });
      await client.invalidateQueries({ queryKey: ["shares"] });
      setToast(`Transfer ${action}ed.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
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
  const transfers = query.data?.transfers ?? [];
  return (
    <div className="detail-view">
      <BackHeader title="Pet transfers" />
      <Page>
        <PageTitle
          eyebrow="PET GOVERNANCE"
          title="Transfer requests"
          description="Ownership changes only after the destination owner accepts."
        />
        <div className="segmented">
          <button
            className={direction === "incoming" ? "selected" : ""}
            onClick={() => setDirection("incoming")}
          >
            Incoming
          </button>
          <button
            className={direction === "outgoing" ? "selected" : ""}
            onClick={() => setDirection("outgoing")}
          >
            Outgoing
          </button>
        </div>
        {transfers.length === 0 ? (
          <EmptyState
            title="No transfer requests"
            description="Pending requests for this Family will appear here."
          />
        ) : (
          <div className="stack">
            {transfers.map((transfer) => (
              <Card key={transfer.id}>
                <div className="row-between">
                  <div>
                    <strong>{transfer.pet_name || transfer.pet_id}</strong>
                    <small>
                      {transfer.status} ·{" "}
                      {new Date(transfer.created_at).toLocaleString()}
                    </small>
                  </div>
                  {transfer.status === "pending" &&
                    (direction === "incoming" ? (
                      <div className="row-actions">
                        <button
                          className="button primary"
                          onClick={() => void act(transfer, "accept")}
                        >
                          Accept
                        </button>
                        <button
                          className="button ghost"
                          onClick={() => void act(transfer, "decline")}
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <button
                        className="button ghost"
                        onClick={() => setTransferToCancel(transfer)}
                      >
                        Cancel
                      </button>
                    ))}
                </div>
              </Card>
            ))}
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        {transferToCancel && (
          <ConfirmDialog
            title={`Cancel transfer for ${transferToCancel.pet_name || "this pet"}?`}
            consequence="The destination Family will no longer be able to accept this request."
            confirmLabel="Cancel transfer"
            onCancel={() => setTransferToCancel(null)}
            onConfirm={async () => {
              await act(transferToCancel, "cancel");
              setTransferToCancel(null);
            }}
          />
        )}
        {toast && <Toast message={toast} onClose={() => setToast("")} />}
      </Page>
    </div>
  );
}
export function MedicationForm({
  petId,
  initial,
  onClose,
  onSaved,
}: {
  petId: string;
  initial?: Medication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dose, setDose] = useState(initial?.dose ?? "");
  const [schedule, setSchedule] = useState(initial?.schedule ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function save() {
    setBusy(true);
    try {
      if (initial)
        await api.patch(`/medications/${initial.id}`, {
          name,
          dose,
          schedule,
          note,
        }, { idempotencyKey: commandId.current });
      else
        await api.post(
          `/pets/${petId}/medications`,
          { name, dose, schedule, note },
          { idempotencyKey: commandId.current },
        );
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
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
        <span className="eyebrow">MEDICATION</span>
        <h2>{initial ? `Edit ${initial.name}` : "Add medication"}</h2>
        <label className="form-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>Dose</span>
          <input
            value={dose}
            onChange={(event) => setDose(event.target.value)}
            placeholder="1 tablet"
          />
        </label>
        <label className="form-field">
          <span>Schedule</span>
          <input
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
            placeholder="With breakfast"
          />
        </label>
        <label className="form-field">
          <span>Note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
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
            {initial ? "Save changes" : "Add medication"}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function Sharing({ pet }: { pet: Pet }) {
  const query = useQuery({
    queryKey: queryKeys.shares(pet.id),
    queryFn: () => api.get<{ shares: Share[] }>(`/pets/${pet.id}/shares`),
  });
  const grants = useQuery({
    queryKey: ["access-grants", pet.id],
    queryFn: () =>
      api.get<{ grants: AccessGrant[] }>(`/pets/${pet.id}/access-grants`),
  });
  const [show, setShow] = useState(false);
  const [showGrant, setShowGrant] = useState(false);
  const [created, setCreated] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Share | null>(null);
  const [grantConfirm, setGrantConfirm] = useState<AccessGrant | null>(null);
  const invalidate = useInvalidate();
  if (query.isLoading) return <PageSkeleton />;
  if (query.error)
    return (
      <InlineError error={query.error} onRetry={() => void query.refetch()} />
    );
  async function revoke() {
    if (!confirm) return;
    try {
      await api.delete(`/shares/${confirm.id}`, undefined, { idempotencyKey: createCommandId() });
      setConfirm(null);
      invalidate();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function revokeGrant() {
    if (!grantConfirm) return;
    try {
      await api.delete(`/pets/${pet.id}/access-grants/${grantConfirm.id}`, undefined, { idempotencyKey: createCommandId() });
      setGrantConfirm(null);
      void grants.refetch();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <section className="subpage">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PRIVATE LINKS</span>
          <h2>Share carefully</h2>
        </div>
        {!pet.archived_at && (
          <button className="button primary" onClick={() => setShow(true)}>
            <Plus size={16} /> Create share
          </button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {created && (
        <Card className="success">
          <Check size={18} />
          <div>
            <strong>Copy this link now</strong>
            <p>The token is only returned once.</p>
            <button
              className="copy-link"
              onClick={() => void navigator.clipboard?.writeText(created)}
            >
              {created}
              <Copy size={15} />
            </button>
          </div>
        </Card>
      )}
      {(query.data?.shares ?? []).length === 0 ? (
        <EmptyState
          title="No active shares"
          description="Create a temporary, read-only care card or summary for a trusted person."
        />
      ) : (
        <div className="stack">
          {(query.data?.shares ?? []).map((share) => (
            <Card key={share.id}>
              <div className="row-between">
                <div>
                  <span className="eyebrow">{share.kind}</span>
                  <h3>Private share</h3>
                  <p>
                    Expires {new Date(share.expires_at).toLocaleString()} ·{" "}
                    {share.view_count} views
                  </p>
                </div>
                <button
                  className="icon-button subtle"
                  onClick={() => setConfirm(share)}
                  aria-label="Revoke share"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {show && (
        <ShareForm
          petId={pet.id}
          onClose={() => setShow(false)}
          onSaved={(token) => {
            setCreated(`${location.origin}/share/${token}`);
            setShow(false);
            invalidate();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Revoke this share?"
          consequence="Anyone using the link will lose read-only access immediately."
          confirmLabel="Revoke share"
          onCancel={() => setConfirm(null)}
          onConfirm={revoke}
        />
      )}
      <Card>
        <div className="section-heading">
          <div>
            <span className="eyebrow">DIRECT ACCESS</span>
            <h2>Delegated caregivers</h2>
          </div>
          {!pet.archived_at && (
            <button className="button ghost" onClick={() => setShowGrant(true)}>
              <UserPlus size={15} /> Grant
            </button>
          )}
        </div>
        {grants.error ? (
          <InlineError
            error={grants.error}
            onRetry={() => void grants.refetch()}
          />
        ) : (grants.data?.grants ?? []).length === 0 ? (
          <p className="muted-copy">
            No direct access grants. Family links remain separate.
          </p>
        ) : (
          (grants.data?.grants ?? []).map((grant) => (
            <div className="member-row" key={grant.id}>
              <span className="avatar-dot">
                <Users size={14} />
              </span>
              <div>
                <strong>{grant.user_id}</strong>
                <small>
                  {grant.expires_at
                    ? `Expires ${grant.expires_at}`
                    : "No expiry"}
                </small>
              </div>
              <span className="role-pill">{grant.role}</span>
              <button
                className="icon-button subtle"
                onClick={() => setGrantConfirm(grant)}
                aria-label="Revoke access"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </Card>
      {showGrant && (
        <GrantForm
          petId={pet.id}
          onClose={() => setShowGrant(false)}
          onSaved={() => {
            setShowGrant(false);
            void grants.refetch();
          }}
        />
      )}
      {grantConfirm && (
        <ConfirmDialog
          title={`Revoke access for ${grantConfirm.user_id}?`}
          consequence="This person immediately loses direct access to the Pet."
          confirmLabel="Revoke access"
          onCancel={() => setGrantConfirm(null)}
          onConfirm={revokeGrant}
        />
      )}
    </section>
  );
}

export function GrantForm({
  petId,
  onClose,
  onSaved,
}: {
  petId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("viewer");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    try {
      await api.post(`/pets/${petId}/access-grants`, {
        user_id: userId.trim(),
        role,
        expires_at: expires ? new Date(expires).toISOString() : "",
      });
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
        <span className="eyebrow">DIRECT ACCESS</span>
        <h2>Grant Pet access</h2>
        <p>The API accepts a user ID, not an email address.</p>
        <label className="form-field">
          <span>User ID</span>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            autoFocus
          />
        </label>
        <label className="form-field">
          <span>Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
            <option value="read_only">Read only</option>
          </select>
        </label>
        <label className="form-field">
          <span>Expiry (optional)</span>
          <input
            type="datetime-local"
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            Grant access
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
export function ShareForm({
  petId,
  onClose,
  onSaved,
}: {
  petId: string;
  onClose: () => void;
  onSaved: (token: string) => void;
}) {
  const [kind, setKind] = useState("care_card");
  const [ttl, setTtl] = useState("24");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function save() {
    setBusy(true);
    try {
      const result = await api.post<{ token: string }>(
        `/pets/${petId}/shares`,
        { kind, ttl_hours: Number(ttl), options: {} },
        { idempotencyKey: commandId.current },
      );
      onSaved(result.token);
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
        <span className="eyebrow">TEMPORARY ACCESS</span>
        <h2>Create private share</h2>
        <label className="form-field">
          <span>View</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="care_card">Care card</option>
            <option value="summary">Health summary</option>
          </select>
        </label>
        <label className="form-field">
          <span>Expires in</span>
          <select value={ttl} onChange={(event) => setTtl(event.target.value)}>
            <option value="1">1 hour</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            Create link
          </BusyButton>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

export function FamiliesPage() {
  const families = useFamilies();
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [toast, setToast] = useState("");
  const invalidate = useInvalidate();
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
  if (!families.data?.families.length)
    return (
      <Page className="families-page">
        <PageTitle
          eyebrow="SHARED HOMES"
          title="Bring everyone into one care space."
          description="A Family connects the people, pets and routines that belong together. You can belong to more than one."
        />
        <section className="family-onboarding">
          <div className="family-onboarding-art">
            <span className="eyebrow">WHY FAMILY COMES FIRST</span>
            <p>Care stays reliable when every person sees the same plan, knows who acted, and can hand off without another group chat.</p>
          </div>
          <div className="family-onboarding-actions">
            <Link to="/families/new">
              <span className="family-icon"><Home size={21} /></span>
              <span><strong>Start a new Family</strong><small>You’ll be the owner. Add pets and invite people next.</small></span>
              <ChevronRight size={19} />
            </Link>
            <Link to="/families/join">
              <span className="family-icon coral"><Users size={21} /></span>
              <span><strong>Join with an invite code</strong><small>Connect to a Family someone already created.</small></span>
              <ChevronRight size={19} />
            </Link>
            <div className="privacy-note"><ShieldCheck size={17} /><span><strong>Your records stay private.</strong><small>Access follows each Family role and can be removed by an owner.</small></span></div>
          </div>
        </section>
      </Page>
    );
  return (
    <Page>
      <PageTitle
        eyebrow="EVERY HOME, ONE VIEW"
        title="Your families"
        description="Switch homes without losing the full picture of each pet."
        action={
          <button className="button primary" onClick={() => setMode("create")}>
            <Plus size={16} /> New family
          </button>
        }
      />
      <div className="family-actions">
        <button onClick={() => setMode("create")}>
          <Home size={20} />
          <strong>Create a family</strong>
          <small>Start a new shared home</small>
        </button>
        <button onClick={() => setMode("join")}>
          <Users size={20} />
          <strong>Join with a code</strong>
          <small>Connect to an existing home</small>
        </button>
      </div>
      <div className="stack">
        {(families.data?.families ?? []).map((family) => (
          <FamilyCard family={family} key={family.id} />
        ))}
      </div>
      <button
        className="text-button"
        onClick={() => setDeleted((value) => !value)}
      >
        {deleted ? "Hide deleted families" : "View deleted families"}
      </button>
      {deleted && (
        <DeletedFamilies
          onRestored={() => {
            setToast("Family restored.");
            invalidate();
          }}
        />
      )}
      {mode && (
        <FamilyForm
          mode={mode}
          onClose={() => setMode(null)}
          onSaved={(message) => {
            setMode(null);
            setToast(message);
            invalidate();
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Page>
  );
}

export function FamilyCard({ family }: { family: Family }) {
  const detail = useQuery({
    queryKey: queryKeys.family(family.id),
    queryFn: () =>
      api.get<{ family: Family; members: Member[] }>(`/families/${family.id}`),
  });
  const pets = useQuery({
    queryKey: ["family-pets", family.id],
    queryFn: () => api.get<{ pets: Pet[] }>(`/families/${family.id}/pets`),
  });
  return (
    <Link className="family-card" to={`/families/${family.id}`}>
      <span className="family-icon">
        <Home size={22} />
      </span>
      <div>
        <span className="role-pill">{family.role}</span>
        <h2>{family.name}</h2>
        <p>{family.timezone}</p>
        <small>
          {detail.isLoading || pets.isLoading
            ? "Loading counts…"
            : detail.error || pets.error
              ? "Counts unavailable"
              : `${detail.data?.members.length ?? 0} members · ${pets.data?.pets.length ?? 0} pets`}
        </small>
      </div>
      <ChevronRight size={19} />
    </Link>
  );
}
export function FamilyForm({
  mode,
  onClose,
  onSaved,
}: {
  mode: "create" | "join";
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function previewInvite() {
    setBusy(true);
    try {
      setPreview(
        await api.get<Record<string, unknown>>(
          `/invite/${encodeURIComponent(code.trim())}`,
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      if (mode === "create") {
        const result = await api.post<{ family: Family; invite_code: string }>(
          "/families",
          { name: name.trim(), timezone },
          { idempotencyKey: commandId.current },
        );
        onSaved(`Family created. Invite code: ${result.invite_code}`);
        navigate(`/families/${result.family.id}`);
      } else {
        const result = await api.post<{ family: Family }>(
          "/families/join",
          { code: code.trim() },
          { idempotencyKey: commandId.current },
        );
        onSaved(`Joined ${result.family.name}.`);
        navigate(`/families/${result.family.id}`);
      }
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
          {mode === "create" ? "A NEW SHARED HOME" : "YOU’RE INVITED"}
        </span>
        <h2>{mode === "create" ? "Create a family" : "Join a family"}</h2>
        {mode === "create" ? (
          <>
            <label className="form-field">
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <label className="form-field">
              <span>IANA timezone</span>
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="form-field">
              <span>Invitation code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABCD-1234"
                autoFocus
              />
            </label>
            {preview && (
              <Card className="preview">
                <strong>
                  {String(
                    preview.name ?? preview.family_name ?? "Family invitation",
                  )}
                </strong>
                <p>Review the destination above, then join.</p>
              </Card>
            )}
            <button
              className="button ghost full"
              disabled={!code.trim() || busy}
              onClick={() => void previewInvite()}
            >
              Preview invitation
            </button>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {mode === "create" ? "Create family" : "Join family"}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
export function DeletedFamilies({ onRestored }: { onRestored: () => void }) {
  const query = useQuery({
    queryKey: queryKeys.deletedFamilies(),
    queryFn: () =>
      api.get<{
        families: Array<{ id: string; name: string; deleted_at: string }>;
      }>("/families/deleted"),
  });
  const [error, setError] = useState("");
  if (query.isLoading) return <PageSkeleton />;
  return (
    <div className="stack compact">
      {(query.data?.families ?? []).map((family) => (
        <Card key={family.id}>
          <div className="row-between">
            <div>
              <strong>{family.name}</strong>
              <small>
                Deleted {new Date(family.deleted_at).toLocaleDateString()}
              </small>
            </div>
            <button
              className="button ghost"
              onClick={async () => {
                setError("");
                try {
                  await api.post(`/families/${family.id}/restore`, undefined, { idempotencyKey: createCommandId() });
                  onRestored();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Restore
            </button>
          </div>
        </Card>
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export function FamilyPage() {
  const { familyId = "" } = useParams();
  const query = useQuery({
    queryKey: queryKeys.family(familyId),
    queryFn: () =>
      api.get<{ family: Family; members: Member[] }>(`/families/${familyId}`),
    enabled: Boolean(familyId),
  });
  const pets = useQuery({
    queryKey: ["family-pets", familyId],
    queryFn: () => api.get<{ pets: Pet[] }>(`/families/${familyId}/pets`),
    enabled: Boolean(familyId),
  });
  const [edit, setEdit] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | Member | null>(
    null,
  );
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  if (query.isLoading || pets.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (query.error || !query.data)
    return (
      <Page>
        <InlineError error={query.error ?? new Error("Family not found")} />
      </Page>
    );
  const { family, members } = query.data;
  const isOwner = family.role === "owner";
  async function destructive() {
    if (confirm === "delete") {
      await api.delete(`/families/${family.id}`, { confirm: family.name });
      navigate("/families");
    } else if (confirm === "leave") {
      await api.post(`/families/${family.id}/leave`);
      navigate("/families");
    } else if (confirm && typeof confirm === "object") {
      await api.delete(`/families/${family.id}/members/${confirm.user_id}`);
      await query.refetch();
    }
    setConfirm(null);
    invalidate();
  }
  async function refreshInvite() {
    setError("");
    try {
      const result = await api.post<{ invite_code: string }>(
        `/families/${family.id}/invite/refresh`,
        undefined,
        { idempotencyKey: createCommandId() },
      );
      setInvite(result.invite_code);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="detail-view">
      <BackHeader
        title={family.name}
        action={
          isOwner && (
            <button
              className="button ghost"
              onClick={() => void refreshInvite()}
            >
              Refresh invite
            </button>
          )
        }
      />
      <Page>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Card className="family-hero-card">
          <span className="family-icon large">
            <Home size={27} />
          </span>
          <span className="role-pill">{family.role}</span>
          <h1>{family.name}</h1>
          <p>{family.timezone}</p>
          <div className="metrics">
            <span>
              <strong>{members.length}</strong> people
            </span>
            <span>
              <strong>{pets.data?.pets.length ?? 0}</strong> pets
            </span>
          </div>
        </Card>
        {invite && (
          <Card className="invite-card">
            <span className="eyebrow">INVITE CODE</span>
            <strong>{invite}</strong>
            <button
              className="copy-link"
              onClick={() => void navigator.clipboard?.writeText(invite)}
            >
              <Copy size={15} /> Copy
            </button>
          </Card>
        )}
        <section className="management-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MEMBERS · {members.length}</span>
              <h2>People who care</h2>
            </div>
            {isOwner && (
              <button
                className="button ghost"
                onClick={() => void refreshInvite()}
              >
                <UserPlus size={15} /> Invite
              </button>
            )}
          </div>
          <Card className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.user_id}>
                <span className="avatar-dot">
                  {member.display_name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{member.display_name}</strong>
                  <small>{member.email ?? member.role}</small>
                </div>
                <span className="role-pill">{member.role}</span>
                {isOwner && member.role !== "owner" && (
                  <button
                    className="icon-button subtle"
                    onClick={() => setConfirm(member)}
                    aria-label={`Remove ${member.display_name}`}
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            ))}
          </Card>
        </section>
        <section className="management-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PETS</span>
              <h2>Shared profiles</h2>
            </div>
            <Link className="button ghost" to="/pets">
              Manage pets
            </Link>
          </div>
          <div className="mini-grid">
            {(pets.data?.pets ?? []).map((pet) => (
              <Link className="mini-pet" to={`/pets/${pet.id}`} key={pet.id}>
                <PawPrint size={17} />
                <strong>{pet.name}</strong>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </section>
        <section className="management-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FAMILY SETTINGS</span>
              <h2>Governance</h2>
            </div>
            {isOwner && (
              <div className="row-actions">
                <button className="text-button" onClick={() => setEdit(true)}>
                  Edit
                </button>
                <button
                  className="text-button"
                  onClick={() => setTransferOpen(true)}
                >
                  Transfer owner
                </button>
              </div>
            )}
          </div>
          <Card>
            <div className="data-list">
              <div>
                <dt>Timezone</dt>
                <dd>{family.timezone}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{family.role}</dd>
              </div>
            </div>
          </Card>
          <Link
            className="button ghost full"
            to={`/families/${family.id}/transfers`}
          >
            Review pet transfer requests
          </Link>
        </section>
        <button
          className="danger-link"
          onClick={() => setConfirm(isOwner ? "delete" : "leave")}
        >
          <Trash2 size={16} /> {isOwner ? "Delete family" : "Leave family"}
        </button>
        {edit && (
          <FamilyEdit
            family={family}
            onClose={() => setEdit(false)}
            onSaved={() => {
              setEdit(false);
              void query.refetch();
            }}
          />
        )}
        {transferOpen && (
          <TransferOwner
            familyId={family.id}
            members={members.filter((member) => member.role !== "owner")}
            onClose={() => setTransferOpen(false)}
            onSaved={() => {
              setTransferOpen(false);
              void query.refetch();
              invalidate();
            }}
          />
        )}
        {confirm && (
          <ConfirmDialog
            title={
              confirm === "delete"
                ? `Delete ${family.name}?`
                : confirm === "leave"
                  ? `Leave ${family.name}?`
                  : `Remove ${confirm.display_name}?`
            }
            consequence={
              confirm === "delete"
                ? "Family membership ends and linked pets remain protected."
                : "Access ends immediately. Existing history is unchanged."
            }
            confirmLabel={
              confirm === "delete"
                ? "Delete family"
                : confirm === "leave"
                  ? "Leave family"
                  : "Remove member"
            }
            requireText={confirm === "delete" ? family.name : undefined}
            onCancel={() => setConfirm(null)}
            onConfirm={destructive}
          />
        )}
      </Page>
    </div>
  );
}
export function FamilyEdit({
  family,
  onClose,
  onSaved,
}: {
  family: Family;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(family.name);
  const [timezone, setTimezone] = useState(family.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function save() {
    setError("");
    setBusy(true);
    try {
      await api.patch(
        `/families/${family.id}`,
        { name, timezone },
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
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="eyebrow">FAMILY SETTINGS</span>
        <h2>Edit family</h2>
        <label className="form-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label className="form-field">
          <span>IANA timezone</span>
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </label>
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

export function TransferOwner({
  familyId,
  members,
  onClose,
  onSaved,
}: {
  familyId: string;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(members[0]?.user_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function transfer() {
    if (!userId) {
      setError("Choose a family member.");
      return;
    }
    setBusy(true);
    try {
      await api.post(
        `/families/${familyId}/transfer`,
        { to_user_id: userId },
        { idempotencyKey: createCommandId() },
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
      <section className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="eyebrow">FAMILY GOVERNANCE</span>
        <h2>Transfer ownership</h2>
        <p>
          You will become a caregiver after the server confirms this change.
        </p>
        <label className="form-field">
          <span>New owner</span>
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <BusyButton className="button primary" busy={busy} onClick={transfer}>
            Transfer ownership
          </BusyButton>
        </div>
      </section>
    </div>
  );
}
