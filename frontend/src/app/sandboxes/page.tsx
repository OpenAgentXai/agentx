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
import { useSandboxes } from "@/hooks/use-dashboard";
import { useAgents } from "@/hooks/use-agents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sandboxesAPI } from "@/lib/api";
import { formatRelativeTime, capitalize } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  Box,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  Camera,
  RotateCcw,
  Cpu,
  HardDrive,
  Gauge,
  Activity,
  X,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Sandbox {
  id: string;
  name: string;
  description: string;
  mode: "production" | "dry_run" | "testing";
  status: string;
  agent_id: string | null;
  agent_name?: string;
  resource_limits: {
    max_requests_per_minute: number;
    max_memory_mb: number;
    max_cpu_percent: number;
  };
  snapshots?: Snapshot[];
  created_at: string;
  updated_at: string;
}

interface Snapshot {
  id: string;
  name: string;
  created_at: string;
  size_mb?: number;
}

interface SandboxMetrics {
  cpu_usage: number[];
  memory_usage: number[];
  request_count: number[];
  timestamps: string[];
}

const modeOptions = [
  { value: "production", label: "Production" },
  { value: "dry_run", label: "Dry Run" },
  { value: "testing", label: "Testing" },
];

const modeVariant: Record<string, "success" | "warning" | "info"> = {
  production: "success",
  dry_run: "warning",
  testing: "info",
};

const modeLabel: Record<string, string> = {
  production: "Production",
  dry_run: "Dry Run",
  testing: "Testing",
};

