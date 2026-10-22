import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/monitoring/report'

// Error monitoring in the browser (see lib/monitoring/report.ts); off without a DSN
const options = sentryOptions()
if (options) Sentry.init(options)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
