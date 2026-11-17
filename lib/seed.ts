import type { Db } from "./db";
import { addDays, todayISO } from "./dates";
import { hashPassword } from "./password";
import { scheduleSteps } from "./sequence";

/**
 * Synthetic demo data. Every company, person, email (.example) and phone number
 * (fictional ranges) here is made up. Runs once, on an empty database.
 */
export const DEMO_PASSWORD = "dealworkx";

const USERS = [
  { email: "ryan.l@dealworkx.com", name: "Ryan", role: "admin" },
  { email: "evans.s@dealworkx.com", name: "Evans", role: "admin" },
  { email: "admin@dealworkx.com", name: "Wally", role: "rep" },
] as const;

const PAIN_POINTS = [
  "Pipeline coverage below target for next quarter",
  "New SDR hires taking six months to ramp",
  "Replies falling on the current outbound sequences",
  "Account executives spending selling time on list building",
  "Booked meetings no-showing before they reach an AE",
];

const STEPS = [
  {
    step: 1, channel: "Email", offset: 0,
    subject: "{{pain_point}} at {{company}}",
    body: `Hi {{first_name}},

Most {{title}}s I speak with at companies like {{company}} are dealing with one thing this quarter: {{pain_point}}.

We run researched outbound for B2B teams and book qualified meetings straight onto reps' calendars. First meetings usually land inside thirty days.

Worth a 20-minute call to see if it fits?

{{sender}}
DealWorkx`,
  },
  {
    step: 1, channel: "LinkedIn", offset: 0, subject: "",
    body: `Hi {{first_name}}, I work with B2B teams on outbound and meeting booking. Saw your work at {{company}} and would like to connect.`,
  },
  {
    step: 2, channel: "Email", offset: 3,
    subject: "Re: {{pain_point}} at {{company}}",
    body: `Hi {{first_name}},

Following up on my note. Building an in-house SDR desk takes months before the first meeting lands. We start booking in thirty days, on domains we own, so your sending reputation stays clean.

Open to a short call next week?

{{sender}}`,
  },
  {
    step: 3, channel: "LinkedIn", offset: 6, subject: "",
    body: `Thanks for connecting, {{first_name}}. If {{pain_point}} is on your list this quarter, I can share how we've approached it for similar teams. Happy to send a one-page summary.`,
  },
  {
    step: 4, channel: "Email", offset: 10,
    subject: "Closing the loop",
    body: `Hi {{first_name}},

I haven't heard back, so I'll assume the timing isn't right. If outbound pipeline comes up later this year, reply to this email and I'll pick it up from there.

{{sender}}`,
  },
] as const;

