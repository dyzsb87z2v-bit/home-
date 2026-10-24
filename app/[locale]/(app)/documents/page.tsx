import { desc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteDocumentAction, uploadDocumentAction } from "@/app/actions/documents";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/form";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { formatDate, formatDateTime } from "@/lib/utils";

const TYPES = ["PAYSLIP", "EMPLOYMENT_CONTRACT", "SCHUFA", "RENT_DEBT_FREE_CERTIFICATE", "TENANT_SELF_DISCLOSURE", "IDENTIFICATION", "OTHER"] as const;

export default async function DocumentsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const docs = await getDb()
    .select({ id: schema.documents.id, type: schema.documents.type, filename: schema.documents.filename, sizeBytes: schema.documents.sizeBytes, createdAt: schema.documents.createdAt, retentionUntil: schema.documents.retentionUntil })
    .from(schema.documents)
    .where(eq(schema.documents.userId, user.id))
    .orderBy(desc(schema.documents.createdAt));
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("documents.title")} subtitle={t("documents.subtitle")} />
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <ActionForm action={uploadDocumentAction} submitLabel={t("documents.upload")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("documents.type")} htmlFor="type">
                <Select id="type" name="type">
                  {TYPES.map((x) => <option key={x} value={x}>{t(`documents.types.${x}`)}</option>)}
                </Select>
              </Field>
              <Field label={t("documents.retention")} htmlFor="retentionUntil"><Input id="retentionUntil" name="retentionUntil" type="date" /></Field>
            </div>
            <Field label={t("documents.file")} htmlFor="file"><Input id="file" name="file" type="file" accept="application/pdf,image/png,image/jpeg" required /></Field>
          </ActionForm>
        </CardContent>
      </Card>
      {!docs.length ? (
        <EmptyState icon={FileText} title={t("documents.empty")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.filename}</div>
                  <div className="text-xs text-muted">
                    {t(`documents.types.${d.type}`)} · {(d.sizeBytes / 1024).toFixed(0)} KB · {formatDateTime(d.createdAt, locale)}
                    {d.retentionUntil ? ` · ${t("documents.retention")} ${formatDate(d.retentionUntil, locale)}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a className="inline-flex min-h-8 items-center rounded-lg border border-border px-3 text-xs" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">{t("documents.preview")}</a>
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="documentId" value={d.id} />
                    <Button size="sm" variant="danger">{t("app.delete")}</Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
