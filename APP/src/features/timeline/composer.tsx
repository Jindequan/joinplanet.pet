import React, { useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  createIdempotencyKey,
  type Family,
  type TimelineEvent,
  type Pet,
} from "../../core/api/planet-api";
import { errorMessage } from "../../core/api/errors";
import {
  enqueueTimelineEvent,
  shouldRetryTimelineEvent,
} from "../../core/storage/timeline-event-queue";
import { useFoundationWriters } from "../../core/foundation";
import { useTheme } from "../../core/providers/theme-provider";
import { AppText } from "../../ui/components/app-text";
import { Button } from "../../ui/components/button";
import { ChoiceChips } from "../../ui/components/choice-chips";
import { DateField, TimeField } from "../../ui/components/date-field";
import { ModalSheet } from "../../ui/components/modal-sheet";
import { PetAvatar } from "../../ui/components/pet-avatar";
import { OptionSheet, SelectField } from "../../ui/components/option-sheet";
import { TextField } from "../../ui/components/text-field";
import { hapticSelection, hapticSuccess } from "../../ui/motion";
import { MAX_PHOTO_DATA_BYTES, parseEventPayload } from "./registry";
import { dateTimeLocalInTimezone, instantFromCivilDateTime } from "./time";

export type EventType =
  "note" | "photo" | "symptom" | "weight" | "vet_visit" | "vaccine" | "deworm";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  note: "笔记",
  photo: "照片",
  symptom: "症状",
  weight: "体重",
  vet_visit: "就诊",
  vaccine: "疫苗",
  deworm: "驱虫",
};

const EVENT_TYPE_OPTIONS = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).map(
  (value) => ({
    value,
    label: EVENT_TYPE_LABELS[value],
  }),
);

function splitOccurred(value: string): { date: string; time: string } {
  const [date = "", rest = ""] = value.split("T");
  const time = rest.slice(0, 5);
  return {
    date,
    time: /^\d{2}:\d{2}$/.test(time) ? time : "12:00",
  };
}

