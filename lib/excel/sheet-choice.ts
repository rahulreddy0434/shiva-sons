/**
 * The worksheet a job's records go into: the one the user picked, if it is
 * still in the template and has headings, otherwise the sheet with the most
 * headings (a cover or notes sheet has one or two), the first of equals. Null
 * when no sheet has any.
 */
export function chosenSheetId(
  sheets: { id: string; columnCount: number }[],
  targetSheetId: string | null | undefined
): string | null {
  const usable = sheets.filter((s) => s.columnCount > 0)
  const widest = usable.reduce<(typeof usable)[number] | undefined>((best, s) => (!best || s.columnCount > best.columnCount ? s : best), undefined)
  return usable.find((s) => s.id === targetSheetId)?.id ?? widest?.id ?? null
}
