export type FormMode = 'create' | 'edit' | 'confirm';

export type FormStatus = 'idle' | 'editing' | 'submitting' | 'success' | 'error';

export type FormState<T> = {
  mode: FormMode;
  status: FormStatus;
  values: T;
  errors: Record<string, string>;
  serverError?: string;
  dirty: boolean;
};

export type SubmitResult<T> = {
  data: T;
  invalidate: string[];
};

export const flowRules = {
  auth: 'email → request-code → code → verify-code → session → protected queries',
  viewFilter: 'accessible families/pets → presentation filter → application query → view data',
  mutation: 'draft → local schema → API payload → server response → invalidate affected query keys',
  conflict: '409 authoritative payload → replace local state → show actionable message',
  destructive: 'intent → explicit confirmation → API mutation → clear/invalidate → native navigation',
} as const;
