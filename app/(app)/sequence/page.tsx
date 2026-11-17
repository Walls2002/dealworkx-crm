import { requireUser } from "@/lib/auth";
import { dailyLimits, listCallOutcomes, listPainPoints, listSteps } from "@/lib/data";
import { MERGE_FIELDS } from "@/lib/sequence";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelIcon } from "@/components/icons";
import { Page, PageHeader } from "@/components/page";
import { CallOutcomesForm, DailyLimitsForm, PainPointsForm, StepEditor } from "./forms";

export const metadata = { title: "Sequence" };

export default async function SequencePage() {
  const user = await requireUser();
  const [steps, painPoints, limits, outcomes] = await Promise.all([listSteps(), listPainPoints(), dailyLimits(), listCallOutcomes()]);
  const admin = user.role === "admin";
  const code = "rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground";

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Outreach sequence"
        description={
          <>
            Every assigned lead runs these steps in order; send day counts from the day the lead is assigned. Merge fields:{" "}
            {MERGE_FIELDS.map((f, i) => <span key={f}>{i ? " " : ""}<code className={code}>{`{{${f}}}`}</code></span>)}, where <code className={code}>{"{{sender}}"}</code> is the lead&rsquo;s owner.
            {!admin && " Only admins can edit the sequence."}
          </>
        }
      />

      <div className="grid gap-4">
        {steps.map((s) =>
          admin ? (
            <StepEditor key={s.id} step={{ id: s.id, stepNumber: s.step_number, channel: s.channel, dayOffset: s.day_offset, subject: s.subject, body: s.body, subjectTitled: s.subject_titled ?? "", bodyTitled: s.body_titled ?? "" }} />
          ) : (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ChannelIcon channel={s.channel} className="size-4" /> Step {s.step_number} · {s.channel} <Badge variant="secondary">Day {s.day_offset}</Badge></CardTitle>
                {s.subject && <CardDescription>Subject: {s.subject}</CardDescription>}
              </CardHeader>
              <CardContent><pre className="font-sans text-sm whitespace-pre-wrap">{s.body}</pre></CardContent>
            </Card>
          ),
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1 pain points</CardTitle>
          <CardDescription>Admins pick one when assigning a lead; it fills <code className={code}>{"{{pain_point}}"}</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          {admin ? <PainPointsForm painPoints={painPoints} /> : <ul className="list-disc pl-5 text-sm">{painPoints.map((p) => <li key={p}>{p}</li>)}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Call outcomes</CardTitle>
          <CardDescription>
            The choices reps pick from when they log a call (the old SETTINGS list). &ldquo;Interested&rdquo;, &ldquo;Email requested&rdquo; and
            &ldquo;Meeting booked&rdquo; must stay: the follow-up tabs and meeting tracking use them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admin ? <CallOutcomesForm outcomes={outcomes} /> : <ul className="list-disc pl-5 text-sm">{outcomes.map((o) => <li key={o}>{o}</li>)}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily limits</CardTitle>
          <CardDescription>
            How many new leads one owner can start per day. Every new lead counts for Email; only leads on the "Email + LinkedIn" plan count for LinkedIn.
            The assign bar shows each owner&rsquo;s count and warns when a batch goes over; it never blocks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admin ? (
            <DailyLimitsForm email={limits.email} linkedin={limits.linkedin} />
          ) : (
            <p className="text-sm tabular-nums">Email: {limits.email ?? "no limit"} · LinkedIn: {limits.linkedin ?? "no limit"}</p>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
