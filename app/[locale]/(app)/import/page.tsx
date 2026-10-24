import { getTranslations } from "next-intl/server";
import { importListingAction } from "@/app/actions/listings";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/empty";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/integrations/ai/claude";

export default async function ImportPage() {
  await requireUser();
  const t = await getTranslations("import");
  return (
    <div className="max-w-3xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <ActionForm action={importListingAction} submitLabel={t("submit")} successText={t("done")}>
            <Field label={t("url")} htmlFor="url"><Input id="url" name="url" type="url" dir="ltr" placeholder="https://" /></Field>
            <Field label={t("text")} htmlFor="text"><Textarea id="text" name="text" required minLength={20} rows={14} dir="ltr" lang="de" /></Field>
            {aiConfigured() ? <Checkbox name="useAi" defaultChecked label={t("useAi")} /> : null}
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
