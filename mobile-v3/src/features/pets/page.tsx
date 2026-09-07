import * as React from "react";
/* eslint-disable react-refresh/only-export-components -- pet helpers stay private to this feature module. */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/api/client";
import { useT, tt } from "../../core/i18n";
import { createCommandId } from "../../core/api/idempotency";
import { errorMessage } from "../../core/api/errors";
import { EmptyState, InlineError, PageSkeleton, Toast, BusyButton, ConfirmDialog } from "../../core/ui";
import { queryClient } from "../../core/query/client";
import { queryKeys } from "../../core/query/keys";
import { ChevronRight, CircleAlert, ClipboardList, Download, Info, Pencil, Pill, Plus, Settings2, Trash2, Users, X } from "lucide-react";
import { MedicationForm, Sharing } from "../families/page";
import { HandoffCard, MedReminderDialog } from "../handoff/card";
import { WeightChart, type WeightPoint } from "../../ui/weight-chart";
import { MoreGroup, MoreRow } from "../../ui/more";
import { ageText, carePlanTypeLabel, ruleText, sexLabel, speciesLabel, weightKg } from "../../core/display";
import { PetAvatar, petAvatarBlob } from "../../ui/pet-avatar";
import { Card, CarePlan, Event, Family, Medication, Page, Pet, Profile, civilDateInTimezone, useFamilies, useInvalidate, usePets, invalidateAll, type TodayGroup } from "../../app/shared";

type CareTemplate = {
  key: string;
  title: string;
  type: string;
  rule: { type: "daily" | "weekly" | "monthly" | "interval"; time: string; days?: number[] };
};

/** 常见提醒模板：一键创建，默认时间都是常见值，创建后可改。 */
const CARE_TEMPLATES: CareTemplate[] = [
  { key: "feed-am", title: "喂早餐 08:00", type: "feeding", rule: { type: "daily", time: "08:00" } },
  { key: "feed-pm", title: "喂晚餐 18:30", type: "feeding", rule: { type: "daily", time: "18:30" } },
  { key: "walk", title: "遛狗 19:00", type: "exercise", rule: { type: "daily", time: "19:00" } },
  { key: "med", title: "给药 08:00", type: "medication", rule: { type: "daily", time: "08:00" } },
  { key: "weigh", title: "每周一体重", type: "health", rule: { type: "weekly", time: "09:00", days: [1] } },
];

/** 模板标题的展示层英文对照；创建计划时仍按原样写入（API 字段值不动）。 */
const CARE_TEMPLATE_TITLE_EN: Record<string, string> = {
  "feed-am": "Breakfast 08:00",
  "feed-pm": "Dinner 18:30",
  walk: "Walk 19:00",
  med: "Give medication 08:00",
  weigh: "Weekly weigh-in",
};

