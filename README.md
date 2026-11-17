# DealWorkx CRM (proof of concept)

A small team CRM for the DealWorkx outbound desk. It replaces the Google Apps Script + Sheets tool (`Code.gs`, `index.html`, `appsscript.json`, kept in this folder for reference) with a Next.js app on Postgres.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No database setup is needed. On first start the app creates a local Postgres database (PGlite, stored in `.data/`) and fills it with **synthetic demo data**: made-up companies, people, `.example` emails and fictional phone numbers.

Demo sign-ins (password `dealworkx`):

| Who | Role | Email |
|---|---|---|
| Ryan | Admin | ryan.l@dealworkx.com |
| Evans | Admin | evans.s@dealworkx.com |
| Wally | Rep | admin@dealworkx.com |

To start over with fresh demo data, stop the server and delete the `.data` folder.

## What it does

- **Leads** (home): one sortable table, opened on *My work today*. Saved views are My work today, Overdue, My leads, Unassigned and All leads, each with a live count. Due cells colour themselves (red when overdue, green for today), like the Sheet's conditional formatting. *Their time* shows the prospect's local time, with a green dot inside business hours.
- **Lead panel**: click a row. It has click-to-call numbers, Gmail and LinkedIn links, the current sequence step with the message filled in (copy it, open it in Gmail, mark it sent, undo), call logging (number, outcome, notes, callback date), notes, the activity timeline, details, and status/disposition.
- **Assign** (admin): tick rows, then choose an owner and a Step 1 pain point. This starts the sequence today. A single lead can also be assigned or reassigned from its panel.
- **Sequence**: five steps (Email and LinkedIn) with a send day and a template each. Merge fields: `{{first_name}}`, `{{company}}`, `{{title}}`, `{{pain_point}}`, `{{sender}}`. Admins edit the steps and the pain-point list.
- **Dashboard**: today's calls, steps sent, due, overdue, active leads, meetings booked; a per-owner table; call outcomes; latest activity.
- **Import** (admin): CSV upload from the Sheet or an Apollo export. Headers are matched loosely, and duplicate emails are skipped. A template is at `/leads-template.csv`.

Access follows the old tool: admins see everything; reps see their own leads plus unassigned ones, and can only change their own.

## Use a real Postgres

Copy `.env.example` to `.env.local` and set `DATABASE_URL` to any Postgres (Neon, Supabase, Render…). The schema is created on first start.

With a real database the app is **not** in demo mode by default: no synthetic leads, no demo sign-ins on the login page. On an empty database it creates the three team accounts with the password in `INITIAL_PASSWORD` (10+ characters, required), plus the sequence and pain points. Set `DEMO_MODE=1` only if you want a hosted demo with fake data.

`APP_TIMEZONE` (default `Asia/Singapore`, as in the Apps Script project) decides what "today" means.

## Not in the POC

Sending email or LinkedIn messages from the app, daily send-capacity limits, password reset and user-management screens (users are seeded), and multiple sequences.

## Code map

- `lib/schema.ts`: tables (users, sessions, leads, sequence_steps, lead_steps, activities, pain_points)
- `lib/db.ts`: one query interface over PGlite or node-postgres
- `lib/data.ts`: reads (views, next action, dashboard); `lib/actions.ts`: server actions, each checking role and ownership
- `lib/seed.ts`: synthetic demo data
- `app/(app)/`: Leads, Dashboard, Sequence, Import; `app/login/`: sign-in
- `components/`: table, lead panel, forms, local-time clock
