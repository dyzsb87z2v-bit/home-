"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const t = useTranslations("settings");
  const [state, setState] = useState<"unsupported" | "idle" | "enabled" | "busy">("idle");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => s && setState("enabled")).catch(() => undefined);
  }, []);

  if (!vapidKey) return <p className="text-sm text-muted">{t("pushNotConfigured")}</p>;
  if (state === "unsupported") return <p className="text-sm text-muted">{t("pushUnsupported")}</p>;

  const enable = async () => {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("idle");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      setState(res.ok ? "enabled" : "idle");
    } catch {
      setState("idle");
    }
  };

  return (
    <Button type="button" onClick={enable} disabled={state !== "idle"} variant={state === "enabled" ? "outline" : "default"}>
      {state === "enabled" ? t("pushEnabled") : t("pushEnable")}
    </Button>
  );
}