export function EventForm({
  petId,
  familyId,
  familyName,
  timezone,
  initial,
  onClose,
  onSaved,
}: {
  petId: string;
  familyId?: string;
  familyName?: string;
  timezone?: string;
  initial?: TimelineEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const foundationWriters = useFoundationWriters();
  const [type, setType] = useState<EventType>(
    (initial?.type as EventType) in EVENT_TYPE_LABELS
      ? (initial!.type as EventType)
      : "note",
  );
  const initialOccurred = splitOccurred(
    initial
      ? dateTimeLocalInTimezone(initial.occurred_at, timezone)
      : dateTimeLocalInTimezone(new Date(), timezone),
  );
  const [occurredDate, setOccurredDate] = useState(initialOccurred.date);
  const [occurredTime, setOccurredTime] = useState(initialOccurred.time);
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
      : type === "photo"
        ? readPayload("caption")
        : type === "symptom"
          ? readPayload("title")
          : type === "vaccine" || type === "deworm"
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
  const [photoData, setPhotoData] = useState(() => {
    const value = initial?.payload?.photo_data;
    return typeof value === "string" ? value : "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createIdempotencyKey());

  const PRIMARY_LABELS: Record<EventType, string> = {
    note: "内容",
    photo: "说明（选填）",
    symptom: "症状",
    weight: "",
    vet_visit: "就诊事项",
    vaccine: "疫苗名称",
    deworm: "驱虫项目",
  };
  const SECONDARY_LABELS: Partial<Record<EventType, string>> = {
    symptom: "补充说明",
    vet_visit: "小结（诊所 / 结论）",
    weight: "备注（选填）",
  };

  function primaryFieldValid() {
    if (type === "weight")
      return Number(weight) > 0 && Number.isFinite(Number(weight));
    if (type === "photo") return Boolean(photoData);
    return true;
  }

  async function save() {
    const detailText = secondary.trim();
    let payload: Record<string, unknown>;
    if (type === "weight")
      payload = {
        weight_g: Math.round(Number(weight) * 1000),
        note: detailText,
      };
    else if (type === "photo")
      payload = { photo_data: photoData, caption: primary.trim() };
    else if (type === "symptom")
      payload = { title: primary.trim(), detail: detailText };
    else if (type === "vaccine" || type === "deworm")
      payload = {
        name: primary.trim(),
        ...(detailText ? { text: detailText } : {}),
      };
    else if (type === "vet_visit")
      payload = { title: primary.trim(), summary: detailText };
    else payload = { text: primary.trim() };

    const manualCheck =
      !primaryFieldValid() ||
      (type !== "weight" && type !== "photo" && !primary.trim());
    if (parseEventPayload(type, payload).kind === "unknown" || manualCheck) {
      setError(
        type === "weight" ? "请输入大于 0 的体重。" : "请填写必填内容。",
      );
      return;
    }
    if (!occurredDate) {
      setError("请选择发生日期。");
      return;
    }
    const occurredAt = `${occurredDate}T${occurredTime || "12:00"}`;
    setBusy(true);
    try {
      if (initial) {
        await foundationWriters.updateTimelineEvent({
          eventId: initial.id,
          petId,
          occurred_at: instantFromCivilDateTime(occurredAt, timezone),
          payload,
        });
        commandId.current = createIdempotencyKey();
      } else {
        await foundationWriters.writeTimelineEvent({
          petId,
          familyId,
          type,
          occurred_at: instantFromCivilDateTime(occurredAt, timezone),
          payload,
          idempotencyKey: commandId.current,
        });
        commandId.current = createIdempotencyKey();
      }
      void hapticSuccess();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet visible onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" muted>
        {initial ? "编辑记录" : "新记录"}
      </AppText>
      <AppText variant="heading" style={{ marginBottom: 12 }}>
        {initial ? "编辑这条记录" : "发生了什么？"}
      </AppText>

      {initial && familyId ? (
        <View
          style={[
            styles.recordContext,
            { backgroundColor: theme.colors.sageSoft },
          ]}
        >
          <AppText variant="caption" muted>
            记录归属
          </AppText>
          <AppText variant="label">{familyName ?? "当前家庭"}</AppText>
          <AppText variant="caption" muted>
            编辑时保留原家庭归属
          </AppText>
        </View>
      ) : null}

      <ChoiceChips
        label="类型"
        options={EVENT_TYPE_OPTIONS}
        value={type}
        onChange={setType}
        disabled={Boolean(initial)}
      />

      <View style={styles.whenRow}>
        <View style={styles.flex}>
          <DateField
            label="日期"
            value={occurredDate}
            onChange={setOccurredDate}
            clearable={false}
          />
        </View>
        <View style={styles.flex}>
          <TimeField
            label="时间"
            value={occurredTime}
            onChange={setOccurredTime}
            placeholder="选择时间"
            clearable={false}
          />
        </View>
      </View>

      {type === "weight" ? (
        <TextField
          label="体重（kg）"
          value={weight}
          onChangeText={setWeight}
          maxLength={10}
          keyboardType="decimal-pad"
          editable={!busy}
        />
      ) : null}

      {PRIMARY_LABELS[type] ? (
        <TextField
          label={PRIMARY_LABELS[type]}
          value={primary}
          onChangeText={setPrimary}
          maxLength={type === "photo" ? 300 : 1000}
          multiline
          editable={!busy}
        />
      ) : null}

      {type === "photo" ? (
        <PhotoPicker
          value={photoData}
          onChange={setPhotoData}
          disabled={busy}
        />
      ) : null}

      {SECONDARY_LABELS[type] ? (
        <TextField
          label={SECONDARY_LABELS[type]!}
          value={secondary}
          onChangeText={setSecondary}
          maxLength={1200}
          multiline
          editable={!busy}
        />
      ) : null}

      {error ? (
        <AppText
          variant="caption"
          color={theme.colors.danger}
          accessibilityRole="alert"
        >
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="取消"
          variant="secondary"
          onPress={onClose}
          disabled={busy}
          style={styles.flex}
        />
        <Button
          label="保存记录"
          busy={busy}
          onPress={() => void save()}
          style={styles.flex}
        />
      </View>
    </ModalSheet>
  );
}

/** Quick composer sheet: pick pet + type, jot a line, save. */
export function EventComposer({
  pets: petOptions,
  defaultPetId,
  userId,
  familyId,
  families,
  defaultFamilyId,
  writableFamilyIdsByPet,
  defaultType = "note",
  defaultOccurredAt,
  occurredAtLabel,
  onSaved,
  onClose,
}: {
  pets: Array<Pick<Pet, "id" | "name" | "species" | "family_ids">>;
  defaultPetId: string;
  userId?: string;
  familyId?: string;
  families: Array<Pick<Family, "id" | "name">>;
  defaultFamilyId?: string;
  writableFamilyIdsByPet?: Record<string, string[]>;
  defaultType?: EventType;
  defaultOccurredAt?: string;
  occurredAtLabel?: string;
  onSaved: (result?: { queued?: boolean }) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const foundationWriters = useFoundationWriters();
  const [chosenPetId, setChosenPetId] = useState("");
  const targetPetId = chosenPetId || defaultPetId;
  const initialPet = petOptions.find((pet) => pet.id === defaultPetId);
  const initialFamilyId =
    familyId ??
    (defaultFamilyId && initialPet?.family_ids?.includes(defaultFamilyId)
      ? defaultFamilyId
      : initialPet?.family_ids?.length === 1
        ? initialPet.family_ids[0]
        : undefined);
  const [chosenFamilyId, setChosenFamilyId] = useState(initialFamilyId ?? "");
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false);
  const [type, setType] = useState<EventType>(defaultType);
  const [text, setText] = useState("");
  const [extra, setExtra] = useState("");
  const [weight, setWeight] = useState("");
  const [photoData, setPhotoData] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(createIdempotencyKey());
  const selectedPet = petOptions.find((pet) => pet.id === targetPetId);
  const selectedPetFamilyIds = selectedPet?.family_ids ?? [];
  const writableFamilyIds =
    writableFamilyIdsByPet?.[targetPetId] ?? selectedPetFamilyIds;
  const selectedFamilyId =
    familyId ??
    (chosenFamilyId && writableFamilyIds.includes(chosenFamilyId)
      ? chosenFamilyId
      : selectedPetFamilyIds.length === 1 &&
          writableFamilyIds.includes(selectedPetFamilyIds[0] ?? "")
        ? (selectedPetFamilyIds[0] ?? "")
        : "");
  const familyOptions = families.filter((family) =>
    writableFamilyIds.includes(family.id),
  );

  const PLACEHOLDERS: Record<EventType, string> = {
    note: "记一笔…它今天怎么样？",
    photo: "给照片写一句说明（选填）",
    symptom: "症状，如 软便",
    weight: "体重多少？",
    vet_visit: "就诊事项，如 年度体检",
    vaccine: "疫苗名称，如 狂犬疫苗",
    deworm: "驱虫项目，如 体内驱虫",
  };
  const EXTRA_LABELS: Partial<Record<EventType, string>> = {
    symptom: "补充说明（选填）",
    vet_visit: "小结（诊所 / 结论，选填）",
    vaccine: "备注（选填）",
    deworm: "备注（选填）",
    weight: "备注（选填）",
  };

  async function save() {
    if (busy) return;
    if (!targetPetId) {
      setError(
        petOptions.length > 1 ? "先选择一只宠物" : "当前没有可记录的宠物",
      );
      return;
    }
    if (selectedPetFamilyIds.length > 1 && !selectedFamilyId) {
      setError("先选择这条记录属于哪个家庭");
      return;
    }
    if (selectedFamilyId && !writableFamilyIds.includes(selectedFamilyId)) {
      setError("所选家庭已不能记录这只宠物");
      return;
    }
    let payload: Record<string, unknown>;
    if (type === "weight") {
      const grams = Math.round(Number(weight) * 1000);
      if (!(grams > 0)) {
        setError("先填一个大于 0 的体重");
        return;
      }
      payload = { weight_g: grams, note: extra.trim() };
    } else if (type === "photo") {
      if (!photoData) {
        setError("先选一张照片");
        return;
      }
      payload = { photo_data: photoData, caption: text.trim() };
    } else if (!text.trim()) {
      setError("写一句再记");
      return;
    } else if (type === "symptom")
      payload = { title: text.trim(), detail: extra.trim() };
    else if (type === "vaccine" || type === "deworm")
      payload = {
        name: text.trim(),
        ...(extra.trim() ? { text: extra.trim() } : {}),
      };
    else if (type === "vet_visit")
      payload = { title: text.trim(), summary: extra.trim() };
    else payload = { text: text.trim() };

    setBusy(true);
    setError("");
    try {
      await foundationWriters.writeTimelineEvent({
        petId: targetPetId,
        familyId: selectedFamilyId || undefined,
        type,
        occurred_at: defaultOccurredAt ?? new Date().toISOString(),
        payload,
        idempotencyKey: commandId.current,
      });
      commandId.current = createIdempotencyKey();
      setText("");
      setExtra("");
      setWeight("");
      setPhotoData("");
      void hapticSuccess();
      onSaved();
    } catch (e) {
      if (userId && shouldRetryTimelineEvent(e)) {
        await enqueueTimelineEvent({
          userId,
          commandId: commandId.current,
          petId: targetPetId,
          ...(selectedFamilyId ? { familyId: selectedFamilyId } : {}),
          type,
          occurredAt: defaultOccurredAt ?? new Date().toISOString(),
          payload,
        });
        commandId.current = createIdempotencyKey();
        setText("");
        setExtra("");
        setWeight("");
        setPhotoData("");
        void hapticSuccess();
        onSaved({ queued: true });
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet visible onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" muted>
        记一笔
      </AppText>
      <AppText variant="heading" style={{ marginBottom: 12 }}>
        {defaultType === "weight" ? "记一次体重" : "快速记录"}
      </AppText>
      {occurredAtLabel ? (
        <AppText variant="caption" muted style={{ marginBottom: 8 }}>
          {occurredAtLabel}
        </AppText>
      ) : null}

      {petOptions.length > 1 ? (
        <View style={styles.petPicker}>
          <AppText variant="caption" muted>
            记录到哪只宠物
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.petStrip}
          >
            {petOptions.map((pet) => {
              const selected = targetPetId === pet.id;
              return (
                <Pressable
                  key={pet.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${pet.name}${selected ? '，已选择' : ''}`}
                  onPress={() => {
                    void hapticSelection();
                    setChosenPetId(pet.id);
                    setChosenFamilyId(
                      familyId ??
                        (defaultFamilyId &&
                        pet.family_ids?.includes(defaultFamilyId)
                          ? defaultFamilyId
                          : pet.family_ids?.length === 1
                            ? (pet.family_ids[0] ?? "")
                            : ""),
                    );
                    setError("");
                  }}
                  style={[
                    styles.petChip,
                    {
                      backgroundColor: selected
                        ? theme.colors.sageSoft
                        : theme.colors.paper,
                      borderColor: selected
                        ? theme.colors.forest2
                        : theme.colors.line,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <PetAvatar
                    petId={pet.id}
                    species={pet.species}
                    size={26}
                    decorative
                  />
                  <AppText variant="caption">{pet.name}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {!familyId && selectedPetFamilyIds.length > 1 ? (
        <SelectField
          label="记录归属家庭"
          value={
            familyOptions.find((family) => family.id === selectedFamilyId)
              ?.name ?? "选择家庭"
          }
          onPress={() => setFamilyPickerOpen(true)}
        />
      ) : null}

      <ChoiceChips
        label="类型"
        options={EVENT_TYPE_OPTIONS}
        value={type}
        onChange={setType}
      />

      {type === "photo" ? (
        <PhotoPicker
          value={photoData}
          onChange={setPhotoData}
          disabled={busy}
        />
      ) : null}

      <View
        style={[
          styles.mainRow,
          {
            borderColor: theme.colors.lineStrong,
            backgroundColor: theme.colors.paperStrong,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <TextInput
          value={type === "weight" ? weight : text}
          onChangeText={(value) => {
            if (type === "weight") setWeight(value);
            else setText(value);
          }}
          placeholder={PLACEHOLDERS[type]}
          placeholderTextColor={theme.colors.soft}
          keyboardType={type === "weight" ? "decimal-pad" : "default"}
          maxLength={type === "weight" ? 10 : type === "photo" ? 300 : 1000}
          style={[styles.input, { color: theme.colors.ink }]}
          accessibilityLabel={type === "weight" ? "体重（kg）" : `${EVENT_TYPE_LABELS[type]}内容`}
          editable={!busy}
        />
        <Button label="记下" busy={busy} onPress={() => void save()} />
      </View>

      {EXTRA_LABELS[type] || type === "weight" ? (
        <TextField
          label={EXTRA_LABELS[type] ?? "备注"}
          value={extra}
          onChangeText={setExtra}
          maxLength={1200}
          editable={!busy}
        />
      ) : null}

      <OptionSheet
        visible={familyPickerOpen}
        title="记录归属家庭"
        options={familyOptions.map((family) => ({
          value: family.id,
          label: family.name,
        }))}
        selected={selectedFamilyId}
        onClose={() => setFamilyPickerOpen(false)}
        onSelect={(value) => {
          setChosenFamilyId(value);
          setFamilyPickerOpen(false);
          setError("");
        }}
      />

      {error ? (
        <AppText
          variant="caption"
          color={theme.colors.danger}
          accessibilityRole="alert"
        >
          {error}
        </AppText>
      ) : null}
      <Button
        label="取消"
        variant="ghost"
        onPress={onClose}
        disabled={busy}
        style={{ alignSelf: "flex-start" }}
      />
    </ModalSheet>
  );
}

function PhotoPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { theme } = useTheme();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function choose(camera: boolean) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.55,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.55,
            base64: true,
          });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset?.base64) return;
      const mimeType =
        asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
      const dataUri = `data:${mimeType};base64,${asset.base64}`;
      if (dataUri.length > MAX_PHOTO_DATA_BYTES) {
        setError("这张照片太大了（最多 768 KB），请换一张更小的照片");
        return;
      }
      onChange(dataUri);
    } catch (e) {
      setError(errorMessage(e, "无法打开照片选择器"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.photoPicker}>
      {value ? (
        <Image
          source={{ uri: value }}
          style={styles.photoPreview}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.photoEmpty,
            { backgroundColor: theme.colors.sageSoft },
          ]}
        >
          <AppText variant="caption" color={theme.colors.forest2}>
            还没有照片
          </AppText>
        </View>
      )}
      <View style={styles.photoActions}>
        <Button
          label={busy ? "处理中…" : value ? "换一张" : "从相册选"}
          variant="secondary"
          disabled={busy || disabled}
          onPress={() => void choose(false)}
          style={styles.photoButton}
        />
        <Button
          label={Platform.OS === "web" ? "打开相机" : "拍一张"}
          variant="ghost"
          disabled={busy || disabled}
          onPress={() => void choose(true)}
          style={styles.photoButton}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="移除照片"
            onPress={() => onChange("")}
            disabled={busy || disabled}
            style={styles.removePhoto}
          >
            <AppText variant="caption" color={theme.colors.danger}>
              移除
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <AppText variant="caption" muted>
        照片会随这条记录保存，家庭成员都能在时间线看到。
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  whenRow: {
    flexDirection: "row",
    gap: 8,
  },
  petStrip: {
    marginBottom: 12,
    flexGrow: 0,
  },
  petPicker: {
    gap: 6,
  },
  petChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    fontSize: 16,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  recordContext: {
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  flex: {
    flex: 1,
  },
  photoPicker: {
    gap: 8,
  },
  photoPreview: {
    width: "100%",
    height: 180,
    borderRadius: 16,
  },
  photoEmpty: {
    height: 100,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  photoButton: {
    flex: 1,
    paddingHorizontal: 8,
  },
  removePhoto: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
});
