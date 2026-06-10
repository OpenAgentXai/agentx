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
import { useGroups } from "@/hooks/use-dashboard";
import { useAgents } from "@/hooks/use-agents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupsAPI } from "@/lib/api";
import { formatRelativeTime, capitalize } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Plus,
  Users,
  Search,
  Trash2,
  UserPlus,
  UserMinus,
  Bot,
  X,
  ChevronRight,
  FolderOpen,
} from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string;
  member_count: number;
  members?: GroupMember[];
  created_at: string;
  updated_at: string;
}

interface GroupMember {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_type: string;
  status: string;
  joined_at: string;
}

export default function GroupsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [addAgentId, setAddAgentId] = useState("");
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
  });

  const { data, isLoading } = useGroups();
  const { data: agentsData } = useAgents();
  const groups: Group[] = data?.data || [];
  const agents = agentsData?.data || [];

  const { data: groupDetailData } = useQuery({
    queryKey: ["group-detail", selectedGroup],
    queryFn: () => groupsAPI.get(selectedGroup!).then((r) => r.data),
    enabled: !!selectedGroup,
  });

  const groupDetail: Group | null = groupDetailData?.data || null;

  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Build agent options excluding those already in the group
  const currentMemberIds = new Set(
    (groupDetail?.members || []).map((m) => m.agent_id)
  );
  const availableAgents = agents.filter(
    (a: any) => !currentMemberIds.has(a.id)
  );
  const agentOptions = availableAgents.map((a: any) => ({
    value: a.id,
    label: a.name,
  }));

  const createGroup = useMutation({
    mutationFn: (data: Record<string, unknown>) => groupsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(t("common.createdSuccess"));
      setShowCreate(false);
      setNewGroup({ name: "", description: "" });
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => groupsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      if (selectedGroup) setSelectedGroup(null);
      toast.success(t("common.deletedSuccess"));
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const assignAgent = useMutation({
    mutationFn: ({
      groupId,
      agentId,
    }: {
      groupId: string;
      agentId: string;
    }) => groupsAPI.assignAgent(groupId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({
        queryKey: ["group-detail", selectedGroup],
      });
      toast.success("Agent added to group");
      setShowAddAgent(false);
      setAddAgentId("");
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const removeAgent = useMutation({
    mutationFn: ({
      groupId,
      agentId,
    }: {
      groupId: string;
      agentId: string;
    }) => groupsAPI.removeAgent(groupId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({
        queryKey: ["group-detail", selectedGroup],
      });
      toast.success("Agent removed from group");
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createGroup.mutateAsync({
      name: newGroup.name,
      description: newGroup.description || undefined,
    });
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !addAgentId) return;
    await assignAgent.mutateAsync({
      groupId: selectedGroup,
      agentId: addAgentId,
    });
  };

  const columns = [
    {
      key: "name",
      header: t("groups.title"),
      render: (group: Group) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-white">
              {group.name}
            </p>
            <p className="text-xs text-zinc-500 max-w-[250px] truncate">
              {group.description || t("common.noDescription")}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "member_count",
      header: t("groups.members"),
      render: (group: Group) => (
        <div className="flex items-center gap-2">
          <Badge variant="default">
            {group.member_count || 0} {t("groups.memberCount")}
          </Badge>
        </div>
      ),
    },
    {
      key: "created_at",
      header: t("common.created"),
      render: (group: Group) => (
        <span className="text-sm text-zinc-500">
          {formatRelativeTime(group.created_at)}
        </span>
      ),
    },
    {
      key: "actions_col",
      header: "",
      render: (group: Group) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedGroup(
                selectedGroup === group.id ? null : group.id
              );
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(t("common.confirmDelete"))) {
                deleteGroup.mutate(group.id);
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

  const selectedGroupSummary = groups.find((g) => g.id === selectedGroup);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              {t("groups.title")}
            </h1>
            <p className="text-zinc-500 mt-1">
              {t("groups.subtitle")}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("groups.createGroup")}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Groups List */}
          <div className="lg:col-span-2">
            <Card padding="none">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder={t("groups.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                  />
                </div>
              </div>

              <Table
                columns={columns}
                data={filteredGroups}
                isLoading={isLoading}
                keyExtractor={(g: Group) => g.id}
                onRowClick={(g: Group) =>
                  setSelectedGroup(
                    selectedGroup === g.id ? null : g.id
                  )
                }
                emptyMessage={t("groups.noGroups")}
              />
            </Card>
          </div>

          {/* Group Detail Panel */}
          <div className="lg:col-span-1">
            {selectedGroup && selectedGroupSummary ? (
              <Card>
                <CardHeader
                  title={selectedGroupSummary.name}
                  description={
                    selectedGroupSummary.description || t("common.noDescription")
                  }
                  action={
                    <button
                      onClick={() => setSelectedGroup(null)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  }
                />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-zinc-400">
                      {t("groups.members")} ({(groupDetail?.members || []).length})
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddAgent(true)}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {t("groups.addAgent")}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {(groupDetail?.members || []).length === 0 && (
                      <div className="text-center py-8 text-zinc-400">
                        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No members in this group</p>
                        <p className="text-xs mt-1">
                          Add agents to manage them collectively
                        </p>
                      </div>
                    )}
                    {(groupDetail?.members || []).map((member) => (
                      <div
                        key={member.id || member.agent_id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <Bot className="h-4 w-4 text-primary-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {member.agent_name}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {capitalize(member.agent_type || "agent")} -{" "}
                              <Badge
                                variant={
                                  member.status === "active"
                                    ? "success"
                                    : "default"
                                }
                                className="ml-1"
                              >
                                {capitalize(member.status || "unknown")}
                              </Badge>
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            removeAgent.mutate({
                              groupId: selectedGroup,
                              agentId: member.agent_id,
                            })
                          }
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors"
                          title={t("groups.removeAgent")}
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700">
                    <p className="text-xs text-zinc-400">
                      {t("common.created")}{" "}
                      {formatRelativeTime(selectedGroupSummary.created_at)}
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="text-center py-12 text-zinc-400">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No group selected</p>
                  <p className="text-xs mt-1">
                    Click on a group to view its members
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={t("groups.createGroup")}
        description={t("groups.subtitle")}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label={t("groups.groupName")}
            value={newGroup.name}
            onChange={(e) =>
              setNewGroup((p) => ({ ...p, name: e.target.value }))
            }
            placeholder="e.g., Production Agents"
            required
          />

          <Input
            label={t("common.description")}
            value={newGroup.description}
            onChange={(e) =>
              setNewGroup((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="Describe the purpose of this group"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" isLoading={createGroup.isPending}>
              {t("groups.createGroup")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Agent Modal */}
      <Modal
        isOpen={showAddAgent}
        onClose={() => setShowAddAgent(false)}
        title={t("groups.addAgent")}
        description="Select an agent to add to this group"
        size="sm"
      >
        <form onSubmit={handleAddAgent} className="space-y-4">
          <Select
            label="Select Agent"
            value={addAgentId}
            onChange={(e) => setAddAgentId(e.target.value)}
            options={agentOptions}
            placeholder="Choose an agent"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowAddAgent(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              isLoading={assignAgent.isPending}
              disabled={!addAgentId}
            >
              <UserPlus className="h-4 w-4" />
              {t("groups.addAgent")}
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
