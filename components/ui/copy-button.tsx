"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "./button";

export function CopyButton({ text }: { text: string }) {
  const t = useTranslations("applications");
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      <Copy className="h-4 w-4" aria-hidden /> {done ? t("copied") : t("copy")}
    </Button>
  );
}
