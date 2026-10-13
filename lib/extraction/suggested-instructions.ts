/** True when a header is just a day of the month: "1" … "31". */
export function isDayOfMonthHeader(name: string): boolean {
  return /^(?:[1-9]|[12]\d|3[01])$/.test(name.trim())
}

/**
 * The starting text for the instructions box, built from the template's
 * column headers. It is only a suggestion — the user edits it before any
 * fields are generated — so customer-specific rules are spelled out here,
 * in plain sight, rather than hidden in the AI prompt.
 */
export function buildSuggestedInstructions(columnNames: string[]): string {
  if (columnNames.length === 0) return ''

  const days = columnNames.filter(isDayOfMonthHeader)
  // A handful of numeric headers is not a calendar; a long run is
  if (days.length < 20) {
    return `Extract ${columnNames.join(', ')} from each document.`
  }

  const others = columnNames.filter((name) => !isDayOfMonthHeader(name))
  const first = days[0].trim()
  const last = days[days.length - 1].trim()

  return [
    `Extract ${others.join(', ')} from each document.`,
    `Columns ${first} to ${last} are the days of the month: for each day enter the hours worked that day.`,
    `Enter 0 for a day that was not worked (absent, day off, or left blank).`,
  ].join(' ')
}
