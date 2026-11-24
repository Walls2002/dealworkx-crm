---
name: DealWorkx CRM
description: A copy of the user's "JV Outreach" CRM reference, built on shadcn/ui.
system: "shadcn/ui (radix-nova), Tailwind v4, Inter, primary blue oklch(0.585 0.195 258)"
---

# DealWorkx CRM design

On 2026-11-17 the user asked to copy a reference screenshot (a "JV Outreach" CRM). Match it; don't reinterpret it.

## Shell
- **Sidebar** (`components/app-sidebar.tsx`), light grey: the logo (`components/logo.tsx`: a vector DX mark redrawn from the brand logo, ink D and green X, beside the plain wordmark "DealWorkx": one line, 17px semibold, -0.02em tracking; no spaced capitals, no coloured letter, no tagline), a "Menu" label, then exactly the
  7 old tabs (Console, Lead List, Interested Leads, Email Requested, Recorded Call History, Call Pipeline, Daily Dashboard),
  each 36px with 13px text. The active item is light blue with blue text, and counts sit on the right. A bordered user card at the
  bottom opens the account menu (Sequence, Import, Sign out).
- **Top bar** (`components/site-header.tsx`), 56px: page title, search (Ctrl K), refresh, avatar + name + chevron (same menu).

## Page anatomy (`components/page.tsx`)
1. `Toolbar`: `SearchBox` on the left; `FilterSelect`s, a "Jump to" dropdown and the blue primary button on the right.
2. `StatGrid` of three `StatCard`s: a coloured 28px icon tile, title, a "…" menu with one real link, a big number and one line of
   context. Only real data; no invented trends.
3. `Segments`: grey segmented tabs (white active segment), used for task status, lead status, follow-up lists and call outcomes.
4. `DataTable`: a bordered rounded table with `TH` uppercase 11px headers, 48px rows, a small avatar with a single-line name,
   `Pill` badges (grey with a coloured dot; tinted red or amber for overdue / today), and a `RowActions` column (call, Gmail,
   "…" menu with Details, Call history and LinkedIn).
5. `Pager`: Previous on the left, numbered pages in the middle (active page blue), Next on the right.

## Lead record
A right-hand shadcn `Sheet` (`components/lead-sheet.tsx`) driven by the `?lead=` parameter. Since 2026-11-25 it is wide
(`max-w-2xl`, then up to 68rem from `lg`) and split into two independently scrolling columns: **doing** on the left
(identity, phones with copy buttons, links, then one action box with `Tabs` for Log call / Comment / Status / Assign, each
with its own save button, then the activity timeline) and **knowing** on the right (current step + sequence, details).
Below `lg` the columns dissolve into one column ordered identity, actions, current step, activity, details. `components/ui/tabs.tsx`
is Radix Tabs styled like `Segments`; inactive panels stay mounted so drafts survive tab switches.

## Additions (2026-11-20)
- **Sidebar** collapses to an icon rail (`collapsible="icon"`): header toggle, Ctrl+B, state kept in the `sidebar_state` cookie, tooltips on every item. Admins get one more item, **Team**, in a separate "Admin" group under the 7 tabs.
- **Sign-in screens** (`components/auth-shell.tsx`, `auth-styles.ts`): the user chose the "professional" theme here only. Poppins, yellow `#FECE14` fills with black text, ink `#111827`, black focus rings (yellow is too faint on white). Black brand panel left (DX lockup, "Work the list. Book the meeting."), form right; panel hidden on phones.
