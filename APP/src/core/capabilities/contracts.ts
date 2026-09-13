export type Capabilities = {
  push_notifications: boolean
  digest: boolean
  alerts: boolean
  export_json: boolean
  export_pdf: boolean
  i18n: string[]
  care_responsibility_api: boolean
  activation_summary_api: boolean
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  push_notifications: false,
  digest: false,
  alerts: false,
  export_json: false,
  export_pdf: false,
  i18n: ['zh-CN'],
  care_responsibility_api: false,
  activation_summary_api: false,
}
