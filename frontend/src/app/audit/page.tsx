"use client";

import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuditLogs } from "@/hooks/use-dashboard";
import { useQuery } from "@tanstack/react-query";
import { auditAPI } from "@/lib/api";
import {
  formatDate,
  formatRelativeTime,
  capitalize,
  getSeverityColor,
  downloadFile,
} from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  ScrollText,
  Search,
  Download,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Shield,
  Clock,
  User,
  Bot,
  RefreshCw,
  FileJson,
  FileSpreadsheet,
  Bell,
  AlertOctagon,
} from "lucide-react";

interface AuditLog {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_type: "user" | "agent" | "system";
  action: string;
  resource_type: string;
  resource_id: string;
  status: "success" | "failure" | "denied";
  details: Record<string, unknown> | null;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

interface Alert {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  status: "active" | "resolved" | "acknowledged";
  created_at: string;
  resolved_at?: string;
}

const actorTypeOptions = [
  { value: "", label: "All Actor Types" },
  { value: "user", label: "User" },
  { value: "agent", label: "Agent" },
  { value: "system", label: "System" },
];

const statusVariant: Record<string, "success" | "danger" | "warning"> = {
  success: "success",
  failure: "danger",
  denied: "warning",
};

const severityVariant: Record<string, "info" | "warning" | "danger"> = {
  low: "info",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export default function AuditPage() {
  const { t } = useI18n();
  const [showFilters, setShowFilters] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    actor_type: "",
    action: "",
    status: "",
    date_from: "",
    date_to: "",
    search: "",
  });