export function PetsPage() {
  const t = useT();
  const pets = usePets();
  const families = useFamilies();
  const todayQuery = useQuery({
    queryKey: ["today", "pets-overview"],
    queryFn: () => api.get<{ pets: TodayGroup[] }>("/today"),
  });
  const [showCreate, setShowCreate] = useState(false);
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
  const rows = pets.data?.pets ?? [];
  const activeRows = rows.filter((pet) => !pet.archived_at);
  const archivedCount = rows.length - activeRows.length;
  const pendingByPet = new Map(
    (todayQuery.data?.pets ?? []).map((group) => [
      group.pet_id,
      group.items.filter((item) => !item.log).length,
    ]),
  );
  return (
    <Page className="design-page design-pets-page">
      <section className="design-pets-heading">
        <div>
          <span className="eyebrow">{t("共同照护的成员", "Cared for together")}</span>
          <h1>{t("宠物", "Pets")}</h1>
          <p>{t(`${activeRows.length} 只活跃`, `${activeRows.length} active`)}{archivedCount ? t(` · ${archivedCount} 只归档`, ` · ${archivedCount} archived`) : ""}</p>
        </div>
        <button className="button primary pets-add-button" onClick={() => setShowCreate(true)}>
          <Plus size={17} /> {t("添加宠物", "Add Pet")}
        </button>
      </section>
      {rows.length === 0 ? (
        <EmptyState
          image="/backgrounds/empty-state.webp"
          title={families.data?.families.length ? t("还没有宠物", "No pets yet") : t("先创建一个家庭", "Create a family first")}
          description={
            families.data?.families.length
              ? t("在家庭里创建第一份宠物档案。", "Create your first pet profile in a family.")
              : t("宠物档案挂在家庭下，家人才能一起照顾它。", "Pet profiles live under a family so everyone can chip in.")
          }
          action={
            families.data?.families.length ? (
              <button
                className="button primary"
                onClick={() => setShowCreate(true)}
              >
                {t("创建宠物档案", "Create Pet Profile")}
              </button>
            ) : (
              <Link className="button primary" to="/families/new">
                {t("创建家庭", "Create Family")}
              </Link>
            )
          }
        />
      ) : (
        <div className="design-pet-list">
          {rows.map((pet) => {
            const pending = pendingByPet.get(pet.id) ?? 0;
            const age = ageText(pet.birth_date);
            return (
              <Link className={`design-pet-row ${pet.archived_at ? "is-archived" : ""}`} to={`/pets/${pet.id}`} key={pet.id}>
                <PetAvatar petId={pet.id} species={pet.species} size={64} />
                <span className="design-pet-copy">
                  <span className="design-pet-name-line">
                    <strong>{pet.name}</strong>
                    <em>{pet.archived_at ? t("已归档", "Archived") : pending > 0 ? t(`${pending} 项待完成`, `${pending} to do today`) : t("今天无待办", "Nothing due today")}</em>
                  </span>
                  <span>
                    {[
                      pet.breed || speciesLabel(pet.species),
                      [age, sexLabel(pet.sex)].filter(Boolean).join(" · "),
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("档案信息未填写", "No profile info yet")}
                  </span>
                </span>
                <ChevronRight size={22} />
              </Link>
            );
          })}
        </div>
      )}
      <button className="design-pets-fab" onClick={() => setShowCreate(true)} aria-label={t("添加宠物", "Add Pet")}><Plus size={30} /></button>
      <button className="text-button design-deleted-toggle" onClick={() => setDeleted((value) => !value)}>{deleted ? t("收起已删除的宠物", "Hide deleted pets") : t("查看已删除的宠物", "Show deleted pets")}</button>
      {deleted && <DeletedPets onRestored={() => { setToast(t("宠物已恢复。", "Pet restored.")); invalidateAll(queryClient); }} />}
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
  const t = useT();
  const query = useQuery({
    queryKey: ["deleted-pets"],
    queryFn: () => api.get<{ pets: Pet[] }>("/pets/deleted"),
  });
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState("");
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
              <small>{speciesLabel(pet.species)} · {t("已删除的档案", "Deleted profile")}</small>
            </span>
            <button
              className="button ghost"
              disabled={restoringId === pet.id}
              onClick={async () => {
                setError("");
                setRestoringId(pet.id);
                try {
                  await api.post(`/pets/${pet.id}/restore`, undefined, {
                    idempotencyKey: createCommandId(),
                  });
                  await query.refetch();
                  onRestored();
                } catch (reason) {
                  setError(errorMessage(reason));
                } finally {
                  setRestoringId("");
                }
              }}
            >
              {restoringId === pet.id ? t("恢复中…", "Restoring…") : t("恢复", "Restore")}
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
        <p className="muted-copy">{t("恢复列表里没有已删除的宠物。", "No deleted pets to restore.")}</p>
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
  const t = useT();
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
      setError(t("请选择家庭并填写名字。", "Choose a family and enter a name."));
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
      commandId.current = createCommandId();
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
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
      <span className="eyebrow">{t("新成员", "New Member")}</span>
      <h2>{t("添加宠物", "Add Pet")}</h2>
      <label className="form-field">
        <span>{t("家庭", "Family")}</span>
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
        <span>{t("名字", "Name")}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>
      <label className="form-field">
        <span>{t("物种", "Species")}</span>
        <select
          value={species}
          onChange={(event) => setSpecies(event.target.value)}
        >
          <option value="dog">{t("狗", "Dog")}</option>
          <option value="cat">{t("猫", "Cat")}</option>
          <option value="other">{t("其他", "Other")}</option>
        </select>
      </label>
      <label className="form-field">
        <span>{t("品种", "Breed")}</span>
        <input
          value={breed}
          onChange={(event) => setBreed(event.target.value)}
        />
      </label>
      <div className="form-grid">
        <label className="form-field">
          <span>{t("出生日期", "Birth Date")}</span>
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("性别", "Sex")}</span>
          <select
            value={sex}
            onChange={(event) => setSex(event.target.value)}
          >
            <option value="">{t("未设置", "Not set")}</option>
            <option value="female">{t("母", "Female")}</option>
            <option value="male">{t("公", "Male")}</option>
          </select>
        </label>
      </div>
      <label className="toggle-row">
        <span>
          <strong>{t("已绝育", "Neutered")}</strong>
          <small>{t("记录在医疗档案里。", "Saved to the medical profile.")}</small>
        </span>
        <input
          type="checkbox"
          checked={neutered}
          onChange={(event) => setNeutered(event.target.checked)}
        />
      </label>
      <label className="form-field">
        <span>{t("初始体重（克，选填）", "Initial weight in grams (optional)")}</span>
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
          {t("取消", "Cancel")}
        </button>
        <BusyButton className="button primary" busy={busy} onClick={save}>
          {t("创建档案", "Create Profile")}
        </BusyButton>
      </div>
      </section>
    </div>
  );
}

