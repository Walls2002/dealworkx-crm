import Link from "next/link";
import { ArrowRight, Building2, Check, Globe, History, Mail, MessageSquareText, Phone, Send, SlidersHorizontal, Upload, UserPlus, X, ListChecks } from "lucide-react";
import type { Capacity, LeadDetail } from "@/lib/data";
import { dateTime, inlineDue, relativeDue, shortDate } from "@/lib/dates";
import { industryLabel } from "@/lib/format";
import { splitPhone, telHref } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LinkedInIcon } from "./icons";
import { LocalTime } from "./local-time";
import { Avatar } from "./avatar";
import { EmailCheckBadge, StatusBadge } from "./badges";
import { LeadSheet } from "./lead-sheet";
import { AssignForm, CopyButton, LeadSettingsForm, LogCallForm, NoteForm, StepButton } from "./lead-forms";
import { CurrentStep } from "./outreach";
import { RemoveLeads } from "./remove-leads";
import { LeadEmailActions } from "./send-email";
import { listCallOutcomes } from "@/lib/data";

type Props = {
  lead: LeadDetail;
  nextHref?: string | null;
  /** Where this lead sits in the open list, e.g. "Overdue · 2 of 28". */
  position?: string;
  today: string;
  closeHref: string;
  admin: boolean;
  users: { id: number; name: string }[];
  painPoints: string[];
  capacity?: Capacity | null;
};

