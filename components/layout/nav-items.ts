import {
  Activity, Bell, Bookmark, Building2, CalendarCheck, FileText, Home, Inbox, LayoutDashboard, Map, MessageSquareReply,
  Rss, Send, Settings, ShieldCheck, Upload, UserRound, Zap,
} from "lucide-react";

export const NAV = [
  { href: "/", key: "overview", icon: LayoutDashboard, mobile: true },
  { href: "/feed", key: "feed", icon: Rss, mobile: false },
  { href: "/apartments", key: "apartments", icon: Home, mobile: true },
  { href: "/map", key: "map", icon: Map, mobile: false },
  { href: "/sources", key: "sources", icon: Building2, mobile: false },
  { href: "/applications", key: "applications", icon: Send, mobile: true },
  { href: "/inbox", key: "inbox", icon: Inbox, mobile: false },
  { href: "/replies", key: "replies", icon: MessageSquareReply, mobile: true },
  { href: "/viewings", key: "viewings", icon: CalendarCheck, mobile: false },
  { href: "/saved", key: "saved", icon: Bookmark, mobile: false },
  { href: "/import", key: "import", icon: Upload, mobile: false },
  { href: "/profile", key: "profile", icon: UserRound, mobile: false },
  { href: "/documents", key: "documents", icon: FileText, mobile: false },
  { href: "/automation", key: "automation", icon: Zap, mobile: false },
  { href: "/activity", key: "activity", icon: Activity, mobile: false },
  { href: "/notifications", key: "notifications", icon: Bell, mobile: false },
  { href: "/settings", key: "settings", icon: Settings, mobile: false },
] as const;

export { ShieldCheck };