const FIRST = ["Maya", "Liam", "Ava", "Noah", "Isla", "Ethan", "Zara", "Oliver", "Chloe", "Arjun", "Hannah", "Lucas", "Mei", "Jack", "Sofia", "Daniel", "Priya", "Tom", "Grace", "Ravi", "Elena", "Ben", "Aisha", "Sam", "Nora", "Felix", "Leah", "Owen", "Ines", "Marcus"];
const LAST = ["Chen", "Walsh", "Patel", "Murphy", "Okafor", "Lindqvist", "Tan", "Reid", "Novak", "Hughes", "Moreno", "Kaur", "Brennan", "Sato", "Fischer", "Clarke", "Nguyen", "Doyle", "Haddad", "Larsen", "Ong", "Byrne", "Silva", "Kim"];
const COMPANY_A = ["Halcyon", "Copperline", "Tidewater", "Brightpath", "Northgate", "Ironbark", "Lumen", "Keystone", "Bluefern", "Quarry", "Sablewood", "Meridian", "Harbourline", "Cinder", "Pinecrest", "Driftwood", "Granite", "Wavelength"];
const COMPANY_B = ["Data", "Security", "Cloud", "Labs", "Systems", "Analytics", "Ops", "Stack", "Signal", "Works"];
const TITLES = ["VP of Sales", "Head of Growth", "Chief Revenue Officer", "Director of Sales Development", "VP Marketing", "Head of Revenue Operations", "Founder & CEO", "Sales Director"];
const INDUSTRIES = ["Developer Tooling & DevOps", "Data Infrastructure & Analytics", "Cloud Security & Compliance", "B2B SaaS & Enterprise Platforms", "AI Code Generation & Testing"];
const EMPLOYEES = ["11-50", "51-200", "51-200", "201-500", "501-1000"];
const PLACES = [
  { country: "United States", state: "New York", timezone: "America/New_York", phone: (n: number) => `+1 212 555 01${pad(n % 100)}` },
  { country: "United States", state: "Illinois", timezone: "America/Chicago", phone: (n: number) => `+1 312 555 01${pad(n % 100)}` },
  { country: "United States", state: "California", timezone: "America/Los_Angeles", phone: (n: number) => `+1 415 555 01${pad(n % 100)}` },
  { country: "United Kingdom", state: "England", timezone: "Europe/London", phone: (n: number) => `+44 20 7946 0${pad3(n % 1000)}` },
  { country: "Ireland", state: "Dublin", timezone: "Europe/Dublin", phone: (n: number) => `+353 1 555 01${pad(n % 100)}` },
  { country: "Australia", state: "New South Wales", timezone: "Australia/Sydney", phone: (n: number) => `+61 2 5550 1${pad3(n % 1000)}` },
  { country: "Singapore", state: "", timezone: "Asia/Singapore", phone: (n: number) => `+65 6555 01${pad(n % 100)}` },
  { country: "Sweden", state: "Stockholm", timezone: "Europe/Stockholm", phone: (n: number) => `+46 8 555 01${pad(n % 100)}` },
];
const OUTCOME_NOTES: Record<string, string> = {
  "No answer": "",
  "Left voicemail": "Left a short voicemail referencing the email.",
  "Gatekeeper": "EA answered. Asked to send details by email first.",
  "Call back later": "In a board meeting. Asked for a call later in the week.",
  "Email requested": "Asked for a one-page summary by email before taking a call.",
  "Interested": "Pipeline is a real problem for Q1. Wants to see how ramp works.",
  "Not interested": "Already working with an agency until the end of the year.",
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function pad3(n: number) { return String(n).padStart(3, "0"); }

// Deterministic PRNG so every fresh database looks the same.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * First start on an empty database. Always creates the team, pain points and sequence.
 * Demo mode also adds synthetic leads and uses the shared demo password; otherwise
 * INITIAL_PASSWORD must be set and no leads are invented.
 */
export async function seedDatabase(db: Db, demo: boolean): Promise<void> {
  const rand = rng(20261113);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const today = todayISO();
  const password = demo ? DEMO_PASSWORD : process.env.INITIAL_PASSWORD?.trim();
  if (!password || password.length < 10 && !demo) {
    throw new Error("Set INITIAL_PASSWORD (10+ characters) for the first admin sign-ins, or set DEMO_MODE=1 for demo data.");
  }
  const hash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const userIds: number[] = [];
    for (const u of USERS) {
      const [row] = await tx.query<{ id: number }>(
        "insert into users (email, name, role, password_hash) values ($1, $2, $3, $4) returning id",
        [u.email, u.name, u.role, hash],
      );
      userIds.push(row.id);
    }
    for (const label of PAIN_POINTS) await tx.query("insert into pain_points (label) values ($1)", [label]);
    for (const [i, s] of STEPS.entries()) {
      await tx.query(
        "insert into sequence_steps (position, step_number, channel, day_offset, subject, body) values ($1, $2, $3, $4, $5, $6)",
        [i + 1, s.step, s.channel, s.offset, s.subject, s.body],
      );
    }
    if (!demo) return;
    const steps = await tx.query<{ id: number; day_offset: number; step_number: number; channel: string }>("select id, day_offset, step_number, channel from sequence_steps order by position");

    // Owners: Wally carries the biggest book, the admins hold a few each, the rest wait unassigned.
    const [ryan, evans, wally] = userIds;
    const ownerPlan = [...Array(26).fill(wally), ...Array(7).fill(ryan), ...Array(6).fill(evans), ...Array(45).fill(null)];
    const usedEmails = new Set<string>();

    for (const [n, ownerId] of ownerPlan.entries()) {
      let first = pick(FIRST), last = pick(LAST);
      const companyName = `${pick(COMPANY_A)} ${pick(COMPANY_B)}`;
      const domain = companyName.toLowerCase().replace(/[^a-z]/g, "") + ".example";
      let email = `${first}.${last}@${domain}`.toLowerCase();
      while (usedEmails.has(email)) { first = pick(FIRST); last = pick(LAST); email = `${first}.${last}@${domain}`.toLowerCase(); }
      usedEmails.add(email);
      const place = pick(PLACES);
      const hasMobile = rand() > 0.35;
      const activated = ownerId ? addDays(today, -Math.floor(rand() * 13)) : null;
      const pain = ownerId ? pick(PAIN_POINTS) : "";

      const [lead] = await tx.query<{ id: number }>(
        `insert into leads (first_name, last_name, title, company, email, email_status, phone_work, phone_mobile, phone_company,
                            linkedin_url, website, industry, employees, country, state, timezone,
                            owner_id, status, pain_point, activated_on, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now() - make_interval(days => $21::int))
         returning id`,
        [
          first, last, pick(TITLES), companyName, email, rand() > 0.15 ? "Verified" : "Unverified",
          place.phone(n * 7 + 3), hasMobile ? place.phone(n * 13 + 51) : "", rand() > 0.5 ? place.phone(n * 3 + 900) : "",
          `https://www.linkedin.com/in/${first}-${last}-demo`.toLowerCase(), `https://${domain}`,
          pick(INDUSTRIES), pick(EMPLOYEES), place.country, place.state, place.timezone,
          ownerId, ownerId ? "Active" : "Inactive", pain, activated, 20 + (n % 9),
        ],
      );
      if (!ownerId || !activated) continue;

      await tx.query("insert into activities (lead_id, user_id, kind, body, created_at) values ($1, $2, 'assign', $3, least($4::date + time '09:00', now() - interval '3 hours'))",
        [lead.id, userIds[0], `Assigned with pain point "${pain}"`, activated]);
      await scheduleSteps(tx, lead.id, activated);

      // Mark most past-due steps as sent, leaving a few overdue so the queue has real work in it.
      for (const s of steps) {
        const due = addDays(activated, s.day_offset);
        if (due < today && rand() > 0.08) {
          await tx.query("update lead_steps set sent_at = least($3::date + time '10:30', now() - interval '2 hours'), sent_by = $4 where lead_id = $1 and step_id = $2", [lead.id, s.id, due, ownerId]);
          await tx.query("insert into activities (lead_id, user_id, kind, body, created_at) values ($1, $2, 'step', $3, least($4::date + time '10:30', now() - interval '2 hours'))",
            [lead.id, ownerId, `Sent Step ${s.step_number} · ${s.channel}`, due]);
        } else if (due < today) {
          break; // sequence stalls at the first unsent step
        }
      }

      // A couple of calls per worked lead.
      const callCount = Math.floor(rand() * 3);
      for (let c = 0; c < callCount; c++) {
        const outcome = pick(["No answer", "No answer", "Left voicemail", "Gatekeeper", "Call back later", "Email requested", "Interested", "Not interested"]);
        const daysAgo = Math.floor(rand() * 4);
        const callback = outcome === "Call back later" || outcome === "Interested" ? addDays(today, Math.floor(rand() * 4) - 1) : null;
        await tx.query(
          `insert into activities (lead_id, user_id, kind, outcome, phone, body, callback_on, created_at)
           values ($1, $2, 'call', $3, 'Work phone', $4, $5, now() - make_interval(days => $6::int, mins => $7::int))`,
          [lead.id, ownerId, outcome, OUTCOME_NOTES[outcome] ?? "", callback, daysAgo, 20 + Math.floor(rand() * 400)],
        );
        if (callback) await tx.query("update leads set callback_on = $2 where id = $1", [lead.id, callback]);
        if (outcome === "Not interested") await tx.query("update leads set status = 'Paused' where id = $1", [lead.id]);
      }
      if (rand() > 0.88) await tx.query("update leads set disposition = 'Meeting booked' where id = $1", [lead.id]);
      else if (rand() > 0.85) await tx.query("update leads set disposition = 'Replied' where id = $1", [lead.id]);
    }
  });
}
