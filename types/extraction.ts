export interface ExtractionField {
  id?: string
  key: string
  label: string
  dataType: 'string' | 'date' | 'time' | 'duration' | 'number'
  required: boolean
  sortOrder: number
}