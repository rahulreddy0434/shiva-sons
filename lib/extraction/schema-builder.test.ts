import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFieldsFromColumns, buildFieldsFromInstructions } from './schema-builder'
import { proposeSchemaFields } from '@/lib/llm/provider'

// The LLM is always mocked here — these tests cover how its answer is cleaned
// up, not whether Gemini itself responds sensibly.
vi.mock('@/lib/llm/provider', () => ({ proposeSchemaFields: vi.fn() }))
const mockPropose = vi.mocked(proposeSchemaFields)

describe('buildFieldsFromColumns', () => {
  const sheet = (names: string[], inferredType = 'text') => [
    { name: 'Sheet1', columns: names.map((name) => ({ name, inferredType })) },
  ]

  it('turns column names into keyed, typed fields in order, each linked to its column', () => {
    const fields = buildFieldsFromColumns(sheet(['Employee Name', 'Date', 'Start Time', 'Break Duration', 'Total Hours']))

    expect(fields.map((f) => f.key)).toEqual(['employee_name', 'date', 'start_time', 'break_duration', 'total_hours'])
    expect(fields.map((f) => f.dataType)).toEqual(['string', 'date', 'time', 'duration', 'number'])
    expect(fields.map((f) => f.sortOrder)).toEqual([0, 1, 2, 3, 4])
    expect(fields.map((f) => f.targetColumn)).toEqual(['Employee Name', 'Date', 'Start Time', 'Break Duration', 'Total Hours'])
    expect(fields.every((f) => f.required === false)).toBe(true)
  })

  it('does not treat overtime as a clock time, or an ID as a number', () => {
    expect(buildFieldsFromColumns(sheet(['Overtime Hours']))[0].dataType).toBe('number')
    expect(buildFieldsFromColumns(sheet(['Employee ID']))[0].dataType).toBe('string')
  })

  it('makes day-of-month columns numeric fields with day keys', () => {
    const fields = buildFieldsFromColumns(sheet(['ID', '1', '2', '31', 'T/HRS']))
    expect(fields.map((f) => [f.key, f.label, f.dataType])).toEqual([
      ['id', 'ID', 'string'],
      ['day_1', '1', 'number'],
      ['day_2', '2', 'number'],
      ['day_31', '31', 'number'],
      ['t_hrs', 'T/HRS', 'number'],
    ])
  })

  it('uses the type of the sample data when the template has some', () => {
    expect(buildFieldsFromColumns(sheet(['Amount'], 'number'))[0].dataType).toBe('number')
    expect(buildFieldsFromColumns(sheet(['Joined'], 'date'))[0].dataType).toBe('date')
  })

  it('keeps keys unique and uses the first worksheet that has headings', () => {
    expect(buildFieldsFromColumns(sheet(['Name', 'name', 'NAME'])).map((f) => f.key)).toEqual(['name', 'name_2', 'name_3'])
    expect(
      buildFieldsFromColumns([
        { name: 'Cover', columns: [] },
        { name: 'Data', columns: [{ name: 'ID', inferredType: 'text' }] },
      ]).map((f) => f.label)
    ).toEqual(['ID'])
    expect(buildFieldsFromColumns([])).toEqual([])
  })
})

