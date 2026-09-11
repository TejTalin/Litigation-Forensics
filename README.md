# Litigation Forensics

Litigation Forensics is a Vite/React legal-review workspace with seven live analysis modules: Trapdoor Scanner, Missing Party Radar, Prayer–Pleading Alignment, Contradiction Trap, Concession Firewall, Citation Treatment, and Court Queue Alert. The original Bolt visual system is retained; results are supplied by Vercel serverless API functions, never by demo findings.

## Local development

1. Install Node 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local`, then set `GROQ_API_KEY`. Set `DATABASE_URL` for queue watches and persistent case data.
3. Apply [`db/migrations/0000_initial.sql`](db/migrations/0000_initial.sql) to the Postgres database.
4. Run `npm run dev` for the UI. Run `npx vercel dev` when testing the API functions locally.
5. Run `npm run typecheck` and `npm run build` before deployment.

## Deploy to Vercel

1. Push this repository to GitHub and import it in Vercel.
2. Select the **Vite** framework preset. `vercel.json` supplies the build command (`npm run build`), output directory (`dist`), API duration, and five-minute cron schedule.
3. Provision Vercel Postgres and set `DATABASE_URL`, `GROQ_API_KEY`, `CRON_SECRET`, `COURT_BOARD_URL`, and `COURT_BOARD_PATTERN` in Project Settings → Environment Variables.
4. Deploy. Vercel invokes `/api/cron/poll` every five minutes; the endpoint is protected with `CRON_SECRET` and stores all watch state in Postgres.

## Serverless notes

There is no Express process, in-memory watch map, or `setInterval`. API handlers in `api/` call the ported logic in `server/lib/`. PDF text extraction uses `pdf-parse`; image/scanned-PDF OCR uses Tesseract in the request. For production reliability, keep uploads modest (Vercel request limits apply) and use text PDFs when possible. Very large scanned bundles should be processed through a dedicated asynchronous OCR service before upload.

Citation treatment and legal signals are first-pass research aids, not legal advice; independently verify before filing or relying on them.
