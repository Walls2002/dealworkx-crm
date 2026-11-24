"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Upload } from "lucide-react";
import { importLeads, previewImport, type FlaggedRow, type ImportState, type PreviewState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable, TH } from "@/components/page";
import { Pill } from "@/components/badges";
import { Status } from "@/components/lead-forms";

const RESULT: Record<FlaggedRow["kind"], string> = {
  definite: "Duplicate (skipped)",
  update: "Updates the existing lead",
  possible: "Possible duplicate (you decide)",
};

type Decision = "skip" | "new" | "update";

/** The flagged rows as a CSV that opens in Excel, so the duplicates can be checked before importing. */
function downloadFlagged(rows: FlaggedRow[], file: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ["Sheet", "Row", "Name", "Company", "Email", "Result", "Reason", "Matches"].map(esc).join(","),
    ...rows.map((r) => [r.sheet, r.row, r.name, r.company, r.email, RESULT[r.kind], r.reason, r.matches].map(esc).join(",")),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `duplicates - ${file.replace(/\.(xlsx|csv)$/i, "")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Two steps: "Check file" reads the workbook, compares every sheet with the template and every row with the CRM;
 * "Import" sends the same file again with the ticked sheets and any possible duplicates to import anyway.
 * The File is kept in state (React resets form inputs after an action), and each step builds its own FormData.
 */
export function ImportForm() {
  const [preview, check, checking] = useActionState<PreviewState, FormData>(previewImport, null);
  const [result, run, importing] = useActionState<ImportState, FormData>(importLeads, null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [file, setFile] = useState<File | null>(null);
  const [possPage, setPossPage] = useState(1);
  const POSS = 50;

  // Pre-tick every sheet that follows the template and has something to bring in; possible duplicates start as "skip".
  useEffect(() => {
    setPicked(new Set((preview?.sheets ?? []).filter((s) => !s.missingRequired.length && s.fresh + s.updates + s.possible > 0).map((s) => s.name)));
    setDecisions(new Map());
    setPossPage(1);
  }, [preview]);

  function send(action: (fd: FormData) => void, extra?: { sheets: string[]; decisions: Map<string, Decision> }) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    extra?.sheets.forEach((s) => fd.append("sheets", s));
    extra?.decisions.forEach((d, k) => { if (d === "new") fd.append("allow", k); if (d === "update") fd.append("override", k); });
    startTransition(() => action(fd));
  }

  const sheets = preview?.sheets ?? [];
  const flagged = preview?.flagged ?? [];
  const possible = useMemo(() => flagged.filter((f) => f.kind === "possible" && picked.has(f.sheet)), [flagged, picked]);
  const updates = useMemo(() => flagged.filter((f) => f.kind === "update" && picked.has(f.sheet)), [flagged, picked]);
  const decided = (d: Decision) => possible.filter((f) => decisions.get(f.key) === d).length;
  const chosenSheets = sheets.filter((s) => picked.has(s.name));
  const newCount = chosenSheets.reduce((n, s) => n + s.fresh, 0) + decided("new");
  const updateCount = chosenSheets.reduce((n, s) => n + s.updates, 0) + decided("update");
  const setAll = (d: Decision, ok: (f: FlaggedRow) => boolean) =>
    setDecisions(new Map(possible.map((f) => [f.key, ok(f) ? d : "skip"] as [string, Decision])));
  const busy = checking || importing;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="leads-file">Leads workbook</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="leads-file"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="max-w-md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" onClick={() => send(check)} disabled={busy || !file}>
            <FileSpreadsheet /> {checking ? "Checking…" : "Check file"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A leads workbook (.xlsx) or CSV, up to 30 MB. Every sheet is checked against the template and every row against the CRM before anything is saved.
        </p>
        {preview?.error && <Status state={{ error: preview.error }} />}
      </div>

      {sheets.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">1. Choose the sheets</h3>
              <p className="text-xs text-muted-foreground">{preview?.file}: {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}. Counts assume the sheets are imported together, top to bottom.</p>
            </div>
            {flagged.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => downloadFlagged(flagged, preview?.file ?? "upload")}>
                <Download /> Download duplicates list ({flagged.length})
              </Button>
            )}
          </div>
          <DataTable>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(TH, "w-10 pl-4")}><span className="sr-only">Import</span></TableHead>
                <TableHead className={TH}>Sheet</TableHead>
                <TableHead className={TH}>Template</TableHead>
                <TableHead className={cn(TH, "text-right")}>Rows</TableHead>
                <TableHead className={cn(TH, "text-right")}>New</TableHead>
                <TableHead className={cn(TH, "text-right")}>Updates</TableHead>
                <TableHead className={cn(TH, "text-right")}>Duplicates</TableHead>
                <TableHead className={cn(TH, "text-right")}>Possible</TableHead>
                <TableHead className={cn(TH, "pr-4 text-right")}>Email check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheets.map((s) => {
                const ok = s.missingRequired.length === 0;
                return (
                  <TableRow key={s.name} className="h-12">
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={`Import ${s.name}`}
                        disabled={!ok || s.fresh + s.updates + s.possible === 0}
                        checked={picked.has(s.name)}
                        onCheckedChange={(on) => setPicked((p) => { const n = new Set(p); on ? n.add(s.name) : n.delete(s.name); return n; })}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="whitespace-normal">
                      {ok ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700"><CircleCheck className="size-3.5" /> {s.matched} of 65 columns</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose-700"><CircleAlert className="size-3.5" /> Missing {s.missingRequired.join(", ")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.rows}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{s.fresh}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", s.updates ? "font-medium text-blue-700" : "text-muted-foreground")}>{s.updates}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{s.duplicates}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", s.possible ? "font-medium text-amber-700" : "text-muted-foreground")}>{s.possible}</TableCell>
                    <TableCell className="pr-4 text-right whitespace-normal">
                      {s.invalidEmail > 0 && <Pill dot="bg-rose-500" className="bg-rose-50 text-rose-700">{s.invalidEmail} invalid</Pill>}{" "}
                      {s.unverifiedEmail > 0 && <Pill dot="bg-amber-500" className="bg-amber-50 text-amber-800">{s.unverifiedEmail} unverified</Pill>}
                      {!s.invalidEmail && !s.unverifiedEmail && <span className="text-muted-foreground">All verified</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Updates</span> match a lead already in the CRM on at least 3 of: email, mobile phone, other phone, first + last name
              (a phone blank on both counts). The new row replaces that lead&rsquo;s uploaded details; blank cells keep the old value. Owner, status, sequence, calls and comments stay.
            </li>
            <li><span className="font-medium text-foreground">Duplicates</span> have the same email, contact ID or LinkedIn profile as a lead already in the CRM or earlier in the file, without 3 of the 4 matching. They are skipped.</li>
            <li><span className="font-medium text-foreground">Possible duplicates</span> match on 2 of the 4, or share a name and company or a personal phone number. You decide below.</li>
            <li><span className="font-medium text-foreground">Invalid emails</span> are imported with lead status Bad so nobody emails them. Unverified ones are imported with an &ldquo;Unverified&rdquo; tag.</li>
          </ul>
        </section>
      )}

      {updates.length > 0 && (
        <section className="grid gap-2">
          <div>
            <h3 className="text-sm font-semibold">2. Leads that will be updated ({updates.length})</h3>
            <p className="text-xs text-muted-foreground">Each row matches an existing lead on 3 or 4 of the fields. Its filled cells replace that lead&rsquo;s details.</p>
          </div>
          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">Show the {updates.length} {updates.length === 1 ? "row" : "rows"} and what matched</summary>
            <ul className="grid max-h-80 gap-2 overflow-y-auto border-t px-4 py-3 text-[13px]">
              {updates.slice(0, 1000).map((f) => (
                <li key={f.key} className="grid gap-0.5">
                  <span><span className="font-medium">{f.name}</span> <span className="text-muted-foreground">· {f.sheet}, row {f.row} → updates {f.matches}</span></span>
                  <span className="text-xs text-muted-foreground">{f.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {possible.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{updates.length > 0 ? 3 : 2}. Review possible duplicates ({possible.length})</h3>
              <p className="text-xs text-muted-foreground">Skipped unless you choose otherwise. &ldquo;Update existing&rdquo; applies the row to the lead it matched; &ldquo;Import as new&rdquo; is for a different person.</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {possible.some((f) => f.canUpdate) && <Button type="button" variant="ghost" size="sm" onClick={() => setAll("update", (f) => f.canUpdate)}>Update all that match</Button>}
              {possible.some((f) => f.canImportNew) && <Button type="button" variant="ghost" size="sm" onClick={() => setAll("new", (f) => f.canImportNew)}>Import all as new</Button>}
              <Button type="button" variant="ghost" size="sm" onClick={() => setDecisions(new Map())}>Skip all</Button>
            </div>
          </div>
          <DataTable>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(TH, "pl-4")}>Row in the file</TableHead>
                <TableHead className={TH}>Why</TableHead>
                <TableHead className={TH}>Looks like</TableHead>
                <TableHead className={cn(TH, "pr-4 text-right")}>Do</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {possible.slice((possPage - 1) * POSS, possPage * POSS).map((f) => (
                <TableRow key={f.key} className="h-14">
                  <TableCell className="pl-4 whitespace-normal">
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{[f.company, f.email].filter(Boolean).join(" · ")} · {f.sheet}, row {f.row}</div>
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal"><Pill dot="bg-amber-500" className="bg-amber-50 text-amber-800">{f.reason}</Pill></TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{f.matches}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <NativeSelect
                      size="sm"
                      aria-label={`What to do with ${f.name}`}
                      value={decisions.get(f.key) ?? "skip"}
                      onChange={(e) => setDecisions((m) => new Map(m).set(f.key, e.target.value as Decision))}
                      className="ml-auto [&_select]:text-[13px]"
                    >
                      <NativeSelectOption value="skip">Skip</NativeSelectOption>
                      {f.canUpdate && <NativeSelectOption value="update">Update existing</NativeSelectOption>}
                      {f.canImportNew && <NativeSelectOption value="new">Import as new</NativeSelectOption>}
                    </NativeSelect>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
          {possible.length > POSS && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">Showing {((possPage - 1) * POSS + 1).toLocaleString("en-US")}–{Math.min(possPage * POSS, possible.length).toLocaleString("en-US")} of {possible.length.toLocaleString("en-US")}</span>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" disabled={possPage <= 1} onClick={() => setPossPage((p) => p - 1)}>Previous</Button>
                <span className="px-2 tabular-nums">{possPage} / {Math.ceil(possible.length / POSS)}</span>
                <Button type="button" variant="outline" size="sm" disabled={possPage >= Math.ceil(possible.length / POSS)} onClick={() => setPossPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {sheets.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => send(run, { sheets: [...picked], decisions })} disabled={busy || newCount + updateCount === 0 || !file}>
            <Upload /> {importing ? "Importing…" : [
              newCount || !updateCount ? `Import ${newCount} new ${newCount === 1 ? "lead" : "leads"}` : "",
              updateCount ? `${newCount ? "update" : "Update"} ${updateCount} existing` : "",
            ].filter(Boolean).join(", ")}
          </Button>
          <span className="text-xs text-muted-foreground">New leads arrive unassigned in the Lead List. The check runs again while saving, so nothing slips in twice.</span>
        </div>
      )}

      <Status state={result ? { ok: result.ok, error: result.error } : null} />
      {result?.updated && result.updated.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">{result.updated.length} updated leads and what changed</summary>
          <ul className="mt-2 max-h-64 list-disc overflow-auto pl-5">
            {result.updated.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </details>
      )}
      {result?.skipped && result.skipped.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">{result.skipped.length} skipped rows</summary>
          <ul className="mt-2 max-h-64 list-disc overflow-auto pl-5">
            {result.skipped.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