export function PetPage() {
  const t = useT();
  const { petId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const families = useFamilies();
  const petQuery = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => api.get<{ pet: Pet; profile: Profile }>(`/pets/${petId}`),
    enabled: Boolean(petId),
  });
  const carePlansQuery = useQuery({
    queryKey: queryKeys.carePlans(petId),
    queryFn: () => api.get<{ care_plans: CarePlan[] }>(`/pets/${petId}/care-plans`),
    enabled: Boolean(petId),
  });
  const medicationsQuery = useQuery({
    queryKey: queryKeys.medications(petId),
    queryFn: () => api.get<{ medications: Medication[] }>(`/pets/${petId}/medications`),
    enabled: Boolean(petId),
  });
  const todayQuery = useQuery({
    queryKey: ["design-pet-today", petId],
    queryFn: () => api.get<{ pets: TodayGroup[] }>(`/today?pet_id=${encodeURIComponent(petId)}`),
    enabled: Boolean(petId),
  });
  // 体重曲线的数据源：时间线里的体重事件（系统归档 → 分析呈现）
  const weightEventsQuery = useQuery({
    queryKey: ["weight-events", petId],
    queryFn: () => api.get<{ events: Event[] }>(`/pets/${petId}/timeline?limit=100`),
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
  // 编辑态完全由 URL 派生（/edit 后缀），不镜像成 state——曾经的双写
  // effect 是 set-state-in-effect 反模式的来源。
  const edit = location.pathname.endsWith("/edit");
  const [confirm, setConfirm] = useState<"delete" | "archive" | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);
  // 子页签横滚时激活项可能落在渐隐区：切页签即滚入视野。
  useEffect(() => {
    const active = tabsRef.current?.querySelector<HTMLButtonElement>("button.selected");
    active?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tab]);
  const invalidate = useInvalidate();
  const [toast, setToast] = useState("");
  const commandId = useRef(createCommandId());
  function closeEdit() {
    if (edit) navigate(`/pets/${petId}`);
  }
  if (petQuery.isLoading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  if (petQuery.error || !petQuery.data)
    return (
      <Page>
        <InlineError error={petQuery.error ?? new Error(t("这只宠物不存在或对你不可见", "This pet doesn't exist or isn't visible to you"))} />
      </Page>
    );
  const { pet, profile } = petQuery.data;
  const activePlans = (carePlansQuery.data?.care_plans ?? []).filter((plan) => plan.status === "active").length;
  const todayItems = (todayQuery.data?.pets ?? []).flatMap((group) => group.items);
  const tasksTodayDone = todayItems.filter(
    (item) => item.log !== null && item.log !== undefined,
  ).length;
  const tasksToday = todayItems.length;
  const activeMeds = (medicationsQuery.data?.medications ?? []).filter((med) => !med.ended_on).length;
  const heroBlob = petAvatarBlob(pet.id, pet.species);
  const update = async (payload: Record<string, unknown>) => {
    await api.patch(
      `/pets/${pet.id}/record`,
      { ...payload, version: pet.version },
      { idempotencyKey: commandId.current },
    );
    commandId.current = createCommandId();
    await petQuery.refetch();
    closeEdit();
    setToast(t("档案已保存。", "Profile saved."));
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
    setToast(pet.archived_at ? t("已恢复为活跃。", "Restored to active.") : t("已归档，历史保留。", "Archived. History preserved."));
  }
  return (
    <div className="detail-view design-pet-workspace">
      <Page className="design-page design-workspace-page">
        <section
          className="design-workspace-hero design-workspace-decor"
          style={{ background: `radial-gradient(120% 120% at 82% 8%, #ffffffe0 0%, ${heroBlob} 58%, #f2ead9 100%)` }}
        >
          <PetAvatar petId={pet.id} species={pet.species} size={148} className="design-workspace-mascot" decorative />
          <div className="design-workspace-title">
            <h1>{pet.name}</h1>
            <p>{[pet.breed || speciesLabel(pet.species), ageText(pet.birth_date)].filter(Boolean).join(" • ")}</p>
          </div>
          <Link className="design-workspace-settings" to={`/pets/${pet.id}/edit`} aria-label={t("编辑档案", "Edit profile")}><Settings2 size={20} /></Link>
        </section>
        <section className="design-workspace-stats">
          <div><strong>{tasksToday ? `${tasksTodayDone}/${tasksToday}` : "—"}</strong><span>{t("今日任务", "Today's Tasks")}</span></div>
          <i />
          <div><strong>{activePlans}</strong><span>{t("活跃计划", "Active Plans")}</span></div>
          <i />
          <div><strong>{activeMeds}</strong><span>{t("在用药物", "Active Meds")}</span></div>
        </section>
        <nav className="design-workspace-tabs" ref={tabsRef}>
          <button className={tab === "overview" ? "selected" : ""} onClick={() => navigate(`/pets/${pet.id}`)}>{t("档案", "Profile")}</button>
          <button className={tab === "care" ? "selected" : ""} onClick={() => navigate(`/pets/${pet.id}/care`)}>{t("照护计划", "Care Plan")}{activePlans > 0 && <i>{activePlans}</i>}</button>
          <button className={tab === "meds" ? "selected" : ""} onClick={() => navigate(`/pets/${pet.id}/medications`)}>{t("用药", "Medication")}{activeMeds > 0 && <i>{activeMeds}</i>}</button>
          <button className={tab === "sharing" ? "selected" : ""} onClick={() => navigate(`/pets/${pet.id}/sharing`)}>{t("分享与授权", "Sharing & Access")}</button>
        </nav>
        {pet.archived_at && (
          <Card className="notice">
            <CircleAlert size={19} />
            <div>
              <strong>{t("这只宠物现在是只读状态。", "This pet is read-only for now.")}</strong>
              <p>{t("恢复活跃后才能新增照护计划、用药或时间线记录。", "Restore to active to add new care plans, medications, or timeline records.")}</p>
            </div>
          </Card>
        )}
        {tab === "overview" && (
          <WeightTrendCard events={weightEventsQuery.data?.events ?? []} currentWeightG={pet.weight_g} />
        )}
        {tab === "overview" && (
          <DesignPetOverview
            pet={pet}
            profile={profile}
            medication={
              medicationsQuery.data?.medications?.find((med) => !med.ended_on) ??
              medicationsQuery.data?.medications?.[0]
            }
            onEdit={() => {
              if (!edit) navigate(`/pets/${pet.id}/edit`);
            }}
            onArchive={() => setConfirm("archive")}
            onDelete={() => setConfirm("delete")}
          />
        )}
        {tab === "care" && (
          <>
            <HandoffCard pet={pet} />
            <CarePlans
              pet={pet}
              timezone={families.data?.families.find((family) => (pet.family_ids ?? []).includes(family.id))?.timezone}
              initialShow={location.pathname.endsWith("/care/new")}
            />
          </>
        )}
        {tab === "meds" && <Medications pet={pet} />}
        {tab === "sharing" && (
          <>
            <PetFamilyLinks pet={pet} />
            <Sharing pet={pet} />
          </>
        )}
        {edit && (
          <PetEdit
            pet={pet}
            profile={profile}
            onClose={closeEdit}
            onSave={update}
          />
        )}
        {confirm === "archive" && (
          <ConfirmDialog
            title={
              pet.archived_at
                ? t(`恢复 ${pet.name}？`, `Restore ${pet.name}?`)
                : t(`归档 ${pet.name}？`, `Archive ${pet.name}?`)
            }
            consequence={
              pet.archived_at
                ? t("档案和写入操作会重新变为活跃。", "The profile and write actions become active again.")
                : t("档案变为只读，历史全部保留，只是不能再添加新的照护执行。", "The profile becomes read-only. All history is kept — you just can't add new care activity.")
            }
            confirmLabel={pet.archived_at ? t("恢复活跃", "Restore") : t("归档", "Archive")}
            onCancel={() => setConfirm(null)}
            onConfirm={archive}
          />
        )}
        {confirm === "delete" && (
          <ConfirmDialog
            title={t(`删除 ${pet.name} 的档案？`, `Delete ${pet.name}'s profile?`)}
            consequence={t("档案会离开活跃视图；历史由服务端在保护期内保留，可在此期间恢复。", "The profile leaves the active view. History is kept server-side during the protection window and can be restored until it ends.")}
            confirmLabel={t("删除宠物档案", "Delete Pet Profile")}
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

function DesignPetOverview({
  pet,
  profile,
  onEdit,
  medication,
  onArchive,
  onDelete,
}: {
  pet: Pet;
  profile: Profile;
  onEdit: () => void;
  medication?: Medication;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <div className="design-workspace-content">
      <section className="design-info-card">
        <div className="design-card-heading"><h2><span><Info size={18} /></span> {t("基本信息", "Basics")}</h2><button onClick={onEdit} aria-label={t("编辑档案", "Edit profile")}><Pencil size={16} /></button></div>
        <dl>
          <div><dt>{t("物种", "Species")}</dt><dd>{speciesLabel(pet.species)}</dd></div>
          <div><dt>{t("性别", "Sex")}</dt><dd>{sexLabel(pet.sex)}</dd></div>
          <div><dt>{t("生日", "Birthday")}</dt><dd>{pet.birth_date || t("未设置", "Not set")}</dd></div>
          <div><dt>{t("体重", "Weight")}</dt><dd>{weightKg(pet.weight_g) || t("去时间线记一次体重", "Log a weight on the timeline")}</dd></div>
        </dl>
      </section>
      <section className="design-info-card">
        <div className="design-card-heading"><h2><span><Pill size={18} /></span> {t("用药档案", "Medications")}</h2><Link to={`/pets/${pet.id}/medications`} aria-label={t("添加用药", "Add medication")}><Plus size={18} /></Link></div>
        {medication ? (
          <div className="design-medication-row">
            <span>◯</span>
            <div>
              <strong>{medication.name}</strong>
              <p>{[medication.dose, medication.schedule].filter(Boolean).join(" · ")}</p>
            </div>
            <em>{medication.ended_on ? t(`已停用 ${medication.ended_on}`, `Stopped ${medication.ended_on}`) : t("进行中", "Ongoing")}</em>
          </div>
        ) : (
          <p className="muted-copy">{t("暂无在档药物。添加后自动进入时间线。", "No medications on file yet. New ones appear on the timeline automatically.")}</p>
        )}
      </section>
      <section className="design-info-card">
        <div className="design-card-heading"><h2><span><ClipboardList size={18} /></span> {t("健康档案", "Health Profile")}</h2><button onClick={onEdit} aria-label={t("编辑备注", "Edit notes")}><Pencil size={16} /></button></div>
        <ProfileSummary profile={profile} />
      </section>
      <MoreGroup label={t("数据", "Data")}>
        <MoreRow
          icon={<Download size={19} />}
          title={t("导出数据", "Export Data")}
          sub={t("下载这只宠物的完整 JSON 档案", "Download this pet's full JSON profile")}
          onClick={() => void exportPet(pet)}
        />
      </MoreGroup>
      <div className="more-danger">
        <button className="sign-out" onClick={onArchive}>
          {pet.archived_at ? t("恢复为活跃", "Restore to Active") : t("归档宠物", "Archive Pet")}
        </button>
        <button className="danger-link" onClick={onDelete}>
          <Trash2 size={16} /> {t("删除档案", "Delete Profile")}
        </button>
      </div>
    </div>
  );
}

async function exportPet(pet: Pet) {
  const data = await api.get<unknown>(`/pets/${pet.id}/export`);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${pet.name}-planet-export.json`;
  link.click();
  URL.revokeObjectURL(href);
}

function ProfileSummary({ profile }: { profile: Profile }) {
  const t = useT();
  const allergies = profileLines(profile.allergies, "name");
  const conditions = profileLines(profile.conditions, "name");
  const extra = [
    allergies ? t(`过敏：${allergies.replaceAll("\n", "、")}`, `Allergies: ${allergies.replaceAll("\n", ", ")}`) : "",
    conditions ? t(`疾病：${conditions.replaceAll("\n", "、")}`, `Conditions: ${conditions.replaceAll("\n", ", ")}`) : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!extra && !profile.notes)
    return (
      <p className="design-notes">{t("还没有备注。写一点能帮大家把它照顾得更好。", "No notes yet. A few notes help everyone take better care of them.")}</p>
    );
  return (
    <p className="design-notes">
      {[extra, profile.notes].filter(Boolean).join("\n")}
    </p>
  );
}

export function PetFamilyLinks({ pet }: { pet: Pet }) {
  const t = useT();
  const families = useFamilies();
  const [familyId, setFamilyId] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const invalidate = useInvalidate();
  const linkedIds = pet.family_ids ?? [];
  const available = (families.data?.families ?? []).filter(
    (family) => !linkedIds.includes(family.id),
  );
  async function share() {
    if (!familyId) return;
    try {
      await api.post(`/pets/${pet.id}/families`, { family_id: familyId });
      setToast(t("已链接到该家庭。", "Linked to this family."));
      setFamilyId("");
      invalidate();
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  async function unshare() {
    if (!removeId) return;
    try {
      await api.delete(`/pets/${pet.id}/families/${removeId}`);
      setToast(t("已解除家庭链接。", "Family unlinked."));
      setRemoveId(null);
      invalidate();
    } catch (e) {
      setToast(errorMessage(e));
    }
  }
  return (
    <Card>
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("家庭可见", "Visible to families")}</span>
          <h2>{t(`${pet.name} 在哪些家被照顾`, `Where ${pet.name} is cared for`)}</h2>
        </div>
      </div>
      <div className="stack compact">
        {(families.data?.families ?? [])
          .filter((family) => linkedIds.includes(family.id))
          .map((family) => {
            const isPrimary = pet.primary_family_id === family.id;
            return (
              <div className="row-between" key={family.id}>
                <span>
                  <strong>{family.name}</strong>
                  {isPrimary && (
                    <span className="role-pill" style={{ marginLeft: 8 }}>
                      {t("主家庭", "Primary")}
                    </span>
                  )}
                  <small>{family.timezone}</small>
                </span>
                {linkedIds.length > 1 && (
                  <button
                    className="text-button"
                    onClick={() => setRemoveId(family.id)}
                  >
                    {t("解除链接", "Unlink")}
                  </button>
                )}
              </div>
            );
          })}
      </div>
      {!pet.archived_at && available.length > 0 && (
        <div className="form-inline">
          <select
            value={familyId}
            onChange={(event) => setFamilyId(event.target.value)}
          >
            <option value="">{t("链接到其他家庭…", "Link to another family…")}</option>
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
            {t("链接", "Link")}
          </button>
        </div>
      )}
      {removeId && (
        <ConfirmDialog
          title={t("解除这个家庭的链接？", "Unlink this family?")}
          consequence={
            removeId === pet.primary_family_id
              ? t("这是主家庭（照护时区跟随它）。解除后该家庭成员将失去查看权限，宠物历史不受影响。", "This is the primary family (care timezone follows it). Members will lose access to this pet. Pet history is unaffected.")
              : t("该家庭的成员将失去查看这只宠物的权限；宠物历史不受影响。", "Members of this family will lose access to this pet. Pet history is unaffected.")
          }
          confirmLabel={t("解除链接", "Unlink")}
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
  const t = useT();
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
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("宠物档案", "Pet Profile")}</span>
        <h2>{t(`编辑 ${pet.name}`, `Edit ${pet.name}`)}</h2>
        {[
          [t("名字", "Name"), name, setName],
          [t("物种", "Species"), species, setSpecies],
          [t("品种", "Breed"), breed, setBreed],
          [t("性别", "Sex"), sex, setSex],
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
          <span>{t("医疗备注", "Medical Notes")}</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("过敏（每行一条）", "Allergies (one per line)")}</span>
          <textarea
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("疾病（每行一条）", "Conditions (one per line)")}</span>
          <textarea
            value={conditions}
            onChange={(event) => setConditions(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("紧急联系人（姓名 | 电话，每行一条）", "Emergency contacts (name | phone, one per line)")}</span>
          <textarea
            value={emergencyContacts}
            onChange={(event) => setEmergencyContacts(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("用药决策人", "Medication decision maker")}</span>
          <input
            value={decisionMaker}
            onChange={(event) => setDecisionMaker(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="form-field">
            <span>{t("出生日期", "Birth Date")}</span>
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>{t("已绝育", "Neutered")}</strong>
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
            {t("取消", "Cancel")}
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
            {t("保存修改", "Save Changes")}
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
  const t = useT();
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
  const [busyTemplate, setBusyTemplate] = useState("");
  const [notice, setNotice] = useState("");
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
  async function quickCreate(template: CareTemplate) {
    setBusyTemplate(template.key);
    try {
      await api.post(
        `/pets/${pet.id}/care-plans`,
        {
          type: template.type,
          title: template.title,
          description: "",
          rule: {
            type: template.rule.type,
            interval: 1,
            days: template.rule.days ?? [],
            day: 1,
            time: template.rule.time,
            start_date: civilDateInTimezone(timezone),
            end_date: "",
          },
        },
        { idempotencyKey: createCommandId() },
      );
      invalidate();
    } catch (e) {
      // 一键失败不静默:提示并打开自定义表单兜底
      setBusyTemplate("");
      setShow(true);
      navigate(`/pets/${pet.id}/care/new`);
      throw e instanceof Error ? e : new Error(errorMessage(e));
    } finally {
      if (busyTemplate === template.key) setBusyTemplate("");
    }
  }
  return (
    <section className="subpage">
      {notice && <Toast message={notice} onClose={() => setNotice("")} />}
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("照护提醒", "Care Reminders")}</span>
          <h2>{t("到点提醒，谁做都算数", "On-time reminders — anyone's check-off counts")}</h2>
        </div>
        {!pet.archived_at && (
          <button className="button primary" onClick={() => { setShow(true); navigate(`/pets/${pet.id}/care/new`); }}>
            <Plus size={16} /> {t("自定义", "Custom")}
          </button>
        )}
      </div>
      {!pet.archived_at && (
        <div className="care-templates">
          <span className="care-templates-label">{t("一键创建提醒：", "One-tap reminders:")}</span>
          <div className="care-templates-row">
            {CARE_TEMPLATES.map((template) => (
              <button
                key={template.key}
                className="care-template-chip"
                disabled={busyTemplate === template.key}
                onClick={() =>
                  void quickCreate(template).catch((reason) =>
                    setNotice(t(`创建失败：${errorMessage(reason)}`, `Couldn't create: ${errorMessage(reason)}`)),
                  )
                }
              >
                {busyTemplate === template.key ? t("创建中…", "Creating…") : t(template.title, CARE_TEMPLATE_TITLE_EN[template.key] ?? template.title)}
              </button>
            ))}
          </div>
          <small className="care-templates-hint">{t("点一下就创建，时间都是常见默认值，创建后随时改。", "One tap creates it with a common default time — edit it anytime.")}</small>
        </div>
      )}
      {plans.length === 0 ? (
        <EmptyState
          title={t("还没有照护计划", "No care plans yet")}
          description={t("创建每天、每周、每月或间隔循环的照护事项，Today 会自动出现任务。", "Create daily, weekly, monthly, or interval care items — tasks then show up on Today automatically.")}
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
                  <span className="eyebrow">{carePlanTypeLabel(plan.type)}{plan.status === "archived" ? t(" · 已归档", " · Archived") : ""}</span>
                  <h3>{plan.title}</h3>
                  <p>{ruleText(plan.schedule, plan.time_of_day)}</p>
                </div>
                <div className="row-actions">
                  <Link
                    className="icon-button subtle"
                    to={`/pets/${pet.id}/care/${plan.id}/assignments`}
                    aria-label={t("管理负责人", "Manage assignees")}
                  >
                    <Users size={16} />
                  </Link>
                  <button
                    className="icon-button subtle"
                    onClick={() => setEditing(plan)}
                    aria-label={t("编辑计划", "Edit plan")}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button subtle"
                    onClick={() => setConfirm(plan)}
                    aria-label={t("删除计划", "Delete plan")}
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
            invalidate();
            // 第一份照护计划创建后，直接带用户去 Today 看到新任务（3 分钟闭环的最后一步）。
            if (plans.length === 0) navigate("/today");
            else if (initialShow) navigate(`/pets/${pet.id}/care`, { replace: true });
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t(`删除「${confirm.title}」？`, `Delete "${confirm.title}"?`)}
          consequence={t("未来的任务停止生成；已完成的历史仍保留在时间线里。", "Future tasks stop generating. Completed history stays on the timeline.")}
          confirmLabel={t("删除计划", "Delete Plan")}
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
  const t = useT();
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
    (rule !== "monthly" || (Number(day) >= 1 && Number(day) <= 31)) &&
    (!endDate || endDate >= startDate);
  async function save() {
    if (!valid) {
      setError(t("请检查规则字段：标题必填，周计划至少选一天，间隔至少 1 天。", "Check the rule fields: a title is required, weekly plans need at least one day, and the interval must be at least 1 day."));
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
      commandId.current = createCommandId();
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
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("照护计划", "Care Plan")}</span>
        <h2>{t("建立一个习惯", "Build a Habit")}</h2>
        <label className="form-field">
          <span>{t("标题", "Title")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("早上吃药", "Morning meds")}
          />
        </label>
        <div className="form-grid">
          <label className="form-field">
            <span>{t("类型", "Type")}</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="custom">{t("自定义", "Custom")}</option>
              <option value="feeding">{t("饮食", "Feeding")}</option>
              <option value="health">{t("健康", "Health")}</option>
              <option value="grooming">{t("清洁", "Grooming")}</option>
              <option value="exercise">{t("运动", "Exercise")}</option>
              <option value="medication">{t("用药", "Medication")}</option>
            </select>
          </label>
          <label className="form-field">
            <span>{t("重复规则", "Repeat Rule")}</span>
            <select
              value={rule}
              onChange={(event) => setRule(event.target.value as typeof rule)}
            >
              <option value="daily">{t("每天", "Daily")}</option>
              <option value="weekly">{t("每周", "Weekly")}</option>
              <option value="monthly">{t("每月", "Monthly")}</option>
              <option value="interval">{t("每隔 N 天", "Every N Days")}</option>
            </select>
          </label>
        </div>
        {rule === "weekly" && (
          <div className="weekday-row">
            {[t("一", "Mo"), t("二", "Tu"), t("三", "We"), t("四", "Th"), t("五", "Fr"), t("六", "Sa"), t("日", "Su")].map((label, index) => (
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
            <span>{t("每月几号（1–31）", "Day of month (1–31)")}</span>
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
            <span>{t("间隔天数（≥1）", "Interval in days (≥1)")}</span>
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
            <span>{t("时间（家庭时区解释，显示为当地时间）", "Time (interpreted in the family's timezone, shown as local time)")}</span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>{t("开始日期", "Start Date")}</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
        </div>
        <label className="form-field">
          <span>{t("结束日期(选填)", "End Date (optional)")}</span>
          <input
            type="date"
            min={startDate}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("说明", "Description")}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {t("创建计划", "Create Plan")}
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
  const t = useT();
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
        schedule: plan.schedule,
        time_of_day: time || null,
      }, { idempotencyKey: commandId.current });
      commandId.current = createCommandId();
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
        <button className="modal-close" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X size={18} />
        </button>
        <span className="eyebrow">{t("照护计划", "Care Plan")}</span>
        <h2>{t(`编辑「${plan.title}」`, `Edit "${plan.title}"`)}</h2>
        <label className="form-field">
          <span>{t("标题", "Title")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t(`时间（当前规则：${ruleText(plan.schedule, plan.time_of_day)}）`, `Time (current rule: ${ruleText(plan.schedule, plan.time_of_day)})`)}</span>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("说明", "Description")}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <BusyButton className="button primary" busy={busy} onClick={save}>
            {t("保存修改", "Save Changes")}
          </BusyButton>
        </div>
      </section>
    </div>
  );
}

export function Medications({ pet }: { pet: Pet }) {
  const t = useT();
  const query = useQuery({
    queryKey: queryKeys.medications(pet.id),
    queryFn: () =>
      api.get<{ medications: Medication[] }>(`/pets/${pet.id}/medications`),
  });
  const [editing, setEditing] = useState<Medication | null>(null);
  const [deleting, setDeleting] = useState<Medication | null>(null);
  const [confirmStopId, setConfirmStopId] = useState("");
  const [toastNotice, setToastNotice] = useState("");
  const [reminderMed, setReminderMed] = useState<Medication | null>(null);
  const invalidate = useInvalidate();
  const families = useFamilies();
  if (query.isLoading) return <PageSkeleton />;
  if (query.error)
    return (
      <InlineError error={query.error} onRetry={() => void query.refetch()} />
    );
  const meds = [...(query.data?.medications ?? [])].sort((a, b) =>
    (b.started_on || "").localeCompare(a.started_on || ""),
  );
  const timezone = families.data?.families.find((family) =>
    pet.family_ids.includes(family.id),
  )?.timezone;

  async function stop(med: Medication) {
    const commandId = createCommandId();
    try {
      await api.post(
        `/medications/${med.id}/stop`,
        { ended_on: civilDateInTimezone(timezone) },
        { idempotencyKey: commandId },
      );
      setConfirmStopId("");
      setToastNotice(t(`「${med.name}」已停用，用药史保留。`, `"${med.name}" stopped. Medication history is kept.`));
      invalidate();
    } catch (e) {
      setToastNotice(errorMessage(e));
    }
  }

  async function destroy(med: Medication) {
    try {
      await api.delete(`/medications/${med.id}`, undefined, {
        idempotencyKey: createCommandId(),
      });
      setDeleting(null);
      setToastNotice(t("错误档案已删除。", "Erroneous record deleted."));
      invalidate();
    } catch (e) {
      setToastNotice(errorMessage(e));
    }
  }

  return (
    <section className="subpage med-history">
      {toastNotice && <Toast message={toastNotice} onClose={() => setToastNotice("")} />}
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("用药档案", "Medication Log")}</span>
          <h2>{t("用药史", "Medication History")}</h2>
        </div>
      </div>
      <p className="muted-copy med-scope-note">
        {t("一段用药 = 一个阶段：从开始到结束，用多久一目了然。想到什么先记药名，细节随时补。", "One medication = one phase: start to end, duration at a glance. Jot the name first and add details anytime.")}
      </p>
      {!pet.archived_at && (
        <MedQuickAdd
          petId={pet.id}
          onSaved={(medication) => {
            setToastNotice(t(`已开始记录「${medication.name}」。`, `Started recording "${medication.name}".`));
            invalidate();
            // 停药自动归档的联动从 medication_id 关联开始：记完药立刻
            // 问一句要不要每天定点提醒。
            setReminderMed(medication);
          }}
        />
      )}
      {!pet.archived_at && (
        <Link className="button ghost full med-plan-cta" to={`/pets/${pet.id}/care`}>
          {t("需要每天定点给药的提醒？去照护计划建一个", "Need a daily med reminder? Create one in Care Plan")}
        </Link>
      )}
      {meds.length === 0 ? (
        <EmptyState
          title={t("还没有用药阶段", "No medication phases yet")}
          description={t("上面输入药名就能开始一段记录；停用时点一下，历史自动串成用药史。", "Type a name above to start one. Tap Stop when it ends and the history assembles itself.")}
        />
      ) : (
        <div className="med-phase-list">
          {meds.map((med) => (
            <MedPhase
              key={med.id}
              med={med}
              stopConfirming={confirmStopId === med.id}
              onRequestStop={() => setConfirmStopId(med.id)}
              onCancelStop={() => setConfirmStopId("")}
              onConfirmStop={() => void stop(med)}
              onRequestEdit={() => setEditing(med)}
              onRequestDelete={() => setDeleting(med)}
            />
          ))}
        </div>
      )}
      {editing && (
        <MedicationForm
          petId={pet.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setToastNotice(t("档案已更新。", "Record updated."));
            invalidate();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t(`删除「${deleting.name}」？`, `Delete "${deleting.name}"?`)}
          consequence={t("这是错误数据的清理，会连同它产生的用药事件一起删除。", "This cleans up mistaken data, deleting the medication events it created too.")}
          confirmLabel={t("删除药物", "Delete Medication")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => destroy(deleting)}
        />
      )}
      {reminderMed && (
        <MedReminderDialog
          pet={pet}
          medicationId={reminderMed.id}
          medicationName={reminderMed.name}
          dose={reminderMed.dose || undefined}
          onClose={() => setReminderMed(null)}
          onCreated={() => {
            setReminderMed(null);
            setToastNotice(t("已创建用药提醒，停药时会自动结束。", "Reminder created. It ends automatically when the medication stops."));
            invalidate();
          }}
        />
      )}
    </section>
  );
}

