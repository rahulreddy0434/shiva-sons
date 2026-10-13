import type { ExtractionField } from '@/types/extraction'

export type FieldGroup =
  | { kind: 'single'; field: ExtractionField }
  /** A run of same-typed fields with short numeric labels, e.g. days 1–31. */
  | { kind: 'series'; fields: ExtractionField[] }

/** Shortest run worth showing as a compact grid rather than one row each. */
const MIN_SERIES_LENGTH = 5

function isSeriesMember(field: ExtractionField): boolean {
  return /^\d{1,2}$/.test(field.label.trim())
}

/**
 * Splits the field list into ordinary fields and compact "series" blocks so
 * the review screen can show a month of day cells as a small grid. Order is
 * preserved and every field appears exactly once.
 */
export function groupFields(fields: ExtractionField[]): FieldGroup[] {
  const groups: FieldGroup[] = []
  let run: ExtractionField[] = []

  const flush = () => {
    if (run.length >= MIN_SERIES_LENGTH) groups.push({ kind: 'series', fields: run })
    else for (const field of run) groups.push({ kind: 'single', field })
    run = []
  }

  for (const field of fields) {
    const continuesRun = isSeriesMember(field) && (run.length === 0 || run[0].dataType === field.dataType)
    if (continuesRun) {
      run.push(field)
      continue
    }
    flush()
    if (isSeriesMember(field)) run.push(field)
    else groups.push({ kind: 'single', field })
  }
  flush()

  return groups
}
