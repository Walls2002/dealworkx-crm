"use client";

import { useActionState, useMemo, useState } from "react";
import { saveCompanyDetails, saveSignature, type FormState } from "@/lib/actions";
import { signatureHtml, type SignatureData } from "@/lib/signature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Status } from "@/components/lead-forms";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Edit the signature with a live preview of exactly what recipients get. */
export function SignatureForm({ signature, admin }: { signature: SignatureData; admin: boolean }) {
  const [draft, setDraft] = useState(signature);
  const [mine, saveMine, savingMine] = useActionState<FormState, FormData>(saveSignature, null);
  const [company, saveCompany, savingCompany] = useActionState<FormState, FormData>(saveCompanyDetails, null);
  const set = (k: keyof SignatureData) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const preview = useMemo(() => signatureHtml(draft, ""), [draft]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-2" aria-labelledby="sig-preview">
        <h3 id="sig-preview" className="text-sm font-semibold">Preview</h3>
        <div className="overflow-x-auto rounded-xl border bg-white px-6 py-6" dangerouslySetInnerHTML={{ __html: preview }} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveMine} className="grid content-start gap-4 rounded-xl border bg-card p-5">
          <div>
            <h3 className="text-sm font-semibold">Your details</h3>
            <p className="text-xs text-muted-foreground">Signed in as {signature.name} &lt;{signature.email}&gt;.</p>
          </div>
          <Field id="sig-title" label="Job title">
            <Input id="sig-title" name="title" maxLength={120} value={draft.title} onChange={set("title")} placeholder="e.g. Business Development Manager" />
          </Field>
          <Field id="sig-phone" label="Phone" hint="Include the country code, e.g. +1 415 555 0101.">
            <Input id="sig-phone" name="phone" type="tel" maxLength={60} value={draft.phone} onChange={set("phone")} placeholder="+1 415 555 0101" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={savingMine}>{savingMine ? "Saving…" : "Save my details"}</Button>
            <Status state={mine} />
          </div>
        </form>

        <form action={saveCompany} className="grid content-start gap-4 rounded-xl border bg-card p-5">
          <div>
            <h3 className="text-sm font-semibold">Company details</h3>
            <p className="text-xs text-muted-foreground">{admin ? "Shown on everyone's signature." : "Shown on everyone's signature. Only an admin can change them."}</p>
          </div>
          <Field id="sig-company" label="Company name">
            <Input id="sig-company" name="company" maxLength={80} value={draft.company} onChange={set("company")} disabled={!admin} />
          </Field>
          <Field id="sig-website" label="Website">
            <Input id="sig-website" name="website" maxLength={200} value={draft.website} onChange={set("website")} disabled={!admin} placeholder="dealworkx.com" />
          </Field>
          <Field id="sig-address" label="Address" hint="Optional. Leave empty to hide the address row.">
            <Input id="sig-address" name="address" maxLength={200} value={draft.address} onChange={set("address")} disabled={!admin} />
          </Field>
          {admin && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={savingCompany}>{savingCompany ? "Saving…" : "Save company details"}</Button>
              <Status state={company} />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
