# Deploying to Vercel

A step-by-step guide to putting the app online so customers can use it.
Steps 1–3 and 6 are done once; steps 7–8 are repeated for every later release.

What already suits Vercel, so you do not need to change anything:

- Timecards upload straight from the browser to Supabase Storage, so Vercel's
  ~4.5 MB request limit does not apply to them (20 MB per file, 100 MB per upload).
- Slow routes (reading, extraction, field generation) allow up to 300 seconds,
  the most the free Hobby plan allows. Long PDFs are extracted 8 pages at a time.
- A daily job (`vercel.json`) removes original documents 30 days after their
  job was last changed, for every account.

## Before you start

You need accounts on GitHub (the code is already there), Vercel
(sign up at vercel.com with your GitHub account), Supabase, Azure and Google
AI Studio — the same ones the app uses locally.

### Decide on paid tiers

The free tiers are fine for trying the site, not for customers:

- **Azure Document Intelligence.** The free tier (F0) reads only the first two
  pages of each file and refuses files over 4 MB. The app works around the
  page limit by re-sending the rest two pages at a time (slow on long PDFs), but
  a scan over 4 MB will fail to read. Switch the resource to **Standard (S0)**
  in the Azure portal → your Document Intelligence resource → Pricing tier.
- **Gemini.** The free tier gives about 20 requests a day per model, and its
  terms let Google use what is sent. Turn on billing in Google AI Studio when
  you have customers; then you can set `GEMINI_FALLBACK_MODELS` to empty. See
  ARCHITECTURE.md → LLM provider and cost for prices.
- **Supabase.** The free plan pauses a project after a week without use and
  has no backups. Use the Pro plan once customers rely on it.
- **Vercel.** Hobby is free but for non-commercial use only. A business site
  needs the **Pro** plan.

## 1. Apply the database updates

From the project folder, with the Supabase CLI linked to your project:

```
supabase db push
supabase migration list --linked
```

Every migration in `supabase/migrations/` must show a time in the Remote
column. The latest release adds `field_ocr_confidence` (how clearly each value's
writing was read). Apply it **before** merging: the new code saves that column.

## 2. Create the Vercel project

1. Go to vercel.com → **Add New… → Project**.
2. Under **Import Git Repository**, pick `shiva-sons` (allow Vercel access to
   the repository if asked).
3. Framework preset: **Next.js** (detected). Leave Root Directory, Build
   Command and Output Directory as they are.
4. Open **Environment Variables** and add **all** the values below, then press
   **Deploy**. The first build takes a few minutes. The site starts and signs
   people in with only the Supabase values, so a missing Azure or Gemini key
   shows up only when a document fails at Process. Added or changed a value
   later? Deployments → ⋯ → **Redeploy**, or it does not take effect.

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key (secret) |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Azure portal → resource → Keys and Endpoint |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Azure portal → resource → Keys and Endpoint → Key 1 |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `CRON_SECRET` | A new long random string (see below) — not the one in your `.env.local` |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | Optional; leave out to use the defaults |

To make a random secret, run this in the project folder and copy the output:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Do **not** add `MOCK_AI`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_EMAIL_2` or
`E2E_PASSWORD_2` to Vercel.

### Function region

Vercel → your project → **Settings → Functions → Function Region**: choose the
region closest to your Supabase project's region (Supabase → Project Settings →
General). Every request talks to Supabase several times, so this makes the app
noticeably faster. Redeploy after changing it.

## 3. Point Supabase sign-in at the live site

When the deploy finishes, Vercel shows the site address, such as
`https://shiva-sons.vercel.app` (or your own domain — see step 5).

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: the live address, e.g. `https://shiva-sons.vercel.app`
- **Redirect URLs**: add `https://shiva-sons.vercel.app/**`
  (keep `http://localhost:3000/**` so local development still works)

Sign-up confirmation and password-reset emails use these, so without this
step their links point at the wrong place. (On 2026-10-16 reset links still
went to a Vercel login page for a `…vercel.app` deployment address: this step
had not been done.)

### Email links that work on any device

Supabase's standard email links only work in the browser that asked for the
email, so a link opened on a phone, or in another browser, fails. Change both
templates so the link goes to the app's `/auth/confirm` page, which checks it
on the server:

Supabase → **Authentication → Emails → Templates**:

- **Confirm signup**, message body:

  ```html
  <h2>Confirm your email</h2>
  <p>Follow this link to finish creating your Shiva Sons Technologies account:</p>
  <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm my email</a></p>
  <p>If you did not sign up, you can ignore this email.</p>
  ```

- **Reset password**, message body:

  ```html
  <h2>Reset your password</h2>
  <p>Follow this link to choose a new password for your Shiva Sons Technologies account:</p>
  <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
  <p>If you did not ask for this, you can ignore this email; your password stays the same.</p>
  ```

`{{ .SiteURL }}` is the Site URL above, so it must be the live address.
Emails already sent with the old template still work, in the same browser only.

### The email sender

Supabase's built-in email sender allows only a few messages an hour for the
whole site and is meant for testing; on the live site sign-up and password
reset were refused with "email rate limit exceeded". Until you have your own
domain, send through a Gmail account (about 500 emails a day):