export default function SandboxesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSandbox, setSelectedSandbox] = useState<string | null>(null);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [newSandbox, setNewSandbox] = useState({
    name: "",
    description: "",
    mode: "testing",
    agent_id: "",
    max_requests_per_minute: 100,
    max_memory_mb: 512,
    max_cpu_percent: 50,
  });

  const { data, isLoading } = useSandboxes();
  const { data: agentsData } = useAgents();
  const sandboxes: Sandbox[] = data?.data || [];
  const agents = agentsData?.data || [];

  const agentOptions = [
    { value: "", label: "None (unlinked)" },
    ...agents.map((a: any) => ({ value: a.id, label: a.name })),
  ];

  const selectedSandboxData = sandboxes.find((s) => s.id === selectedSandbox);

  const { data: metricsData } = useQuery({
    queryKey: ["sandbox-metrics", selectedSandbox],
    queryFn: () =>
      sandboxesAPI.metrics(selectedSandbox!).then((r) => r.data),
    enabled: !!selectedSandbox,
    refetchInterval: 15000,
  });

  const sandboxMetrics: SandboxMetrics | null = metricsData?.data || null;

  const metricsChartData = sandboxMetrics
    ? sandboxMetrics.timestamps.map((ts, i) => ({
        time: new Date(ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        cpu: sandboxMetrics.cpu_usage[i] || 0,
        memory: sandboxMetrics.memory_usage[i] || 0,
        requests: sandboxMetrics.request_count[i] || 0,
      }))
    : [];

  const filteredSandboxes = sandboxes.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase())
  );

  const createSandbox = useMutation({
    mutationFn: (data: Record<string, unknown>) => sandboxesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
      toast.success("Sandbox created successfully");
      setShowCreate(false);
      setNewSandbox({
        name: "",
        description: "",
        mode: "testing",
        agent_id: "",
        max_requests_per_minute: 100,
        max_memory_mb: 512,
        max_cpu_percent: 50,
      });
    },
    onError: () => {
      toast.error("Failed to create sandbox");
    },
  });

  const deleteSandbox = useMutation({
    mutationFn: (id: string) => sandboxesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
      if (selectedSandbox) setSelectedSandbox(null);
      toast.success("Sandbox deleted");
    },
    onError: () => {
      toast.error("Failed to delete sandbox");
    },
  });

  const createSnapshot = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      sandboxesAPI.snapshot(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
      toast.success("Snapshot created");
      setShowSnapshotModal(false);
      setSnapshotName("");
    },
    onError: () => {
      toast.error("Failed to create snapshot");
    },
  });

  const restoreSnapshot = useMutation({
    mutationFn: ({
      sandboxId,
      snapshotId,
    }: {
      sandboxId: string;
      snapshotId: string;
    }) => sandboxesAPI.restore(sandboxId, snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
      toast.success("Snapshot restored");
    },
    onError: () => {
      toast.error("Failed to restore snapshot");
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSandbox.mutateAsync({
      name: newSandbox.name,
      description: newSandbox.description || undefined,
      mode: newSandbox.mode,
      agent_id: newSandbox.agent_id || undefined,
      resource_limits: {
        max_requests_per_minute: newSandbox.max_requests_per_minute,
        max_memory_mb: newSandbox.max_memory_mb,
        max_cpu_percent: newSandbox.max_cpu_percent,
      },
    });
  };

  const columns = [
    {
      key: "name",
      header: "Sandbox",
      render: (sandbox: Sandbox) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Box className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-white">
              {sandbox.name}
            </p>
            <p className="text-xs text-zinc-500 max-w-[200px] truncate">
              {sandbox.description || "No description"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      render: (sandbox: Sandbox) => (
        <Badge variant={modeVariant[sandbox.mode] || "default"}>
          {modeLabel[sandbox.mode] || capitalize(sandbox.mode)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (sandbox: Sandbox) => (
        <Badge
          variant={
            sandbox.status === "running"
              ? "success"
              : sandbox.status === "stopped"
              ? "danger"
              : "default"
          }
        >
          {capitalize(sandbox.status || "unknown")}
        </Badge>
      ),
    },
    {
      key: "agent_id",
      header: "Linked Agent",
      render: (sandbox: Sandbox) => (
        <span className="text-sm text-zinc-500">
          {sandbox.agent_name ||
            (sandbox.agent_id
              ? sandbox.agent_id.slice(0, 8) + "..."
              : "Unlinked")}
        </span>
      ),
    },
    {
      key: "resource_limits",
      header: "Resource Limits",
      render: (sandbox: Sandbox) => {
        const limits = sandbox.resource_limits;
        if (!limits) return <span className="text-zinc-400">-</span>;
        return (
          <div className="flex gap-2">
            <span
              className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded"
              title="Requests/min"
            >
              <Gauge className="h-3 w-3 inline mr-1" />
              {limits.max_requests_per_minute}/m
            </span>
            <span
              className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded"
              title="Memory MB"
            >
              <HardDrive className="h-3 w-3 inline mr-1" />
              {limits.max_memory_mb}MB
            </span>
            <span
              className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded"
              title="CPU %"
            >
              <Cpu className="h-3 w-3 inline mr-1" />
              {limits.max_cpu_percent}%
            </span>
          </div>
        );
      },
    },
    {
      key: "actions_col",
      header: "",
      render: (sandbox: Sandbox) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Are you sure you want to delete this sandbox?")) {
              deleteSandbox.mutate(sandbox.id);
            }
          }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
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
              Sandboxes
            </h1>
            <p className="text-zinc-500 mt-1">
              Isolated environments for testing and running agents
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create Sandbox
          </Button>
        </div>

        {/* Sandboxes Table */}
        <Card padding="none">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search sandboxes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              />
            </div>
          </div>

          <Table
            columns={columns}
            data={filteredSandboxes}
            isLoading={isLoading}
            keyExtractor={(s: Sandbox) => s.id}
            onRowClick={(s: Sandbox) =>
              setSelectedSandbox(selectedSandbox === s.id ? null : s.id)
            }
            emptyMessage="No sandboxes found. Create your first sandbox to get started."
          />
        </Card>

        {/* Expanded Sandbox Detail */}
        {selectedSandboxData && (
          <Card>
            <CardHeader
              title={selectedSandboxData.name}
              description="Sandbox details, snapshots, and metrics"
              action={
                <button
                  onClick={() => setSelectedSandbox(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              }
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Details */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400 mb-2">
                    Configuration
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="text-sm text-zinc-500">Mode</span>
                      <Badge
                        variant={
                          modeVariant[selectedSandboxData.mode] || "default"
                        }
                      >
                        {modeLabel[selectedSandboxData.mode] ||
                          selectedSandboxData.mode}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="text-sm text-zinc-500">Status</span>
                      <Badge
                        variant={
                          selectedSandboxData.status === "running"
                            ? "success"
                            : "default"
                        }
                      >
                        {capitalize(selectedSandboxData.status || "unknown")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="text-sm text-zinc-500">
                        Requests/min
                      </span>
                      <span className="text-sm font-mono text-zinc-900 dark:text-zinc-100">
                        {selectedSandboxData.resource_limits
                          ?.max_requests_per_minute || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="text-sm text-zinc-500">Memory</span>
                      <span className="text-sm font-mono text-zinc-900 dark:text-zinc-100">
                        {selectedSandboxData.resource_limits?.max_memory_mb ||
                          "-"}{" "}
                        MB
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="text-sm text-zinc-500">CPU</span>
                      <span className="text-sm font-mono text-zinc-900 dark:text-zinc-100">
                        {selectedSandboxData.resource_limits?.max_cpu_percent ||
                          "-"}
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {/* Snapshots */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase text-zinc-400">
                      Snapshots
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSnapshotModal(true)}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Create Snapshot
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(selectedSandboxData.snapshots || []).length === 0 && (
                      <p className="text-sm text-zinc-400 text-center py-4">
                        No snapshots yet
                      </p>
                    )}
                    {(selectedSandboxData.snapshots || []).map((snap) => (
                      <div
                        key={snap.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {snap.name}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {formatRelativeTime(snap.created_at)}
                            {snap.size_mb && ` - ${snap.size_mb} MB`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            restoreSnapshot.mutate({
                              sandboxId: selectedSandboxData.id,
                              snapshotId: snap.id,
                            })
                          }
                          isLoading={restoreSnapshot.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Metrics Chart */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase text-zinc-400">
                  Resource Metrics
                </p>
                {metricsChartData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metricsChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#27272a"
                        />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 11, fill: "#71717a" }}
                        />
                        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#18181b",
                            border: "1px solid #3f3f46",
                            borderRadius: "8px",
                          }}
                          labelStyle={{ color: "#a1a1aa" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cpu"
                          stroke="#6366f1"
                          fill="#6366f1"
                          fillOpacity={0.1}
                          strokeWidth={2}
                          name="CPU %"
                        />
                        <Area
                          type="monotone"
                          dataKey="memory"
                          stroke="#22c55e"
                          fill="#22c55e"
                          fillOpacity={0.1}
                          strokeWidth={2}
                          name="Memory MB"
                        />
                        <Area
                          type="monotone"
                          dataKey="requests"
                          stroke="#f59e0b"
                          fill="#f59e0b"
                          fillOpacity={0.1}
                          strokeWidth={2}
                          name="Requests"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-zinc-400">
                    <div className="text-center">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No metrics data available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Create Sandbox Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create New Sandbox"
        description="Set up an isolated environment for agent testing and execution"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Sandbox Name"
            value={newSandbox.name}
            onChange={(e) =>
              setNewSandbox((p) => ({ ...p, name: e.target.value }))
            }
            placeholder="e.g., Staging Environment"
            required
          />

          <Input
            label="Description"
            value={newSandbox.description}
            onChange={(e) =>
              setNewSandbox((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="Describe the purpose of this sandbox"
          />

          <Select
            label="Mode"
            value={newSandbox.mode}
            onChange={(e) =>
              setNewSandbox((p) => ({ ...p, mode: e.target.value }))
            }
            options={modeOptions}
          />

          <Select
            label="Linked Agent (optional)"
            value={newSandbox.agent_id}
            onChange={(e) =>
              setNewSandbox((p) => ({ ...p, agent_id: e.target.value }))
            }
            options={agentOptions}
          />

          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Resource Limits
            </p>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Requests/min"
                type="number"
                value={newSandbox.max_requests_per_minute}
                onChange={(e) =>
                  setNewSandbox((p) => ({
                    ...p,
                    max_requests_per_minute: parseInt(e.target.value) || 0,
                  }))
                }
                min={1}
                max={10000}
              />
              <Input
                label="Memory (MB)"
                type="number"
                value={newSandbox.max_memory_mb}
                onChange={(e) =>
                  setNewSandbox((p) => ({
                    ...p,
                    max_memory_mb: parseInt(e.target.value) || 0,
                  }))
                }
                min={64}
                max={16384}
              />
              <Input
                label="CPU (%)"
                type="number"
                value={newSandbox.max_cpu_percent}
                onChange={(e) =>
                  setNewSandbox((p) => ({
                    ...p,
                    max_cpu_percent: parseInt(e.target.value) || 0,
                  }))
                }
                min={1}
                max={100}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={createSandbox.isPending}>
              Create Sandbox
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Snapshot Modal */}
      <Modal
        isOpen={showSnapshotModal}
        onClose={() => setShowSnapshotModal(false)}
        title="Create Snapshot"
        description="Save the current state of this sandbox"
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (selectedSandbox && snapshotName) {
              createSnapshot.mutate({
                id: selectedSandbox,
                name: snapshotName,
              });
            }
          }}
          className="space-y-4"
        >
          <Input
            label="Snapshot Name"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="e.g., before-migration"
            required
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowSnapshotModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={createSnapshot.isPending}>
              <Camera className="h-4 w-4" />
              Create Snapshot
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
