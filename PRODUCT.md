# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + Postgres, chosen by the user. Locally the app runs on PGlite (Postgres compiled to WASM, persisted on disk) so no database install is needed; setting `DATABASE_URL` switches to any hosted Postgres with the same SQL. Proof of concept, not production.

## Users

- **Reps / sequence owners** (e.g. Wally and future SDR hires): work an assigned list of B2B prospects through outreach steps and calls, all day, at a desk, often on the phone. They need the next lead, its context, the message to send or the number to dial, and a fast way to record what happened.
- **Admins** (Ryan, Evans): assign unassigned prospects to reps in batches, watch the day's activity and pipeline across the team, import prospect lists.

Reps see their own leads plus unassigned ones; admins see everything. Confirmed by the user.

## Product Purpose

An internal team CRM for DealWorkx, a B2B appointment-setting and lead-generation agency. It replaces a Google Apps Script + Sheets tool (`Code.gs`, `index.html` in this folder) with a minimal real app: prospects, ownership, outreach steps, call logging, follow-ups and a daily view. Success for the POC: a rep can sign in, find what is due today, work a lead end to end (send a step, log a call, set a callback, book a meeting), and an admin can import and assign leads.

## Positioning

The unit of work is a booked meeting, not a deal. The tool is a work queue for outbound prospecting (research → sequence → call → qualified meeting), not a generic deal-pipeline CRM.

## Operating Context

- Prospects come from list research (Apollo-style exports: name, title, company, email + email status, up to six phone types, LinkedIn/company URLs, country, state, timezone, employees, industry). Imported via CSV from their Google Sheet.
- Outreach is a fixed sequence of steps per lead (email and LinkedIn), each with a due date; reps copy the message, send it in Gmail/LinkedIn, then mark it sent.
- Calls are logged with the number called, an outcome (disposition), notes and an optional callback date. Outcomes in the incumbent tool include Interested and Email requested; those feed follow-up lists.
- Lead status: Inactive, Active, Paused, Bad. Sequence disposition: None, Bounced, Requested to unsubscribe, Replied, Meeting booked.
- Team covers US, UK and APAC business hours; the prospect's local time matters before dialling.

## Capabilities and Constraints

In scope for the POC (confirmed): sign-in with admin and rep roles; lead list with search/filters; lead detail; bulk assign owner; lead status and disposition; basic outreach sequence (fixed steps, editable templates, due dates, mark sent); call logging with outcome, notes, callback; comments/activity timeline; today queue of due and overdue work; simple dashboard; CSV import.

Out of scope: sending email or LinkedIn messages from the app, daily send-capacity limits, spreadsheet formula console, billing, external integrations.

## Brand Commitments

- Name: DealWorkx (formerly TheHaub; never use the old name).
- Voice from dealworkx.com: plain, specific, unhyped. Short declarative sentences; concrete numbers over adjectives ("First meetings inside thirty days").
- Public site uses Inter Tight (display) and Inter (text), ink #14181a on paper #f8faf9, deep green accent #0f5a48 with brighter #2f9e6a and mint #6ecb9a. The internal tool deliberately does not copy it (see next line).
- Standing preference (user, 2026-11-17, final): the UI copies the user's "JV Outreach" CRM reference screenshot, built on shadcn/ui (Tailwind v4, Inter, blue primary). That means a light-grey sidebar with a "Menu" label, a light-blue active item and a user card at the bottom; a top bar with the page title, search, refresh and avatar menu; then on each page a toolbar row (search left, filters and a blue primary button right), three stat cards with coloured icon tiles and a "…" menu, segmented tabs, a bordered table with uppercase headers, grey dot pills and a call / email / "…" action column, and numbered pagination. The sidebar holds exactly the old Apps Script tabs, in order: Console, Lead List, Interested Leads, Email Requested, Recorded Call History, Call Pipeline, Daily Dashboard. Admin tools live in the user menu. Never invent data for the reference's decorations (no fake trend percentages).

## Evidence on Hand

- Incumbent tool source: `Code.gs`, `index.html`, `appsscript.json`.
- No real prospect data in the repo. Demo data in the POC is synthetic and must be labeled as such; do not invent client names, results or metrics.

## Product Principles

1. The next action is always one click away: what's due, for whom, and how to do it.
2. Record what happened in seconds; the log is the source of truth, not a rep's memory.
3. Reps see only what they own or can claim; admins see the whole desk.
4. Keep the sequence honest: a step is sent when someone marks it sent, never assumed.