function safeUrl(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function Section({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid content-start gap-4 px-6 py-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="shrink-0 text-sm font-semibold">{title}</h3>
        {aside && <div className="min-w-0 text-right text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/*
 * Layout. The record splits into two jobs: doing (who, how to reach them, record what happened, what was recorded)
 * and knowing (where the sequence stands, the facts). From lg up they are two columns that scroll independently,
 * so the action box at the top of the left column is always one glance away. Below lg the columns dissolve
 * (`contents`) and `order` interleaves them into one column: identity, actions, current step, activity, details.
 */
export async function LeadPanel({ lead, nextHref, position, today, closeHref, admin, users, painPoints, capacity }: Props) {
  const outcomes = await listCallOutcomes();
  const current = lead.steps.find((s) => s.dueOn && !s.sentAt && !s.skipped) ?? null;
  const sequenceLive = lead.status === "Active" && !["Meeting booked", "Bounced", "Requested to unsubscribe"].includes(lead.disposition);
  const linkedin = safeUrl(lead.linkedin), website = safeUrl(lead.website), companyLinkedin = safeUrl(lead.companyLinkedin);
  const callbackDue = lead.callbackOn ? relativeDue(lead.callbackOn, today) : null;
  const good = lead.disposition === "Meeting booked" || lead.disposition === "Replied";
  // CRM email is offered only where it would be accepted (the server checks the same rules).
  const mailable = lead.status !== "Bad" && lead.disposition !== "Bounced" && lead.disposition !== "Requested to unsubscribe";
  const phones = lead.phones.filter((p) => telHref(p.number));
  // Unassigned leads open on Assign for admins; everyone else who can write starts on Log call.
  const firstTab = admin && !lead.ownerId ? "assign" : lead.canWrite ? "call" : admin ? "assign" : null;

  return (
    <LeadSheet closeHref={closeHref}>
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 pl-6 backdrop-blur">
        <span className="truncate text-sm text-muted-foreground tabular-nums">{position ?? "Lead"}</span>
        <div className="flex items-center gap-1">
          {admin && !lead.removed && <RemoveLeads ids={[lead.id]} mode="remove" what={lead.name} className="mr-1" />}
          {nextHref ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={nextHref} scroll={false}>Next lead <ArrowRight /></Link>
            </Button>
          ) : position ? (
            <span className="px-2 text-xs text-muted-foreground">End of this list</span>
          ) : null}
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={closeHref} scroll={false} aria-label="Close"><X /></Link>
          </Button>
        </div>
      </div>

      {lead.removed && (
        <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900">
          <span>Removed from the list {dateTime(lead.removed.at)}{lead.removed.by ? ` by ${lead.removed.by}` : ""}. Its sequence is stopped.</span>
          {admin && <RemoveLeads ids={[lead.id]} mode="restore" what={lead.name} className="bg-background" />}
        </div>
      )}

      <div className="flex flex-col lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Doing */}
        <div className="max-lg:contents lg:min-h-0 lg:overflow-y-auto lg:[scrollbar-width:thin]">
          <div className="order-1 grid gap-4 px-6 pt-5 pb-5">
            <div className="flex items-center gap-4">
              <Avatar name={lead.name} size="lg" />
              <div className="min-w-0">
                <SheetTitle className="truncate text-xl font-semibold">{lead.name}</SheetTitle>
                <SheetDescription className="truncate">{[lead.title, lead.company].filter(Boolean).join(" at ") || "No title or company"}</SheetDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={lead.status} />
              <EmailCheckBadge status={lead.emailStatus} email={lead.email} />
              {lead.disposition !== "None" && (
                <Badge variant={good ? "outline" : "destructive"} className={cn(good && "border-green-300 bg-green-50 text-green-800")}>{lead.disposition}</Badge>
              )}
              {callbackDue && <Badge variant={callbackDue.tone === "overdue" ? "destructive" : "outline"}>Callback {inlineDue(callbackDue.label)}</Badge>}
              <Badge variant="outline" className="text-muted-foreground">Owner: <span className="text-foreground">{lead.ownerName ?? "Unassigned"}</span></Badge>
              <Badge variant="outline" className="text-muted-foreground">Channels: <span className="text-foreground">{lead.channelPlan}</span></Badge>
              <Badge variant="outline" className="text-muted-foreground"><LocalTime zone={lead.timezone} long /></Badge>
            </div>
            {phones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {phones.map((p) => {
                  const { main, ext } = splitPhone(p.number);
                  return (
                    <div key={p.label} className="inline-flex items-center rounded-lg border border-border bg-background dark:border-input dark:bg-input/30">
                      <Button variant="ghost" className="h-auto flex-col items-start gap-0 rounded-r-none py-1.5" asChild>
                        <a href={telHref(p.number)!} title={ext ? `Call ${p.label}, then dial extension ${ext}` : `Call ${p.label}`}>
                          <span className="text-[11px] font-normal text-muted-foreground">{p.label}</span>
                          <span className="tabular-nums">
                            {main}
                            {ext && <span className="ml-1.5 text-xs font-normal text-muted-foreground">ext {ext}</span>}
                          </span>
                        </a>
                      </Button>
                      {/* Copies the main number only, ready to paste into a dialer. */}
                      <CopyButton text={main} label={`Copy ${p.label.toLowerCase()}`} iconOnly className="mr-1 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            )}
            {(lead.email || linkedin || website || companyLinkedin) && (
              <div className="flex flex-wrap gap-2">
                {lead.email && <LeadEmailActions leadId={lead.id} email={lead.email} toName={lead.name} mail={mailable ? lead.mail : null} canWrite={lead.canWrite} />}
                {linkedin && (
                  <Button variant="outline" className="h-auto min-h-8" asChild>
                    <a href={linkedin} target="_blank" rel="noopener noreferrer"><LinkedInIcon className="size-4" /> LinkedIn</a>
                  </Button>
                )}
                {website && (
                  <Button variant="outline" className="h-auto min-h-8" asChild>
                    <a href={website} target="_blank" rel="noopener noreferrer"><Globe /> Website</a>
                  </Button>
                )}
                {companyLinkedin && (
                  <Button variant="outline" className="h-auto min-h-8" asChild>
                    <a href={companyLinkedin} target="_blank" rel="noopener noreferrer"><Building2 /> Company LinkedIn</a>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Every write on the record lives here, at the top, with its own save button. */}
          <section aria-label="Record what happened" className="order-2 border-y bg-muted/30 px-6 py-5">
            {firstTab ? (
              <Tabs defaultValue={firstTab}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TabsList aria-label="Actions">
                    {lead.canWrite && <TabsTrigger value="call"><Phone /> Log call</TabsTrigger>}
                    {lead.canWrite && <TabsTrigger value="note"><MessageSquareText /> Comment</TabsTrigger>}
                    {lead.canWrite && <TabsTrigger value="status"><SlidersHorizontal /> Status</TabsTrigger>}
                    {admin && <TabsTrigger value="assign"><UserPlus /> {lead.ownerId ? "Reassign" : "Assign"}</TabsTrigger>}
                  </TabsList>
                  <Link href={`/calls?for=${lead.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
                    <History className="size-3.5" /> Recorded call history
                  </Link>
                </div>
                {lead.canWrite && (
                  <>
                    <TabsContent value="call">
                      <LogCallForm leadId={lead.id} phones={lead.phones} today={today} outcomes={outcomes} />
                    </TabsContent>
                    <TabsContent value="note">
                      <NoteForm leadId={lead.id} />
                    </TabsContent>
                    <TabsContent value="status">
                      <LeadSettingsForm key={`${lead.status}|${lead.disposition}|${lead.channelPlan}`} leadId={lead.id} status={lead.status} disposition={lead.disposition} channelPlan={lead.channelPlan} />
                    </TabsContent>
                  </>
                )}
                {admin && (
                  <TabsContent value="assign" className="grid gap-3">
                    <p className="text-xs text-muted-foreground">{lead.ownerId ? `Currently ${lead.ownerName}.` : "Assigning starts the sequence today."}</p>
                    <AssignForm key={`${lead.ownerId}|${lead.painPoint}`} leadId={lead.id} users={users} painPoints={painPoints} ownerId={lead.ownerId} painPoint={lead.painPoint} capacity={capacity} />
                  </TabsContent>
                )}
              </Tabs>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Only the lead&rsquo;s owner or an admin can log calls. This lead is unassigned.</p>
                <Link href={`/calls?for=${lead.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
                  <History className="size-3.5" /> Recorded call history
                </Link>
              </div>
            )}
          </section>

          <Section className="order-4" title="Comments and activity" aside={<span className="tabular-nums">{lead.activities.length} {lead.activities.length === 1 ? "entry" : "entries"}</span>}>
            {lead.activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ol className="grid gap-4">
                {lead.activities.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground [&_svg]:size-3.5" aria-hidden>{ICONS[a.kind] ?? <ListChecks />}</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        {a.kind === "call" ? (
                          <><span className="font-medium">{a.outcome}</span>{a.phone ? ` · ${a.phone}` : ""}{a.callbackOn ? ` · callback ${shortDate(a.callbackOn)}` : ""}</>
                        ) : a.kind === "note" ? <span className="font-medium">Comment</span>
                          : a.kind === "email" ? <><span className="font-medium">Email sent{a.outcome ? ` · ${a.outcome}` : ""}</span>{a.subject ? ` · ${a.subject}` : ""}</>
                          : a.body}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.userName} · {dateTime(a.createdAt)}</p>
                      {(a.kind === "call" || a.kind === "note" || a.kind === "email") && a.body && (
                        <p className="mt-1.5 rounded-md bg-muted px-3 py-2 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{a.body}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* Knowing */}
        <div className="max-lg:contents lg:min-h-0 lg:overflow-y-auto lg:border-l lg:[scrollbar-width:thin]">
          <Section className="order-3 max-lg:border-b" title="Current step outreach" aside={lead.painPoint ? `Pain point: ${lead.painPoint}` : "No pain point set"}>
            {!lead.activatedOn ? (
              <p className="text-sm text-muted-foreground">Not started. {admin ? "Assign the lead to schedule its steps." : "An admin assigns leads and starts the sequence."}</p>
            ) : current && sequenceLive ? (
              <CurrentStep step={current} today={today} leadId={lead.id} canWrite={lead.canWrite} email={lead.email} toName={lead.name} linkedin={linkedin} mail={mailable ? lead.mail : null} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {!sequenceLive ? `Sequence paused while the lead is ${lead.disposition !== "None" ? lead.disposition.toLowerCase() : lead.status.toLowerCase()}.` : "Every step has been sent."}
              </p>
            )}
            {lead.activatedOn && (
              <ol className="divide-y text-sm" aria-label="All steps">
                {lead.steps.map((s) => {
                  const late = !s.sentAt && !s.skipped && !!s.dueOn && s.dueOn < today;
                  return (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", s.sentAt && "border-primary bg-primary text-primary-foreground", late && "border-destructive", s.id === current?.id && !late && "border-primary")} aria-hidden>
                        {s.sentAt && <Check className="size-3" />}
                      </span>
                      <span className={cn("font-medium", (s.sentAt || s.skipped) && "text-muted-foreground", s.skipped && "line-through")}>Step {s.stepNumber} · {s.channel}</span>
                      <span className={cn("ml-auto text-right text-xs", late ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {s.skipped ? "Skipped · Email only plan" : s.sentAt ? (
                          <span className="inline-flex items-center gap-1">
                            Sent {dateTime(s.sentAt)}{s.sentBy ? ` by ${s.sentBy}` : ""}
                            {lead.canWrite && <StepButton leadId={lead.id} stepId={s.id} label="Undo" undo />}
                          </span>
                        ) : s.dueOn ? `Due ${shortDate(s.dueOn)}` : "Not scheduled"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>

          <Section className="order-5 border-t" title="Details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ["Email", lead.email ? `${lead.email}${lead.emailStatus ? ` (${lead.emailStatus.toLowerCase()})` : ""}` : "", true],
                ["Seniority", lead.seniority],
                ["Departments", lead.departments],
                ["Industry", lead.industry ? industryLabel(lead.industry) : ""],
                ["Employees", lead.employees],
                ["Location", [lead.city, lead.state, lead.country].filter(Boolean).join(", "), true],
                ["Timezone", lead.timezone.replaceAll("_", " ")],
                ["Sequence started", lead.activatedOn ? shortDate(lead.activatedOn) : ""],
              ].map(([k, v, wide]) => (
                <div key={String(k)} className={cn("min-w-0", wide && "col-span-2")}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium [overflow-wrap:anywhere]">{v || <span className="font-normal text-muted-foreground">—</span>}</dd>
                </div>
              ))}
            </dl>
            {lead.sourceFields.length > 0 && (
              <details className="group rounded-lg border">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">View all {lead.sourceFields.length} uploaded fields</summary>
                <dl className="grid gap-x-6 gap-y-2 border-t px-4 py-3 text-[13px] sm:grid-cols-2">
                  {lead.sourceFields.map(([k, v], i) => (
                    <div key={`${k}-${i}`} className="min-w-0">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="[overflow-wrap:anywhere]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </Section>
        </div>
      </div>
    </LeadSheet>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  call: <Phone />,
  note: <MessageSquareText />,
  email: <Mail />,
  step: <Send />,
  assign: <UserPlus />,
  import: <Upload />,
};

LeadPanel.Missing = function Missing({ closeHref }: { closeHref: string }) {
  return (
    <LeadSheet closeHref={closeHref}>
      <div className="grid justify-items-center gap-2 px-6 py-20 text-center">
        <SheetTitle>Lead not available</SheetTitle>
        <SheetDescription>It may have been reassigned to someone else, or it no longer exists.</SheetDescription>
        <Button variant="outline" size="sm" className="mt-2" asChild>
          <Link href={closeHref} scroll={false}>Back to the list</Link>
        </Button>
      </div>
    </LeadSheet>
  );
}
