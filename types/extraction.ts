export interface ExtractionField {
  id?: string
  key: string
  label: string
  dataType: 'string' | 'date' | 'time' | 'duration' | 'number'
  /** Required or Optional, as the user chose in Step 2; null until they choose. */
  required: boolean | null
  sortOrder: number
  /** Header of the template column this field fills, when known. */
  targetColumn?: string | null
  /** Id of the workbook_columns row this field is written to on export. */
  targetColumnId?: string | null
}