1. Use a Gmail account for the business (a new one is best, e.g.
   `shivasons.notifications@gmail.com`). Turn on 2-Step Verification:
   myaccount.google.com → **Security**.
2. myaccount.google.com/apppasswords → create an app password named
   "Supabase". Copy the 16 characters; Google shows them once.
3. Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   host `smtp.gmail.com`, port `465`, username = the full Gmail address,
   password = the app password, sender email = the same Gmail address, sender
   name `Shiva Sons Technologies`. Save.
4. Supabase → **Authentication → Rate Limits**: set "emails per hour" to 30.
5. Sign up with an address of your own, open the email **on your phone**, and
   check it says "Your email is confirmed". Then try "Forgot password" the same way.

Later, with your own domain, switch to Resend (free for 100 a day): resend.com
→ **Domains → Add domain** (add its DNS records at your registrar) → **API
Keys → Create**, then in SMTP Settings use host `smtp.resend.com`, port `465`,
username `resend`, the API key as the password, and `no-reply@<your domain>`.

## 4. Check the live site

Go through this on the live address, in a private browser window:

- [ ] The home page, Privacy and Terms open without signing in
- [ ] Sign up with a new email, open the confirmation email, sign in
- [ ] "Forgot password" sends an email whose link opens the live site
- [ ] Create a job: upload your template, generate fields, upload a timecard,
      Process, Extract, check it in Review (side by side), approve, export,
      and open the downloaded file in Excel
- [ ] Sign out lands on the home page
- [ ] Vercel → project → **Settings → Cron Jobs** lists `/api/cron/retention`
      once a day. Its log shows `{"purged":…}` after the first run.
- [ ] Settings → Delete account works for a throwaway account

## 5. Optional: your own domain

Vercel → project → **Settings → Domains → Add**, enter the domain, and add the
DNS records Vercel shows at the company you bought the domain from. Then
repeat step 3 with the new address.

## 6. Monitoring

**Errors (Sentry, free for 5,000 errors a month).**

1. sentry.io → sign up → **Create project** → platform **Next.js**, name
   `shiva-sons`. Turn on email alerts for new issues (the default).
2. Copy the **DSN** (Project Settings → Client Keys), and note the organisation
   slug and project name.
3. Vercel → Settings → Environment Variables, for Production and Preview:
   `NEXT_PUBLIC_SENTRY_DSN` = the DSN, `SENTRY_ORG` = the organisation slug,
   `SENTRY_PROJECT` = `shiva-sons`. Optional, for readable stack traces:
   `SENTRY_AUTH_TOKEN` (Sentry → Settings → Auth Tokens). Redeploy.

Without the DSN the app sends nothing. Reports go through the site's own
`/monitoring` address and leave out document contents, emails, cookies,
request bodies and link tokens (`lib/monitoring`). The AI being busy or out of
quota is not reported, since the user is already told.

**Uptime (UptimeRobot, free).** uptimerobot.com → sign up → **Add New
Monitor** → type **Keyword**, URL `https://shiva-sons.vercel.app/api/health`,
keyword `"status":"ok"`, every 5 minutes, alert by email. It warns you when the
site, or its database, stops answering.

## 7. Checking a deployment before merging

Vercel puts preview addresses behind its own sign-in. To let the automated
check in:

1. Vercel → project → **Settings → Deployment Protection → Protection Bypass
   for Automation** → **Add Secret** → copy it.
2. Add it to your own `.env.local` (never commit it, never paste it in chat):
   `VERCEL_AUTOMATION_BYPASS_SECRET=<the secret>`
3. Run, with the preview address from the pull request:
   `SMOKE_URL=https://<preview>.vercel.app npm run test:smoke`
   (without `SMOKE_URL` it checks the live site). It signs in as the test
   account, runs a job with real reading and extraction, and deletes it.

## 8. Releasing changes later

Vercel builds every branch you push and gives it a preview address; a merge
into `main` updates the live site automatically.

1. Work on a branch, push it, and check its preview (step 7).
2. If the release adds files under `supabase/migrations/`, run
   `supabase db push` **before** merging (migrations are additive, so the
   running site keeps working).
3. Merge the pull request into `main`. Vercel deploys within a few minutes;
   Vercel → Deployments shows progress and lets you roll back with one click.

## Before inviting real customers

- [ ] Paid tiers chosen (see the top of this page)
- [ ] Your own email sender set up in Supabase
- [ ] Decide whether anyone may sign up, or only people you invite
      (Supabase → Authentication → Sign In / Providers → allow new users)
- [ ] Remove the test accounts (`claude-wizard-test@example.com`,
      `claude-wizard-test-2@example.com`) in Supabase → Authentication → Users
      if you use the same Supabase project for the live site
- [ ] Privacy and Terms reviewed by a lawyer — both are still marked as drafts
- [ ] Supabase backups enabled (Pro plan)

## Known limits to tell early customers

- `.xlsx` templates only, up to 4 MB; macros, pivot tables and charts in a
  template are not supported
- Timecards: PDF, JPG or PNG, up to 20 MB each and 100 MB per upload
- Handwriting is read imperfectly — a day's hours can land on the wrong row
  even when the total adds up. Every record must be checked in Review, which
  is why approval is required before export
