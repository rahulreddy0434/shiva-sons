export type InferredType = 'text' | 'date' | 'time' | 'duration' | 'number'

export interface ParsedColumn {
  name: string
  index: number
  inferredType: InferredType
}

export interface ParsedSheet {
  name: string
  index: number
  headerRowIndex: number
  columns: ParsedColumn[]
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[]
}