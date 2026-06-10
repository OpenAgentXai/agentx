import { useQuery } from "@tanstack/react-query";
import { dashboardAPI, auditAPI, policiesAPI, groupsAPI, sandboxesAPI } from "@/lib/api";

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => dashboardAPI.overview().then((r) => r.data),
    refetchInterval: 15000,
  });
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => dashboardAPI.metrics().then((r) => r.data),
    refetchInterval: 30000,
  });
}

export function useAuditLogs(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => auditAPI.logs(params).then((r) => r.data),
  });
}

export function usePolicies() {
  return useQuery({
    queryKey: ["policies"],
    queryFn: () => policiesAPI.list().then((r) => r.data),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => groupsAPI.list().then((r) => r.data),
  });
}

export function useSandboxes() {
  return useQuery({
    queryKey: ["sandboxes"],
    queryFn: () => sandboxesAPI.list().then((r) => r.data),
  });
}
