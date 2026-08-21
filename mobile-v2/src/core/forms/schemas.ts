import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
});

export const codeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code.'),
});

export const familySchema = z.object({
  name: z.string().trim().min(1, 'Give your Family a name.').max(60, 'Family names are limited to 60 characters.'),
  timezone: z.string().trim().optional(),
});

export const joinFamilySchema = z.object({
  code: z.string().trim().toUpperCase().min(6, 'Enter the invite code.').max(32, 'Invite code is too long.'),
});

export const petSchema = z.object({
  name: z.string().trim().min(1, 'Give your pet a name.').max(40, 'Pet names are limited to 40 characters.'),
  species: z.enum(['dog', 'cat', 'other']),
  breed: optionalText(80),
  birth_date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  sex: z.enum(['', 'male', 'female']),
  neutered: z.boolean(),
  weight_g: z.string().regex(/^$|^\d{1,6}$/, 'Weight must be a whole number.'),
});

export const profileSchema = z.object({
  notes: z.string().max(2000, 'Notes are limited to 2,000 characters.'),
  allergies: z.array(z.record(z.string(), z.unknown())),
  conditions: z.array(z.record(z.string(), z.unknown())),
  emergency_contacts: z.array(z.record(z.string(), z.unknown())),
  med_decision_maker: z.unknown().optional(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Name the routine.').max(120, 'Routine names are limited to 120 characters.'),
  schedule_kind: z.enum(['daily', 'weekly', 'monthly', 'interval']),
  weekly_days: z.array(z.number().int().min(1).max(7)).max(7),
  monthly_day: z.string().regex(/^$|^([1-9]|[12]\d|3[01])$/, 'Choose a day from 1 to 31.'),
  every_n: z.string().regex(/^$|^\d{1,3}$/, 'Use a number from 1 to 365.'),
  time_of_day: z.string().regex(/^$|^\d{2}:\d{2}$/, 'Use HH:MM.'),
}).superRefine((value, context) => {
  if (value.schedule_kind === 'weekly' && value.weekly_days.length === 0) {
    context.addIssue({ code: 'custom', path: ['weekly_days'], message: 'Choose at least one day.' });
  }
  if (value.schedule_kind === 'interval') {
    const every = Number(value.every_n);
    if (!Number.isInteger(every) || every < 1 || every > 365) context.addIssue({ code: 'custom', path: ['every_n'], message: 'Choose 1–365 days.' });
  }
  if (value.schedule_kind === 'monthly' && (!value.monthly_day || Number(value.monthly_day) < 1 || Number(value.monthly_day) > 31)) {
    context.addIssue({ code: 'custom', path: ['monthly_day'], message: 'Choose a day from 1 to 31.' });
  }
});

export const careItemSchema = z.object({
  type: z.enum(['medication', 'feeding', 'health', 'grooming', 'exercise', 'custom']),
  title: z.string().trim().min(1, 'Name the care item.').max(120, 'Care item names are limited to 120 characters.'),
  description: z.string().max(500, 'Descriptions are limited to 500 characters.'),
  schedule_kind: z.enum(['daily', 'weekly', 'monthly', 'interval']),
  weekly_days: z.array(z.number().int().min(1).max(7)).max(7),
  monthly_day: z.string().regex(/^$|^([1-9]|[12]\d|3[01])$/, 'Choose a day from 1 to 31.'),
  every_n: z.string().regex(/^$|^\d{1,3}$/, 'Use a number from 1 to 365.'),
  time_of_day: z.string().regex(/^$|^\d{2}:\d{2}$/, 'Use HH:MM.'),
}).superRefine((value, context) => {
  if (value.schedule_kind === 'weekly' && value.weekly_days.length === 0) context.addIssue({ code: 'custom', path: ['weekly_days'], message: 'Choose at least one day.' });
  if (value.schedule_kind === 'monthly' && (!value.monthly_day || Number(value.monthly_day) < 1 || Number(value.monthly_day) > 31)) context.addIssue({ code: 'custom', path: ['monthly_day'], message: 'Choose a day from 1 to 31.' });
  if (value.schedule_kind === 'interval' && (!Number.isInteger(Number(value.every_n)) || Number(value.every_n) < 1 || Number(value.every_n) > 365)) context.addIssue({ code: 'custom', path: ['every_n'], message: 'Choose 1–365 days.' });
});

export const medicationSchema = z.object({
  name: z.string().trim().min(1, 'Name the medication.').max(120),
  dose: z.string().max(120),
  schedule: z.string().max(120),
  note: z.string().max(2000),
});

export const timelineSchema = z.object({
  type: z.enum(['note', 'symptom', 'weight', 'vaccine', 'vet_visit']),
  occurred_at: z.string().datetime({ offset: true }),
  text: z.string().trim().max(2000),
  weight_g: z.string().regex(/^$|^\d{1,6}$/, 'Weight must be a whole number.'),
}).superRefine((value, context) => {
  if (value.type !== 'weight' && !value.text) context.addIssue({ code: 'custom', path: ['text'], message: 'Add a detail.' });
  if (value.type === 'weight' && !value.weight_g) context.addIssue({ code: 'custom', path: ['weight_g'], message: 'Add the weight in grams.' });
});

export const shareSchema = z.object({
  kind: z.enum(['care_card', 'summary']),
  ttl_hours: z.enum(['24', '72', '168']),
  days: z.string().regex(/^$|^\d{1,3}$/, 'Use 1–365 days.'),
}).superRefine((value, context) => {
  if (value.kind === 'summary') {
    const days = Number(value.days || 90);
    if (days < 1 || days > 365) context.addIssue({ code: 'custom', path: ['days'], message: 'Choose 1–365 days.' });
  }
});

export const transferSchema = z.object({
  to_circle_id: z.string().uuid('Choose a valid Family.'),
});

export const notificationPrefsSchema = z.object({
  reminders: z.boolean(),
  digest: z.boolean(),
  alerts: z.boolean(),
});

export const displayNameSchema = z.object({
  display_name: z.string().trim().min(1, 'Enter a display name.').max(60),
});

export const accountDeleteSchema = z.object({
  confirm: z.string().trim().min(1, 'Type your email to confirm.'),
});

export type EmailForm = z.infer<typeof emailSchema>;
export type CodeForm = z.infer<typeof codeSchema>;
export type FamilyForm = z.infer<typeof familySchema>;
export type JoinFamilyForm = z.infer<typeof joinFamilySchema>;
export type PetForm = z.infer<typeof petSchema>;
export type ProfileForm = z.infer<typeof profileSchema>;
export type TaskForm = z.infer<typeof taskSchema>;
export type CareItemForm = z.infer<typeof careItemSchema>;
export type MedicationForm = z.infer<typeof medicationSchema>;
export type TimelineForm = z.infer<typeof timelineSchema>;
export type ShareForm = z.infer<typeof shareSchema>;
export type TransferForm = z.infer<typeof transferSchema>;
export type NotificationPrefsForm = z.infer<typeof notificationPrefsSchema>;

export function formErrors(error: z.ZodError): Record<string, string> {
  return error.issues.reduce<Record<string, string>>((result, issue) => {
    const key = String(issue.path[0] ?? 'form');
    if (!result[key]) result[key] = issue.message;
    return result;
  }, {});
}

export function taskPayload(form: TaskForm) {
  const schedule = form.schedule_kind === 'daily'
    ? { v: 1, kind: 'daily' }
    : form.schedule_kind === 'weekly'
      ? { v: 1, kind: 'weekly', days: form.weekly_days }
      : form.schedule_kind === 'monthly'
        ? { v: 1, kind: 'monthly', day: Number(form.monthly_day) }
        : { v: 1, kind: 'interval', every_n: Number(form.every_n) };
  return { title: form.title.trim(), schedule, ...(form.time_of_day ? { time_of_day: form.time_of_day } : {}) };
}

export function careItemPayload(form: CareItemForm) {
  const rule = form.schedule_kind === 'daily'
    ? { type: 'daily' as const }
    : form.schedule_kind === 'weekly'
      ? { type: 'weekly' as const, days: form.weekly_days }
      : form.schedule_kind === 'monthly'
        ? { type: 'monthly' as const, day: Number(form.monthly_day) }
        : { type: 'interval' as const, interval: Number(form.every_n) };
  return { type: form.type, title: form.title.trim(), description: form.description.trim(), rule: { ...rule, ...(form.time_of_day ? { time: form.time_of_day } : {}) } };
}

export function petPayload(form: PetForm) {
  return {
    name: form.name.trim(), species: form.species, breed: form.breed || undefined,
    birth_date: form.birth_date || undefined, sex: form.sex || undefined,
    neutered: form.neutered, weight_g: form.weight_g ? Number(form.weight_g) : undefined,
  };
}

export function timelinePayload(form: TimelineForm) {
  const payload = form.type === 'weight'
    ? { weight_g: Number(form.weight_g), text: form.text }
    : form.type === 'vaccine'
      ? { name: form.text, text: form.text }
      : form.type === 'vet_visit'
        ? { title: form.text, summary: form.text, text: form.text }
        : { text: form.text };
  return { type: form.type, occurred_at: form.occurred_at, payload };
}

export function sharePayload(form: ShareForm) {
  return {
    kind: form.kind,
    ttl_hours: Number(form.ttl_hours) as 24 | 72 | 168,
    ...(form.kind === 'summary' ? { options: { sections: ['profile', 'medications', 'events'], days: Number(form.days || 90) } } : {}),
  };
}
