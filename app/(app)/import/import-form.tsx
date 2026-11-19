"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Upload } from "lucide-react";
import { importLeads, previewImport, type FlaggedRow, type ImportState, type PreviewState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable, TH } from "@/components/page";
import { Pill } from "@/components/badges";
import { Status } from "@/components/lead-forms";

/** The flagged rows as a CSV that opens in Excel, so the duplicates can be checked before importing. */
function downloadFlagged(rows: FlaggedRow[], file: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ["Sheet", "Row", "Name", "Company", "Email", "Result", "Reason", "Matches"].map(esc).join(","),
    ...rows.map((r) => [r.sheet, r.row, r.name, r.company, r.email, r.kind === "definite" ? "Duplicate (skipped)" : "Possible duplicate", r.reason, r.matches].map(esc).join(",")),
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
  const [allow, setAllow] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [possPage, setPossPage] = useState(1);
  const POSS = 50;

  // Pre-tick every sheet that follows the template and has new leads; possible duplicates start as "skip".
  useEffect(() => {
    setPicked(new Set((preview?.sheets ?? []).filter((s) => !s.missingRequired.length && s.fresh + s.possible > 0).map((s) => s.name)));
    setAllow(new Set());
    setPossPage(1);
  }, [preview]);

  function send(action: (fd: FormData) => void, extra?: { sheets: string[]; allow: string[] }) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    extra?.sheets.forEach((s) => fd.append("sheets", s));
    extra?.allow.forEach((k) => fd.append("allow", k));
    startTransition(() => action(fd));
  }

  const sheets = preview?.sheets ?? [];
  const flagged = preview?.flagged ?? [];
  const possible = useMemo(() => flagged.filter((f) => f.kind === "possible" && picked.has(f.sheet)), [flagged, picked]);
  const allowedHere = possible.filter((f) => allow.has(f.key)).length;
  const total = sheets.filter((s) => picked.has(s.name)).reduce((n, s) => n + s.fresh, 0) + allowedHere;
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
                        disabled={!ok || s.fresh + s.possible === 0}
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
            <li><span className="font-medium text-foreground">Duplicates</span> have the same email, contact ID or LinkedIn profile as a lead already in the CRM or earlier in the file. They are always skipped.</li>
            <li><span className="font-medium text-foreground">Possible duplicates</span> share a name and company, or a personal phone number, but not the email. You decide below.</li>
            <li><span className="font-medium text-foreground">Invalid emails</span> are imported with lead status Bad so nobody emails them. Unverified ones are imported with an &ldquo;Unverified&rdquo; tag.</li>
          </ul>
        </section>
      )}

      {possible.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">2. Review possible duplicates ({possible.length})</h3>
              <p className="text-xs text-muted-foreground">Skipped unless you tick &ldquo;Import anyway&rdquo;. Tick only when they are a different person.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAllow(new Set(possible.map((f) => f.key)))}>Import all anyway</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAllow(new Set())}>Skip all</Button>
            </div>
          </div>
          <DataTable>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(TH, "pl-4")}>Row in the file</TableHead>
                <TableHead className={TH}>Why</TableHead>
                <TableHead className={TH}>Looks like</TableHead>
                <TableHead className={cn(TH, "pr-4 text-right")}>Import anyway</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {possible.slice((possPage - 1) * POSS, possPage * POSS).map((f) => (
                <TableRow key={f.key} className="h-14">
                  <TableCell className="pl-4 whitespace-normal">
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{[f.company, f.email].filter(Boolean).join(" · ")} · {f.sheet}, row {f.row}</div>
                  </TableCell>
                  <TableCell><Pill dot="bg-amber-500" className="bg-amber-50 text-amber-800">{f.reason}</Pill></TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{f.matches}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Checkbox
                      aria-label={`Import ${f.name} anyway`}
                      checked={allow.has(f.key)}
                      onCheckedChange={(on) => setAllow((a) => { const n = new Set(a); on ? n.add(f.key) : n.delete(f.key); return n; })}
                    />
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
          <Button type="button" onClick={() => send(run, { sheets: [...picked], allow: [...allow] })} disabled={busy || total === 0 || !file}>
            <Upload /> {importing ? "Importing…" : `Import ${total} ${total === 1 ? "lead" : "leads"}`}
          </Button>
          <span className="text-xs text-muted-foreground">New leads arrive unassigned in the Lead List. The check runs again while saving, so nothing slips in twice.</span>
        </div>
      )}

      <Status state={result ? { ok: result.ok, error: result.error } : null} />
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
