/** A business detail from lib/legal.ts, or a visible marker that it still has to be filled in. */
export function LegalValue({ value, missing }: { value: string | null; missing: string }) {
  if (value) return <>{value}</>
  return (
    <span className="rounded bg-brand-soft px-1 font-medium text-brand-strong" title="Fill this in in lib/legal.ts">
      [{missing}]
    </span>
  )
}
