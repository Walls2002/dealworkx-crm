import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { REQUIRED_HEADERS, TEMPLATE_HEADERS } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page, PageHeader } from "@/components/page";
import { ImportForm } from "./import-form";

export const metadata = { title: "Upload leads" };

export default async function ImportPage() {
  await requireAdmin();
  const required = new Set<string>(REQUIRED_HEADERS);
  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Upload new leads"
        description="Upload a leads workbook that follows the template. Every sheet in the workbook is checked first; you pick which sheets to import."
        actions={<Button variant="outline" size="sm" className="h-8" asChild><a href="/leads-template.xlsx" download><Download /> Download template</a></Button>}
      />
      <Card>
        <CardContent><ImportForm /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>The template</CardTitle>
          <CardDescription>
            The 65 template columns, matched by header name, so column order and extra columns don&rsquo;t matter. The six in bold are
            required. There is no timezone column; it is worked out from Country and State. Every column is kept and shows
            under &ldquo;All fields&rdquo; on the lead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid list-decimal gap-x-6 gap-y-1 pl-5 text-[13px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATE_HEADERS.map((h) => (
              <li key={h} className={required.has(h) ? "font-semibold text-foreground" : undefined}>{h}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </Page>
  );
}
