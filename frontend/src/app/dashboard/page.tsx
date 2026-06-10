"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardOverview, useDashboardMetrics } from "@/hooks/use-dashboard";
import { formatRelativeTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  Bot,
  Shield,
  Box,
  AlertTriangle,
  Activity,
  TrendingUp,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export default function DashboardPage() {
  const { t } = useI18n();
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview();
  const { data: metrics } = useDashboardMetrics();

  const overviewData = overview?.data;
  const metricsData = metrics?.data;

  const stats = [
    {
      name: t("dashboard.activeAgents"),
      value: overviewData?.agents?.active || 0,
      total: overviewData?.agents?.total || 0,
      icon: Bot,
      color: "text-primary-500",
      bg: "bg-primary-50 dark:bg-primary-950",
    },
    {
      name: t("dashboard.totalRequests"),
      value: overviewData?.activity?.requests_today || 0,
      subtitle: `${(overviewData?.activity?.error_rate || 0).toFixed(1)}% ${t("dashboard.errorRate")}`,
      icon: Activity,
      color: "text-success-500",
      bg: "bg-success-50 dark:bg-green-950",
    },
    {
      name: "Active Policies",
      value: overviewData?.policies?.total || 0,
      icon: Shield,
      color: "text-warning-500",
      bg: "bg-warning-50 dark:bg-yellow-950",
    },
    {
      name: "Active Alerts",
      value: overviewData?.alerts?.active || 0,
      icon: AlertTriangle,
      color: overviewData?.alerts?.active > 0 ? "text-danger-500" : "text-success-500",
      bg: overviewData?.alerts?.active > 0 ? "bg-danger-50 dark:bg-red-950" : "bg-success-50 dark:bg-green-950",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t("dashboard.title")}</h1>
          <p className="text-zinc-500 mt-1">{t("dashboard.subtitle")}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.name} className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{stat.name}</p>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                    {overviewLoading ? "—" : stat.value.toLocaleString()}
                  </p>
                  {stat.total !== undefined && stat.total > 0 && (
                    <p className="text-xs text-zinc-400 mt-1">of {stat.total} total</p>
                  )}
                  {stat.subtitle && (
                    <p className="text-xs text-zinc-400 mt-1">{stat.subtitle}</p>
                  )}
                </div>
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hourly Activity Chart */}
          <Card>
            <CardHeader title={t("dashboard.activityChart")} description="Requests and errors per hour" />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsData?.hourly_activity || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12, fill: "#71717a" }} tickFormatter={(h) => `${h}:00`} />
                  <YAxis tick={{ fontSize: 12, fill: "#71717a" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px" }}
                    labelStyle={{ color: "#a1a1aa" }}
                  />
                  <Area type="monotone" dataKey="requests" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={2} name={t("common.requests")} />
                  <Area type="monotone" dataKey="errors" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.1} strokeWidth={2} name={t("common.errors")} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top Agents Chart */}
          <Card>
            <CardHeader title={t("dashboard.topAgents")} description="Most active agents today" />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(metricsData?.top_agents || []).slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#71717a" }} />
                  <YAxis dataKey="agent_name" type="category" tick={{ fontSize: 12, fill: "#71717a" }} width={120} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px" }}
                  />
                  <Bar dataKey="request_count" fill="#6366f1" radius={[0, 4, 4, 0]} name={t("common.requests")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader title={t("dashboard.recentActivity")} description="Latest actions across all agents" />
          <div className="space-y-3">
            {(overviewData?.recent_activity || []).map((event: any) => (
              <div
                key={event.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
              >
                <div className="flex-shrink-0">
                  {event.status === "success" ? (
                    <CheckCircle className="h-5 w-5 text-success-500" />
                  ) : event.status === "denied" ? (
                    <Shield className="h-5 w-5 text-warning-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-danger-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="font-semibold">{event.actor_name}</span>
                    {" "}
                    <span className="text-zinc-500">{event.action}</span>
                    {" "}
                    <span className="text-zinc-400">{event.resource_type}</span>
                  </p>
                </div>
                <Badge variant={event.status === "success" ? "success" : event.status === "denied" ? "warning" : "danger"}>
                  {event.status}
                </Badge>
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  {formatRelativeTime(event.created_at)}
                </span>
              </div>
            ))}
            {(!overviewData?.recent_activity || overviewData.recent_activity.length === 0) && (
              <div className="text-center py-8 text-zinc-500">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t("dashboard.noActivity")}</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