describe('buildFieldsFromInstructions', () => {
  // Braces matter: a function returned from beforeEach is run as a cleanup hook
  beforeEach(() => {
    mockPropose.mockReset()
  })

  it('passes the instructions and workbook columns to the LLM', async () => {
    mockPropose.mockResolvedValue([])
    const sheets = [{ name: 'Sheet1', columns: [{ name: 'Employee Name', inferredType: 'text' }] }]

    await buildFieldsFromInstructions('Extract the employee name', sheets)

    expect(mockPropose).toHaveBeenCalledWith({ instructions: 'Extract the employee name', sheets })
  })

  it('keeps well-formed proposals as they are', async () => {
    mockPropose.mockResolvedValue([
      { key: 'employee_name', label: 'Employee Name', dataType: 'string', required: true },
      { key: 'daily_attendance', label: 'Daily attendance (days 1–31)', dataType: 'string', required: false },
    ])

    expect(await buildFieldsFromInstructions('x', [])).toEqual([
      { key: 'employee_name', label: 'Employee Name', dataType: 'string', required: true, sortOrder: 0, targetColumn: null },
      { key: 'daily_attendance', label: 'Daily attendance (days 1–31)', dataType: 'string', required: false, sortOrder: 1, targetColumn: null },
    ])
  })

  it('normalizes keys and derives one from the label when missing', async () => {
    mockPropose.mockResolvedValue([
      { key: 'Employee ID!', label: 'Employee ID', dataType: 'string' },
      { label: 'Start Time', dataType: 'time' },
    ])

    const fields = await buildFieldsFromInstructions('x', [])
    expect(fields.map((f) => f.key)).toEqual(['employee_id', 'start_time'])
  })

  it('makes duplicate keys unique instead of dropping a field', async () => {
    mockPropose.mockResolvedValue([
      { key: 'date', label: 'Date', dataType: 'date' },
      { key: 'date', label: 'Date signed', dataType: 'date' },
      { key: 'date', label: 'Date approved', dataType: 'date' },
    ])

    const fields = await buildFieldsFromInstructions('x', [])
    expect(fields.map((f) => f.key)).toEqual(['date', 'date_2', 'date_3'])
  })

  it('falls back to a guessed type when the LLM returns an unsupported one', async () => {
    mockPropose.mockResolvedValue([
      { key: 'shift_date', label: 'Shift Date', dataType: 'datetime' },
      { key: 'notes', label: 'Notes', dataType: 42 },
    ])

    const fields = await buildFieldsFromInstructions('x', [])
    expect(fields.map((f) => f.dataType)).toEqual(['date', 'string'])
  })

  it('treats anything other than literal true as not required', async () => {
    mockPropose.mockResolvedValue([
      { key: 'a', label: 'A', dataType: 'string', required: 'yes' },
      { key: 'b', label: 'B', dataType: 'string' },
    ])

    const fields = await buildFieldsFromInstructions('x', [])
    expect(fields.map((f) => f.required)).toEqual([false, false])
  })

  it('skips entries with no usable label and keeps sort order contiguous', async () => {
    mockPropose.mockResolvedValue([
      { key: 'a', label: '   ', dataType: 'string' },
      null as never,
      { key: 'b', label: 'B', dataType: 'string' },
    ])

    expect(await buildFieldsFromInstructions('x', [])).toEqual([
      { key: 'b', label: 'B', dataType: 'string', required: false, sortOrder: 0, targetColumn: null },
    ])
  })

  it('keeps one field per day column and links each to its template column', async () => {
    const sheets = [
      {
        name: 'Sheet1',
        columns: [
          { name: 'NAME', inferredType: 'text' },
          { name: '1', inferredType: 'text' },
          { name: '2', inferredType: 'text' },
        ],
      },
    ]
    mockPropose.mockResolvedValue([
      { key: 'name', label: 'Name', dataType: 'string', required: true, column: 'NAME' },
      { key: 'day_1', label: '1', dataType: 'number', column: '1' },
      { key: 'day_2', label: '2', dataType: 'number', column: '2' },
    ])

    const fields = await buildFieldsFromInstructions('x', sheets)
    expect(fields.map((f) => [f.key, f.label, f.dataType, f.targetColumn])).toEqual([
      ['name', 'Name', 'string', 'NAME'],
      ['day_1', '1', 'number', '1'],
      ['day_2', '2', 'number', '2'],
    ])
  })

  it('ignores a column the template does not have', async () => {
    mockPropose.mockResolvedValue([
      { key: 'site', label: 'Site', dataType: 'string', column: 'Site' },
      { key: 'x', label: 'X', dataType: 'string', column: 7 },
    ])

    const fields = await buildFieldsFromInstructions('x', [{ name: 'S', columns: [{ name: 'NAME', inferredType: 'text' }] }])
    expect(fields.map((f) => f.targetColumn)).toEqual([null, null])
  })

  it('lets an LLM failure propagate so nothing is saved', async () => {
    mockPropose.mockRejectedValue(new Error('Gemini unavailable'))
    await expect(buildFieldsFromInstructions('x', [])).rejects.toThrow('Gemini unavailable')
  })
})

describe('buildFieldsFromInstructions — totals', () => {
  it('makes a total after a run of day columns a number even if the model said text', async () => {
    mockPropose.mockResolvedValue([
      { key: 'name', label: 'Name', dataType: 'string', required: true },
      ...[1, 2, 3, 4, 5].map((d) => ({ key: 'day_' + d, label: String(d), dataType: 'number' })),
      { key: 'total', label: 'Total', dataType: 'string' },
      { key: 'remarks', label: 'Remarks', dataType: 'string' },
    ])
    const fields = await buildFieldsFromInstructions('x', [])
    expect(fields.map((f) => [f.key, f.dataType])).toEqual([
      ['name', 'string'],
      ...[1, 2, 3, 4, 5].map((d) => ['day_' + d, 'number']),
      ['total', 'number'],
      ['remarks', 'string'],
    ])
  })
})
