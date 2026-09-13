export function profileLines(value: unknown, key: string) {
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const current = (item as Record<string, unknown>)[key]
      return typeof current === 'string' ? current : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function profileLinesPayload(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ name }))
}

export function profileContactRows(value: unknown): Array<{ name: string; phone: string }> {
  if (!Array.isArray(value)) return [{ name: '', phone: '' }]
  const rows = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const contact = item as Record<string, unknown>
      return {
        name: typeof contact.name === 'string' ? contact.name : '',
        phone: typeof contact.phone === 'string' ? contact.phone : '',
      }
    })
    .filter((row): row is { name: string; phone: string } => Boolean(row))
  return rows.length ? rows : [{ name: '', phone: '' }]
}

export function profileContactRowsPayload(rows: Array<{ name: string; phone: string }>) {
  return rows
    .map((row) => ({ name: row.name.trim(), phone: row.phone.trim() }))
    .filter((row) => row.name || row.phone)
}

export function profileObjectName(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const name = (value as Record<string, unknown>).name
  return typeof name === 'string' ? name : ''
}