function medDay(value: string | undefined): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  const now = new Date();
  const sameYear = parsed.getFullYear() === now.getFullYear();
  const md = tt(`${parsed.getMonth() + 1}月${parsed.getDate()}日`, `${parsed.getMonth() + 1}/${parsed.getDate()}`);
  return sameYear ? md : tt(`${parsed.getFullYear()}年${md}`, `${parsed.getFullYear()}/${parsed.getMonth() + 1}/${parsed.getDate()}`);
}

function medDuration(med: Medication): string {
  if (!med.started_on) return "";
  const start = new Date(`${med.started_on}T00:00:00`);
  const end = med.ended_on
    ? new Date(`${med.ended_on}T00:00:00`)
    : new Date();
  if (Number.isNaN(start.getTime())) return "";
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return med.ended_on ? tt(`共 ${days} 天`, `${days} days total`) : tt(`已用 ${days} 天`, `${days} days so far`);
}

function MedPhase({
  med,
  stopConfirming,
  onRequestStop,
  onCancelStop,
  onConfirmStop,
  onRequestEdit,
  onRequestDelete,
}: {
  med: Medication;
  stopConfirming: boolean;
  onRequestStop: () => void;
  onCancelStop: () => void;
  onConfirmStop: () => void;
  onRequestEdit: () => void;
  onRequestDelete: () => void;
}) {
  const t = useT();
  const ongoing = !med.ended_on;
  return (
    <article className={`med-phase ${ongoing ? "ongoing" : "ended"}`}>
      <div className="med-phase-rail" aria-hidden>
        <i className="dot" />
        <span />
        {ongoing ? <i className="dot pulse" /> : <i className="dot hollow" />}
      </div>
      <div className="med-phase-body">
        <div className="med-phase-topline">
          <h3>{med.name}</h3>
          <span className="med-phase-span">
            {ongoing ? t(`使用中 · ${medDuration(med)}`, `Ongoing · ${medDuration(med)}`) : medDuration(med)}
          </span>
        </div>
        {(med.dose || med.schedule) && (
          <p className="med-phase-meta">
            {[med.dose, med.schedule].filter(Boolean).join(" · ")}
          </p>
        )}
        {med.note && <small className="med-phase-note">{med.note}</small>}
        <div className="med-phase-foot">
          <span className="med-phase-dates">
            {t(`${medDay(med.started_on)} 开始`, `Started ${medDay(med.started_on)}`)}
            {med.ended_on ? t(` → ${medDay(med.ended_on)} 结束`, ` → Ended ${medDay(med.ended_on)}`) : ""}
          </span>
          <span className="row-actions">
            {ongoing &&
              (stopConfirming ? (
                <>
                  <button className="med-stop-confirm" onClick={onConfirmStop}>
                    {t("确认停用", "Confirm Stop")}
                  </button>
                  <button className="text-button" onClick={onCancelStop}>
                    {t("取消", "Cancel")}
                  </button>
                </>
              ) : (
                <button className="text-button" onClick={onRequestStop}>
                  {t("停用", "Stop")}
                </button>
              ))}
            <button className="text-button" onClick={onRequestEdit}>
              {t("补充细节", "Add Details")}
            </button>
            <button className="text-button muted" onClick={onRequestDelete}>
              {t("删除", "Delete")}
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}

/** flomo 式速记卡：常驻内联，只有药名必填，回车即记。 */
function MedQuickAdd({
  petId,
  onSaved,
}: {
  petId: string;
  onSaved: (medication: Medication) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createCommandId());
  async function save() {
    if (!name.trim() || busy) {
      setError(name.trim() ? "" : t("先写个药名", "Enter a medication name first"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ medication: Medication }>(
        `/pets/${petId}/medications`,
        {
          name: name.trim(),
          dose: dose.trim(),
          schedule: schedule.trim(),
          note: "",
        },
        { idempotencyKey: commandId.current },
      );
      setName("");
      setDose("");
      setSchedule("");
      commandId.current = createCommandId();
      onSaved(result.medication);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="med-quick-add">
      <div className="med-quick-row">
        <input
          className="med-quick-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) void save();
          }}
          placeholder={t("开始一段用药：输入药名，回车即记", "Start a medication phase: type a name, press Enter to log")}
          aria-label={t("药名", "Medication name")}
        />
      </div>
      <div className="med-quick-row secondary">
        <input
          value={dose}
          onChange={(event) => setDose(event.target.value)}
          placeholder={t("剂量，如 25mg（选填）", "Dose, e.g. 25 mg (optional)")}
          aria-label={t("剂量", "Dose")}
        />
        <input
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          placeholder={t("频率，如 每日 2 次（选填）", "Frequency, e.g. twice daily (optional)")}
          aria-label={t("频率", "Frequency")}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="med-quick-foot">
        <small>{t("现在开始记，结束点一下「停用」。", "Start logging now; tap Stop when it ends.")}</small>
        <BusyButton className="button primary" busy={busy} onClick={() => void save()}>
          {t("开始记录", "Start Logging")}
        </BusyButton>
      </div>
    </section>
  );
}

/** 体重曲线：用户只管记，系统把记录长成趋势（长期监测的「有价值结果」）。 */
function WeightTrendCard({
  events,
  currentWeightG,
}: {
  events: Event[];
  currentWeightG?: number;
}) {
  const t = useT();
  const points: WeightPoint[] = events
    .filter((event) => event.type === "weight" && typeof event.payload?.weight_g === "number")
    .map((event) => {
      const grams = event.payload.weight_g as number;
      const date = new Date(event.occurred_at);
      return {
        at: date.getTime(),
        kg: Math.round((grams / 1000) * 100) / 100,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
      };
    })
    .sort((a, b) => a.at - b.at);
  const latest = points.at(-1);
  const previous = points.at(-2);
  const delta =
    latest && previous ? Math.round((latest.kg - previous.kg) * 100) / 100 : null;
  return (
    <section className="weight-trend-card">
      <div className="weight-trend-head">
        <div>
          <span className="eyebrow">{t("体重趋势 · 长期监测", "Weight Trend · Long-Term Monitoring")}</span>
          {latest ? (
            <p className="weight-trend-value">
              <strong>{latest.kg} kg</strong>
              {delta !== null && delta !== 0 && (
                <em className={delta > 0 ? "up" : "down"}>
                  {delta > 0 ? "↗" : "↘"} {Math.abs(delta)} kg
                </em>
              )}
              {delta === 0 && <em>{t("与上次持平", "Unchanged from last weigh-in")}</em>}
            </p>
          ) : currentWeightG ? (
            <p className="weight-trend-value"><strong>{currentWeightG / 1000} kg</strong><em>{t("来自档案", "From profile")}</em></p>
          ) : (
            <p className="weight-trend-value muted">{t("还没有体重记录", "No weight records yet")}</p>
          )}
        </div>
      </div>
      {points.length >= 2 ? (
        <WeightChart points={points} />
      ) : (
        <p className="weight-trend-hint">
          {points.length === 1
            ? t("再去时间线记一次体重，这里就会长出曲线。", "Log one more weight on the timeline and a curve will grow here.")
            : t("在时间线记体重（比如每周一次），这里会长出它的变化曲线。", "Log weights on the timeline (say, weekly) and the trend curve will grow here.")}
        </p>
      )}
      {points.length >= 2 && (
        <div className="weight-trend-axis">
          <span>{points[0].label}</span>
          <span>{latest?.label} {t("最新", "Latest")}</span>
        </div>
      )}
    </section>
  );
}