  // Build query params from filters
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {};
    if (filters.actor_type) params.actor_type = filters.actor_type;
    if (filters.action) params.action = filters.action;
    if (filters.status) params.status = filters.status;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    if (filters.search) params.search = filters.search;
    return Object.keys(params).length > 0 ? params : undefined;
  }, [filters]);

  const { data, isLoading, refetch } = useAuditLogs(queryParams);
  const logs: AuditLog[] = data?.data || [];

  const { data: alertsData } = useQuery({
    queryKey: ["audit-alerts"],
    queryFn: () => auditAPI.alerts().then((r) => r.data),
    refetchInterval: 30000,
  });

  const allAlerts: Alert[] = alertsData?.data || [];
  const activeAlerts = allAlerts.filter((a) => a.status === "active");

  const handleExport = async (format: "json" | "csv") => {
    try {
      const response = await auditAPI.export({
        ...queryParams,
        format,
      });
      const exportData = response.data?.data || response.data;

      if (format === "json") {
        downloadFile(
          JSON.stringify(exportData, null, 2),
          `audit-logs-${new Date().toISOString().split("T")[0]}.json`,
          "application/json"
        );
      } else {
        // Convert to CSV
        if (Array.isArray(exportData) && exportData.length > 0) {
          const headers = Object.keys(exportData[0]);
          const csvRows = [
            headers.join(","),
            ...exportData.map((row: Record<string, unknown>) =>
              headers
                .map((h) => {
                  const val = row[h];
                  const str =
                    typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
                  return `"${str.replace(/"/g, '""')}"`;
                })
                .join(",")
            ),
          ];
          downloadFile(
            csvRows.join("\n"),
            `audit-logs-${new Date().toISOString().split("T")[0]}.csv`,
            "text/csv"
          );
        } else {
          downloadFile(
            JSON.stringify(exportData, null, 2),
            `audit-logs-${new Date().toISOString().split("T")[0]}.json`,
            "application/json"
          );
        }
      }
      toast.success(`Audit logs exported as ${format.toUpperCase()}`);
    } catch {
      toast.error(t("common.operationFailed"));
    }
  };

  const ActorIcon = ({ type }: { type: string }) => {
    switch (type) {
      case "user":
        return <User className="h-4 w-4" />;
      case "agent":
        return <Bot className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-success-500" />;
      case "denied":
        return <Shield className="h-4 w-4 text-warning-500" />;
      default:
        return <XCircle className="h-4 w-4 text-danger-500" />;
    }
  };

  const statusFilterOptions = [
    { value: "", label: "All Statuses" },
    { value: "success", label: t("audit.success") },
    { value: "failure", label: t("audit.failure") },
    { value: "denied", label: t("audit.denied") },
  ];

  const actionFilterOptions = [
    { value: "", label: "All Actions" },
    { value: "create", label: t("common.create") },
    { value: "read", label: "Read" },
    { value: "update", label: "Update" },
    { value: "delete", label: t("common.delete") },
    { value: "login", label: "Login" },
    { value: "logout", label: t("nav.logout") },
    { value: "suspend", label: t("agents.suspend") },
    { value: "activate", label: t("agents.activate") },
    { value: "revoke", label: t("agents.revoke") },
  ];

  const columns = [
    {
      key: "created_at",
      header: t("audit.timestamp"),
      render: (log: AuditLog) => (
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-zinc-400" />
          <div>
            <p className="text-sm text-zinc-900 dark:text-zinc-100 font-mono text-xs">
              {formatDate(log.created_at)}
            </p>
            <p className="text-xs text-zinc-400">
              {formatRelativeTime(log.created_at)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "actor",
      header: t("audit.actor"),
      render: (log: AuditLog) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <ActorIcon type={log.actor_type} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {log.actor_name}
            </p>
            <p className="text-xs text-zinc-400">
              {capitalize(log.actor_type)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "action",
      header: t("audit.action"),
      render: (log: AuditLog) => (
        <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
          {log.action}
        </span>
      ),
    },
    {
      key: "resource",
      header: t("audit.resource"),
      render: (log: AuditLog) => (
        <div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {log.resource_type}
          </p>
          <p className="text-xs text-zinc-400 font-mono">
            {log.resource_id ? log.resource_id.slice(0, 12) + "..." : "-"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: t("audit.status"),
      render: (log: AuditLog) => (
        <div className="flex items-center gap-1.5">
          <StatusIcon status={log.status} />
          <Badge variant={statusVariant[log.status] || "default"}>
            {capitalize(log.status)}
          </Badge>
        </div>
      ),
    },
    {
      key: "expand",
      header: "",
      render: (log: AuditLog) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpandedLog(expandedLog === log.id ? null : log.id);
          }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {expandedLog === log.id ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              {t("audit.title")}
            </h1>
            <p className="text-zinc-500 mt-1">
              {t("audit.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              {t("common.refresh")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("json")}
            >
              <FileJson className="h-4 w-4" />
              {t("audit.exportJson")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("csv")}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {t("audit.exportCsv")}
            </Button>
          </div>
        </div>

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <Card className="border-warning-300 dark:border-warning-700">
            <CardHeader
              title={t("audit.alerts")}
              description={`${activeAlerts.length} unresolved alert${activeAlerts.length !== 1 ? "s" : ""} requiring attention`}
              action={
                <Badge variant="warning">
                  <Bell className="h-3 w-3 mr-1" />
                  {activeAlerts.length}
                </Badge>
              }
            />
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {alert.severity === "critical" ? (
                      <AlertOctagon className="h-5 w-5 text-danger-500" />
                    ) : (
                      <AlertTriangle
                        className={`h-5 w-5 ${
                          alert.severity === "high"
                            ? "text-danger-500"
                            : alert.severity === "medium"
                            ? "text-warning-500"
                            : "text-primary-500"
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {alert.title}
                      </p>
                      <Badge
                        variant={severityVariant[alert.severity] || "default"}
                      >
                        {capitalize(alert.severity)}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500">{alert.description}</p>
                  </div>
                  <span className="text-xs text-zinc-400 whitespace-nowrap">
                    {formatRelativeTime(alert.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder={t("audit.searchPlaceholder")}
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
              {t("common.filters")}
              {(filters.actor_type ||
                filters.action ||
                filters.status ||
                filters.date_from ||
                filters.date_to) && (
                <span className="ml-1.5 w-2 h-2 rounded-full bg-primary-500" />
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Select
                label={t("audit.actor")}
                value={filters.actor_type}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, actor_type: e.target.value }))
                }
                options={actorTypeOptions}
              />
              <Select
                label={t("audit.action")}
                value={filters.action}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, action: e.target.value }))
                }
                options={actionFilterOptions}
              />
              <Select
                label={t("audit.status")}
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, status: e.target.value }))
                }
                options={statusFilterOptions}
              />
              <Input
                label="Date From"
                type="date"
                value={filters.date_from}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, date_from: e.target.value }))
                }
              />
              <Input
                label="Date To"
                type="date"
                value={filters.date_to}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, date_to: e.target.value }))
                }
              />
            </div>
          )}

          {(filters.actor_type ||
            filters.action ||
            filters.status ||
            filters.date_from ||
            filters.date_to) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-zinc-400">Active filters:</span>
              {filters.actor_type && (
                <Badge variant="info">
                  {t("audit.actor")}: {capitalize(filters.actor_type)}
                </Badge>
              )}
              {filters.action && (
                <Badge variant="info">
                  {t("audit.action")}: {capitalize(filters.action)}
                </Badge>
              )}
              {filters.status && (
                <Badge variant="info">
                  {t("audit.status")}: {capitalize(filters.status)}
                </Badge>
              )}
              {filters.date_from && (
                <Badge variant="info">From: {filters.date_from}</Badge>
              )}
              {filters.date_to && (
                <Badge variant="info">To: {filters.date_to}</Badge>
              )}
              <button
                onClick={() =>
                  setFilters({
                    actor_type: "",
                    action: "",
                    status: "",
                    date_from: "",
                    date_to: "",
                    search: "",
                  })
                }
                className="text-xs text-primary-500 hover:text-primary-600 font-medium ml-2"
              >
                Clear all
              </button>
            </div>
          )}
        </Card>

        {/* Audit Logs Table */}
        <Card padding="none">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {t("audit.title")}
              </span>
              <Badge variant="default">{logs.length} entries</Badge>
            </div>
          </div>

          <Table
            columns={columns}
            data={logs}
            isLoading={isLoading}
            keyExtractor={(log: AuditLog) => log.id}
            onRowClick={(log: AuditLog) =>
              setExpandedLog(expandedLog === log.id ? null : log.id)
            }
            emptyMessage={t("audit.noLogs")}
          />

          {/* Expanded Log Details */}
          {expandedLog && (
            <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-6">
              {(() => {
                const log = logs.find((l) => l.id === expandedLog);
                if (!log) return null;
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          Event ID
                        </p>
                        <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
                          {log.id}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          IP Address
                        </p>
                        <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
                          {log.ip_address || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          User Agent
                        </p>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                          {log.user_agent || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          Actor ID
                        </p>
                        <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
                          {log.actor_id}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          Resource ID
                        </p>
                        <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
                          {log.resource_id || "N/A"}
                        </p>
                      </div>
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          {t("audit.details")}
                        </p>
                        <pre className="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 rounded-lg font-mono overflow-x-auto max-h-48 overflow-y-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
