'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'

interface Step {
  slug: string
  label: string
}

interface WizardProps {
  jobId: string
  steps: readonly Step[]
  unlocked: boolean[]
  completed: boolean[]
}

function useActiveIndex(steps: readonly Step[]) {
  const segment = useSelectedLayoutSegment()
  return steps.findIndex((s) => s.slug === segment)
}

export function StepIndicator({ jobId, steps, unlocked, completed }: WizardProps) {
  const activeIndex = useActiveIndex(steps)

  return (
    <ol className="flex items-start">
      {steps.map((step, index) => {
        const active = index === activeIndex
        const done = completed[index] && !active
        const locked = !unlocked[index]

        const circleClass = active
          ? 'bg-brand border-brand text-white'
          : done
            ? 'bg-success border-success text-white'
            : locked
              ? 'bg-surface border-line text-ink-faint'
              : 'bg-white border-brand-blue text-brand-blue'

        const labelClass = active
          ? 'text-ink font-medium'
          : locked
            ? 'text-ink-faint'
            : 'text-ink-muted'

        const content = (
          <>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium ${circleClass}`}
            >
              {done ? '✓' : index + 1}
            </span>
            <span className={`mt-2 text-center text-[11px] leading-tight sm:text-xs sm:whitespace-nowrap ${labelClass}`}>{step.label}</span>
          </>
        )

        return (
          <Fragment key={step.slug}>
            {index > 0 && (
              <li
                aria-hidden
                className={`mt-4 h-px flex-1 ${completed[index - 1] ? 'bg-success' : 'bg-line'}`}
              />
            )}
            <li className="w-14 shrink-0 sm:w-24">
              {locked ? (
                <span className="flex flex-col items-center cursor-not-allowed" aria-disabled>
                  {content}
                </span>
              ) : (
                <Link
                  href={`/extraction/${jobId}/${step.slug}`}
                  aria-current={active ? 'step' : undefined}
                  className="flex flex-col items-center"
                >
                  {content}
                </Link>
              )}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

export function StepNav({ jobId, steps, unlocked }: Omit<WizardProps, 'completed'>) {
  const activeIndex = useActiveIndex(steps)
  if (activeIndex === -1) return null

  const previous = steps[activeIndex - 1]
  const next = steps[activeIndex + 1]
  const nextLocked = next ? !unlocked[activeIndex + 1] : false

  return (
    <div className="mt-8 pt-5 border-t border-line flex items-center justify-between">
      {previous ? (
        <Link
          href={`/extraction/${jobId}/${previous.slug}`}
          className="text-sm border border-line rounded-md px-4 py-2 text-ink bg-white"
        >
          ← Back
        </Link>
      ) : (
        <span />
      )}

      {next && (
        <div className="flex items-center gap-3">
          {nextLocked && (
            <span className="text-xs text-ink-muted">Finish this step to continue.</span>
          )}
          {nextLocked ? (
            <button
              type="button"
              disabled
              className="bg-brand text-white text-sm font-medium rounded-md px-4 py-2 opacity-40 cursor-not-allowed"
            >
              Next →
            </button>
          ) : (
            <Link
              href={`/extraction/${jobId}/${next.slug}`}
              className="bg-brand text-white text-sm font-medium rounded-md px-4 py-2"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
