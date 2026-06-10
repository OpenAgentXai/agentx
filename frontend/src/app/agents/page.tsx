"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useAgents, useCreateAgent } from "@/hooks/use-agents";
import { formatRelativeTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Plus, Search, Bot, Filter } from "lucide-react";

const statusVariant: Record<string, "success" | "warning" | "danger" | "default" | "info"> = {
  active: "success",
  suspended: "warning",
  revoked: "danger",
  archived: "default",
  pending_approval: "info",
};

export default function AgentsPage() {
  const router = useRouter();
  const { t } = useI18n();

  const agentTypeOptions = [
    { value: "autonomous", label: t("agents.autonomous") },
    { value: "supervised", label: t("agents.supervised") },
    { value: "collaborative", label: t("agents.collaborative") },
    { value: "restricted", label: t("agents.restricted") },
  ];
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: "",
    description: "",
    agent_type: "autonomous",
    tags: "",
    max_requests_per_minute: 60,
    max_requests_per_day: 10000,
  });

  const { data, isLoading } = useAgents({ search: search || undefined });
  const createAgent = useCreateAgent();

  const agents = data?.data || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAgent.mutateAsync({
      name: newAgent.name,
      description: newAgent.description || undefined,
      agent_type: newAgent.agent_type,
      tags: newAgent.tags ? newAgent.tags.split(",").map((t) => t.trim()) : undefined,
      max_requests_per_minute: newAgent.max_requests_per_minute,
      max_requests_per_day: newAgent.max_requests_per_day,
    });
    setShowCreate(false);
    setNewAgent({
      name: "",
      description: "",
      agent_type: "autonomous",
      tags: "",
      max_requests_per_minute: 60,
      max_requests_per_day: 10000,
    });
  };

  const columns = [
    {
      key: "name",
      header: "Agent",
      render: (agent: any) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-white">{agent.name}</p>
            <p className="text-xs text-zinc-500">{agent.description || t("common.noDescription")}</p>
          </div>
        </div>
      ),
    },
    {
      key: "agent_type",
      header: t("common.type"),
      render: (agent: any) => (
        <Badge variant="info">{t(`agents.${agent.agent_type}`)}</Badge>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      render: (agent: any) => (
        <Badge variant={statusVariant[agent.status] || "default"}>
          {t(`agents.${agent.status === "pending_approval" ? "pendingApproval" : agent.status}`)}
        </Badge>
      ),
    },
    {
      key: "tags",
      header: t("common.tags"),
      render: (agent: any) => (
        <div className="flex gap-1 flex-wrap">
          {(agent.tags || []).slice(0, 3).map((tag: string) => (
            <span key={tag} className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "last_active_at",
      header: t("agents.lastActive"),
      render: (agent: any) => (
        <span className="text-zinc-500">
          {agent.last_active_at ? formatRelativeTime(agent.last_active_at) : t("agents.never")}
        </span>
      ),
    },
    {
      key: "created_at",
      header: t("common.created"),
      render: (agent: any) => (
        <span className="text-zinc-500">{formatRelativeTime(agent.created_at)}</span>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t("agents.title")}</h1>
            <p className="text-zinc-500 mt-1">{t("agents.subtitle")}</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("agents.createAgent")}
          </Button>
        </div>

        <Card padding="none">
          {/* Search & Filters */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder={t("agents.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4" />
                {t("common.filters")}
              </Button>
            </div>
          </div>

          <Table
            columns={columns}
            data={agents}
            isLoading={isLoading}
            keyExtractor={(agent: any) => agent.id}
            onRowClick={(agent: any) => router.push(`/agents/${agent.id}`)}
            emptyMessage={t("agents.noAgents")}
          />
        </Card>
      </div>

      {/* Create Agent Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={t("agents.createAgent")}
        description="Define a new AI agent identity with its type and configuration."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label={t("agents.agentName")}
            value={newAgent.name}
            onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))}
            placeholder={t("agents.agentNamePlaceholder")}
            required
          />

          <Input
            label={t("common.description")}
            value={newAgent.description}
            onChange={(e) => setNewAgent((p) => ({ ...p, description: e.target.value }))}
            placeholder={t("agents.descriptionPlaceholder")}
          />

          <Select
            label={t("agents.agentType")}
            value={newAgent.agent_type}
            onChange={(e) => setNewAgent((p) => ({ ...p, agent_type: e.target.value }))}
            options={agentTypeOptions}
          />

          <Input
            label={t("common.tags")}
            value={newAgent.tags}
            onChange={(e) => setNewAgent((p) => ({ ...p, tags: e.target.value }))}
            placeholder={t("agents.tagsPlaceholder")}
            hint={t("agents.tagsHint")}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("agents.rateLimit")}
              type="number"
              value={newAgent.max_requests_per_minute}
              onChange={(e) => setNewAgent((p) => ({ ...p, max_requests_per_minute: parseInt(e.target.value) }))}
              min={1}
              max={10000}
            />
            <Input
              label={t("agents.dailyLimit")}
              type="number"
              value={newAgent.max_requests_per_day}
              onChange={(e) => setNewAgent((p) => ({ ...p, max_requests_per_day: parseInt(e.target.value) }))}
              min={1}
              max={1000000}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" isLoading={createAgent.isPending}>
              {t("agents.createAgent")}
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
