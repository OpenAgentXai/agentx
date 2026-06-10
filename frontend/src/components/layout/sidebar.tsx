"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  Shield,
  Box,
  MessageSquare,
  ScrollText,
  Settings,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useI18n } from "@/lib/i18n";

const navigationItems = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "agents", href: "/agents", icon: Bot },
  { key: "groups", href: "/groups", icon: Users },
  { key: "policies", href: "/policies", icon: Shield },
  { key: "sandboxes", href: "/sandboxes", icon: Box },
  { key: "collaboration", href: "/collaboration", icon: MessageSquare },
  { key: "audit", href: "/audit", icon: ScrollText },
  { key: "settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthStore();
  const { t } = useI18n();

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-zinc-950 text-white transition-all duration-300 border-r border-zinc-800",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-zinc-800">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center font-bold text-sm">
          AX
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold tracking-tight">AgentX</h1>
            <p className="text-xs text-zinc-500">Identity Platform</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navigationItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-primary-600/20 text-primary-400"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              )}
            >
              <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-primary-400")} />
              {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Language Switcher */}
      <div className="px-2 py-2 border-t border-zinc-800">
        <LanguageSwitcher compact={collapsed} />
      </div>

      {/* User section */}
      <div className="border-t border-zinc-800 p-3">
        {!collapsed && user && (
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center text-xs font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={() => logout()}
            className="flex items-center justify-center p-2 rounded-lg text-zinc-400 hover:text-danger-400 hover:bg-zinc-800 transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
