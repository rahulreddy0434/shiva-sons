import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function NewExtractionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: job, error } = await supabase
    .from('extraction_jobs')
    .insert({
      user_id: user.id,
      name: `New extraction — ${new Date().toLocaleDateString()}`,
      status: 'draft',
    })
    .select()
    .single()

  if (error || !job) {
    throw new Error(error?.message ?? 'Could not create a new extraction job')
  }

  redirect(`/extraction/${job.id}`)
}