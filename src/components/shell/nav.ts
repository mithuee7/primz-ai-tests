import { AlertTriangle, LayoutDashboard, MessageSquare, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "review";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chats", label: "Chats", icon: MessageSquare },
  { href: "/review", label: "Needs Review", icon: AlertTriangle, badgeKey: "review" },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/services", label: "Services", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Shown in the mobile bottom bar (the rest live in the drawer). */
export const MOBILE_TAB_HREFS = ["/dashboard", "/chats", "/review", "/leads"];
