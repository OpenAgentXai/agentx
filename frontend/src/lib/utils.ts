import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(date);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "bg-success-50 text-success-700 border-success-500",
    suspended: "bg-warning-50 text-warning-700 border-warning-500",
    revoked: "bg-danger-50 text-danger-700 border-danger-500",
    archived: "bg-zinc-100 text-zinc-600 border-zinc-400",
    pending_approval: "bg-primary-50 text-primary-700 border-primary-500",
  };
  return colors[status] || "bg-zinc-100 text-zinc-600 border-zinc-400";
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: "bg-blue-50 text-blue-700",
    medium: "bg-warning-50 text-warning-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-danger-50 text-danger-700",
  };
  return colors[severity] || "bg-zinc-100 text-zinc-600";
}

export function getEffectColor(effect: string): string {
  return effect === "allow"
    ? "bg-success-50 text-success-700"
    : "bg-danger-50 text-danger-700";
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function downloadFile(content: string, filename: string, type: string = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
