"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { usePolicies } from "@/hooks/use-dashboard";
import { useAgents } from "@/hooks/use-agents";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { policiesAPI } from "@/lib/api";
import { formatRelativeTime, getEffectColor } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Plus,
  Shield,
  Search,
  Zap,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface Policy {
  id: string;
  name: string;
  description: string;
  effect: "allow" | "deny";
  resources: string[];
  actions: string[];
  priority: number;
  is_active: boolean;
  conditions: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface SimulationResult {
  allowed: boolean;
  matching_policies: { id: string; name: string; effect: string; priority: number }[];
  reason: string;
}

export default function PoliciesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [newPolicy, setNewPolicy] = useState({
    name: "",
    description: "",
    effect: "allow",
    resources: "",
    actions: "",
    priority: 10,
    conditions: "",
  });

  // Simulator state
  const [simAgentId, setSimAgentId] = useState("");
  const [simResource, setSimResource] = useState("");
  const [simAction, setSimAction] = useState("");
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  const { data, isLoading } = usePolicies();
  const { data: agentsData } = useAgents();
  const policies: Policy[] = data?.data || [];
  const agents = agentsData?.data || [];

  const agentOptions = agents.map((a: any) => ({ value: a.id, label: a.name }));

  const effectOptions = [
    { value: "allow", label: t("policies.allow") },
    { value: "deny", label: t("policies.deny") },
  ];

  const filteredPolicies = policies.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const createPolicy = useMutation({
    mutationFn: (data: Record<string, unknown>) => policiesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success(t("common.createdSuccess"));
      setShowCreate(false);
      setNewPolicy({
        name: "",
        description: "",
        effect: "allow",
        resources: "",
        actions: "",
        priority: 10,
        conditions: "",
      });
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const deletePolicy = useMutation({
    mutationFn: (id: string) => policiesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success(t("common.deletedSuccess"));
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const togglePolicy = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      policiesAPI.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success(t("common.updatedSuccess"));
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const simulatePolicy = useMutation({
    mutationFn: (data: Record<string, unknown>) => policiesAPI.simulate(data),
    onSuccess: (response) => {
      setSimResult(response.data?.data || response.data);
    },
    onError: () => {
      toast.error("Simulation failed");
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let conditions: Record<string, unknown> | null = null;
    if (newPolicy.conditions.trim()) {
      try {
        conditions = JSON.parse(newPolicy.conditions);
      } catch {
        toast.error("Invalid JSON in conditions field");
        return;
      }
    }
    await createPolicy.mutateAsync({
      name: newPolicy.name,
      description: newPolicy.description || undefined,
      effect: newPolicy.effect,
      resources: newPolicy.resources.split(",").map((r) => r.trim()).filter(Boolean),
      actions: newPolicy.actions.split(",").map((a) => a.trim()).filter(Boolean),
      priority: newPolicy.priority,
      conditions,
    });
  };

  const handleSimulate = () => {
    if (!simAgentId || !simResource || !simAction) {
      toast.error("Please fill in all simulation fields");
      return;
    }
    simulatePolicy.mutate({
      agent_id: simAgentId,
      resource: simResource,
      action: simAction,
    });
  };

  const columns = [
    {
      key: "name",
      header: t("policies.title"),
      render: (policy: Policy) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-white">{policy.name}</p>
            <p className="text-xs text-zinc-500 max-w-[200px] truncate">
              {policy.description || t("common.noDescription")}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "effect",
      header: t("policies.effect"),
      render: (policy: Policy) => (
        <Badge
          variant={policy.effect === "allow" ? "success" : "danger"}
        >
          {policy.effect === "allow" ? t("policies.allow") : t("policies.deny")}
        </Badge>
      ),
    },
    {
      key: "resources",
      header: t("policies.resources"),
      render: (policy: Policy) => (
        <div className="flex gap-1 flex-wrap max-w-[200px]">
          {(policy.resources || []).slice(0, 2).map((r) => (
            <span
              key={r}
              className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono"
            >
              {r}
            </span>
          ))}
          {(policy.resources || []).length > 2 && (
            <span className="text-xs text-zinc-400">
              +{policy.resources.length - 2} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: t("policies.actionsLabel"),
      render: (policy: Policy) => (
        <div className="flex gap-1 flex-wrap max-w-[200px]">
          {(policy.actions || []).slice(0, 2).map((a) => (
            <span
              key={a}
              className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono"
            >
              {a}
            </span>
          ))}
          {(policy.actions || []).length > 2 && (
            <span className="text-xs text-zinc-400">
              +{policy.actions.length - 2} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: "priority",
      header: t("policies.priority"),
      render: (policy: Policy) => (
        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">
          {policy.priority}
        </span>
      ),
    },
    {
      key: "is_active",
      header: t("common.status"),
      render: (policy: Policy) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePolicy.mutate({ id: policy.id, is_active: !policy.is_active });
          }}
          className="flex items-center gap-1.5"
        >
          {policy.is_active ? (
            <>
              <ToggleRight className="h-5 w-5 text-success-500" />
              <span className="text-xs text-success-600">{t("policies.active")}</span>
            </>
          ) : (
            <>
              <ToggleLeft className="h-5 w-5 text-zinc-400" />
              <span className="text-xs text-zinc-400">{t("policies.inactive")}</span>
            </>
          )}
        </button>
      ),
    },
    {
      key: "actions_col",
      header: "",
      render: (policy: Policy) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedPolicy(expandedPolicy === policy.id ? null : policy.id);
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {expandedPolicy === policy.id ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(t("common.confirmDelete"))) {
                deletePolicy.mutate(policy.id);
              }
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t("policies.title")}</h1>
            <p className="text-zinc-500 mt-1">
              {t("policies.subtitle")}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("policies.createPolicy")}
          </Button>
        </div>

        {/* Policies Table */}
        <Card padding="none">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder={t("policies.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                />
              </div>
            </div>
          </div>

          <Table
            columns={columns}
            data={filteredPolicies}
            isLoading={isLoading}
            keyExtractor={(p: Policy) => p.id}
            onRowClick={(p: Policy) =>
              setExpandedPolicy(expandedPolicy === p.id ? null : p.id)
            }
            emptyMessage={t("policies.noPolicies")}
          />

          {/* Expanded Policy Detail */}
          {expandedPolicy && (
            <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-6">
              {(() => {
                const policy = policies.find((p) => p.id === expandedPolicy);
                if (!policy) return null;
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          {t("policies.resources")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(policy.resources || []).map((r) => (
                            <span
                              key={r}
                              className="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 rounded-md font-mono"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          {t("policies.actionsLabel")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(policy.actions || []).map((a) => (
                            <span
                              key={a}
                              className="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 rounded-md font-mono"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {policy.conditions && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                          {t("policies.conditions")}
                        </p>
                        <pre className="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 rounded-lg font-mono overflow-x-auto">
                          {JSON.stringify(policy.conditions, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>{t("common.created")} {formatRelativeTime(policy.created_at)}</span>
                      <span>{t("common.updated")} {formatRelativeTime(policy.updated_at)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </Card>

        {/* Policy Simulator */}
        <Card>
          <CardHeader
            title={t("policies.simulator")}
            description={t("policies.simulatorDesc")}
            action={
              <Badge variant="info">
                <Zap className="h-3 w-3 mr-1" />
                {t("policies.simulator")}
              </Badge>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label={t("agents.title")}
              value={simAgentId}
              onChange={(e) => setSimAgentId(e.target.value)}
              options={agentOptions}
              placeholder="Select an agent"
            />
            <Input
              label={t("audit.resource")}
              value={simResource}
              onChange={(e) => setSimResource(e.target.value)}
              placeholder="e.g., api:users:*"
            />
            <Input
              label={t("audit.action")}
              value={simAction}
              onChange={(e) => setSimAction(e.target.value)}
              placeholder="e.g., read"
            />
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Button
              onClick={handleSimulate}
              isLoading={simulatePolicy.isPending}
              variant="outline"
            >
              <Play className="h-4 w-4" />
              {t("policies.simulate")}
            </Button>
          </div>

          {simResult && (
            <div className="mt-6 border-t border-zinc-200 dark:border-zinc-700 pt-4">
              <div className="flex items-center gap-3 mb-4">
                {simResult.allowed ? (
                  <div className="flex items-center gap-2 text-success-600">
                    <CheckCircle className="h-6 w-6" />
                    <span className="text-lg font-semibold">{t("policies.allowed")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-danger-600">
                    <XCircle className="h-6 w-6" />
                    <span className="text-lg font-semibold">{t("policies.denied")}</span>
                  </div>
                )}
              </div>
              {simResult.reason && (
                <p className="text-sm text-zinc-500 mb-3">{simResult.reason}</p>
              )}
              {simResult.matching_policies && simResult.matching_policies.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400 mb-2">
                    {t("policies.matchingPolicies")}
                  </p>
                  <div className="space-y-2">
                    {simResult.matching_policies.map((mp) => (
                      <div
                        key={mp.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-zinc-400" />
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {mp.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={mp.effect === "allow" ? "success" : "danger"}
                          >
                            {mp.effect === "allow" ? t("policies.allow") : t("policies.deny")}
                          </Badge>
                          <span className="text-xs text-zinc-400 font-mono">
                            {t("policies.priority")}: {mp.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Create Policy Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={t("policies.createPolicy")}
        description={t("policies.subtitle")}
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label={t("policies.policyName")}
            value={newPolicy.name}
            onChange={(e) => setNewPolicy((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g., Allow Read Access"
            required
          />

          <Input
            label={t("common.description")}
            value={newPolicy.description}
            onChange={(e) =>
              setNewPolicy((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="Describe what this policy does"
          />

          <Select
            label={t("policies.effect")}
            value={newPolicy.effect}
            onChange={(e) => setNewPolicy((p) => ({ ...p, effect: e.target.value }))}
            options={effectOptions}
          />

          <Input
            label={t("policies.resources")}
            value={newPolicy.resources}
            onChange={(e) =>
              setNewPolicy((p) => ({ ...p, resources: e.target.value }))
            }
            placeholder={t("policies.resourcesPlaceholder")}
            hint={t("policies.resourcesHint")}
          />

          <Input
            label={t("policies.actionsLabel")}
            value={newPolicy.actions}
            onChange={(e) => setNewPolicy((p) => ({ ...p, actions: e.target.value }))}
            placeholder={t("policies.actionsPlaceholder")}
            hint={t("policies.actionsHint")}
          />

          <Input
            label={t("policies.priority")}
            type="number"
            value={newPolicy.priority}
            onChange={(e) =>
              setNewPolicy((p) => ({ ...p, priority: parseInt(e.target.value) || 0 }))
            }
            min={0}
            max={1000}
            hint={t("policies.priorityHint")}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t("policies.conditions")}
            </label>
            <textarea
              value={newPolicy.conditions}
              onChange={(e) =>
                setNewPolicy((p) => ({ ...p, conditions: e.target.value }))
              }
              placeholder='{"ip_range": "10.0.0.0/8", "time_window": "09:00-17:00"}'
              rows={4}
              className="block w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 font-mono"
            />
            <p className="text-sm text-zinc-500">
              {t("policies.conditionsHint")}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" isLoading={createPolicy.isPending}>
              {t("policies.createPolicy")}
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
