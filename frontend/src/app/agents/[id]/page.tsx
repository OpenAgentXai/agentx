"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import {
  useAgent,
  useAgentMetrics,
  useAgentActivity,
  useSuspendAgent,
  useActivateAgent,
  useRevokeAgent,
  useDeleteAgent,
  useCredentials,
  useCreateCredential,
  useRevokeCredential,
} from "@/hooks/use-agents";
import {
  formatDate,
  formatRelativeTime,
  capitalize,
  getStatusColor,
  copyToClipboard,
} from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  ArrowLeft,
  Bot,
  Shield,
  Key,
  Activity,
  BarChart3,
  Pause,
  Play,
  Ban,
  Trash2,
  Plus,
  Copy,
  Check,
  RotateCw,
  AlertTriangle,
  Clock,
  Tag,
  User,
  Box,
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type TabKey = "overview" | "credentials" | "activity" | "metrics";

const statusVariant: Record<string, "success" | "warning" | "danger" | "default" | "info"> = {
  active: "success",
  suspended: "warning",
  revoked: "danger",
  archived: "default",
  pending_approval: "info",
};

const credentialTypeOptions = [
  { value: "api_key", label: "API Key" },
  { value: "oauth2_token", label: "OAuth2 Token" },
  { value: "jwt", label: "JWT" },
  { value: "hmac", label: "HMAC Secret" },
];

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "agents.overview", icon: Bot },
  { key: "credentials", label: "agents.credentials", icon: Key },
  { key: "activity", label: "agents.activity", icon: Activity },
  { key: "metrics", label: "agents.metrics", icon: BarChart3 },
];

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const agentId = params?.id as string;

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showCreateCred, setShowCreateCred] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [newCredName, setNewCredName] = useState("");
  const [newCredType, setNewCredType] = useState("api_key");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCredId, setCopiedCredId] = useState<string | null>(null);

  // Data hooks
  const { data: agentData, isLoading: agentLoading, error: agentError } = useAgent(agentId);
  const { data: metricsData, isLoading: metricsLoading } = useAgentMetrics(agentId);
  const { data: activityData, isLoading: activityLoading } = useAgentActivity(agentId);
  const { data: credentialsData, isLoading: credentialsLoading } = useCredentials(agentId);

  // Mutation hooks
  const suspendAgent = useSuspendAgent();
  const activateAgent = useActivateAgent();
  const revokeAgent = useRevokeAgent();
  const deleteAgent = useDeleteAgent();
  const createCredential = useCreateCredential();
  const revokeCredential = useRevokeCredential();

  const agent = agentData?.data;
  const metrics = metricsData?.data;
  const activityList = activityData?.data || [];
  const credentials = credentialsData?.data || [];

  // Handlers
  const handleSuspend = async () => {
    await suspendAgent.mutateAsync(agentId);
  };

  const handleActivate = async () => {
    await activateAgent.mutateAsync(agentId);
  };

  const handleRevoke = async () => {
    await revokeAgent.mutateAsync(agentId);
    setShowRevokeConfirm(false);
  };

  const handleDelete = async () => {
    await deleteAgent.mutateAsync(agentId);
    router.push("/agents");
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createCredential.mutateAsync({
      agentId,
      data: { name: newCredName, credential_type: newCredType },
    });
    setCreatedKey(result.data?.key || result.key || null);
    setNewCredName("");
    setNewCredType("api_key");
  };

  const handleCloseCreateCred = () => {
    setShowCreateCred(false);
    setCreatedKey(null);
    setCopiedKey(false);
    setNewCredName("");
    setNewCredType("api_key");
  };

  const handleRevokeCredential = async (credId: string) => {
    await revokeCredential.mutateAsync({ agentId, credId });
  };

  const handleCopyKey = async (key: string) => {
    await copyToClipboard(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyPrefix = async (prefix: string, credId: string) => {
    await copyToClipboard(prefix);
    setCopiedCredId(credId);
    setTimeout(() => setCopiedCredId(null), 2000);
  };

  // Loading state
  if (agentLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto" />
            <p className="text-zinc-500 dark:text-zinc-400">{t("common.loading")}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Error state
  if (agentError || !agent) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-danger-500 mx-auto" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Agent not found
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              The agent you are looking for does not exist or you do not have access.
            </p>
            <Button variant="secondary" onClick={() => router.push("/agents")}>
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <button
            onClick={() => router.push("/agents")}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Bot className="h-7 w-7 text-primary-600" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                    {agent.name}
                  </h1>
                  <Badge variant="info">{t(`agents.${agent.agent_type}`)}</Badge>
                  <Badge variant={statusVariant[agent.status] || "default"}>
                    {t(`agents.${agent.status === "pending_approval" ? "pendingApproval" : agent.status}`)}
                  </Badge>
                </div>
                {agent.description && (
                  <p className="text-zinc-500 dark:text-zinc-400 mt-1">{agent.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {agent.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuspend}
                  isLoading={suspendAgent.isPending}
                >
                  <Pause className="h-4 w-4" />
                  {t("agents.suspend")}
                </Button>
              )}
              {agent.status === "suspended" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleActivate}
                  isLoading={activateAgent.isPending}
                >
                  <Play className="h-4 w-4" />
                  {t("agents.activate")}
                </Button>
              )}
              {agent.status !== "revoked" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRevokeConfirm(true)}
                >
                  <Ban className="h-4 w-4" />
                  {t("agents.revoke")}
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-zinc-200 dark:border-zinc-700">
          <nav className="flex gap-1" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                    ${
                      isActive
                        ? "border-primary-500 text-primary-600 dark:text-primary-400"
                        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {t(tab.label)}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && <OverviewTab agent={agent} />}
        {activeTab === "credentials" && (
          <CredentialsTab
            credentials={credentials}
            isLoading={credentialsLoading}
            onCreateClick={() => setShowCreateCred(true)}
            onRevoke={handleRevokeCredential}
            revokeLoading={revokeCredential.isPending}
            copiedCredId={copiedCredId}
            onCopyPrefix={handleCopyPrefix}
          />
        )}
        {activeTab === "activity" && (
          <ActivityTab activities={activityList} isLoading={activityLoading} />
        )}
        {activeTab === "metrics" && (
          <MetricsTab metrics={metrics} isLoading={metricsLoading} />
        )}
      </div>

      {/* Create Credential Modal */}
      <Modal
        isOpen={showCreateCred}
        onClose={handleCloseCreateCred}
        title={createdKey ? "Credential Created" : t("credentials.create")}
        description={
          createdKey
            ? "Copy the key below. It will not be shown again."
            : "Generate a new API credential for this agent."
        }
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning-300 bg-warning-50 dark:bg-warning-950/30 dark:border-warning-700 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-warning-800 dark:text-warning-300">
                  <p className="font-medium">Save this key now</p>
                  <p className="mt-1">
                    {t("credentials.keyWarning")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 block rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-sm font-mono text-zinc-900 dark:text-zinc-100 break-all select-all">
                {createdKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyKey(createdKey)}
                className="flex-shrink-0"
              >
                {copiedKey ? (
                  <Check className="h-4 w-4 text-success-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex justify-end pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <Button onClick={handleCloseCreateCred}>{t("common.done")}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateCredential} className="space-y-4">
            <Input
              label={t("credentials.credentialName")}
              placeholder="e.g., Production API Key"
              value={newCredName}
              onChange={(e) => setNewCredName(e.target.value)}
              required
            />
            <Select
              label={t("credentials.credentialType")}
              value={newCredType}
              onChange={(e) => setNewCredType(e.target.value)}
              options={credentialTypeOptions}
            />
            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <Button variant="secondary" type="button" onClick={handleCloseCreateCred}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" isLoading={createCredential.isPending}>
                <Key className="h-4 w-4" />
                Generate Credential
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t("common.delete")}
        description="This action cannot be undone."
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-danger-300 bg-danger-50 dark:bg-danger-950/30 dark:border-danger-700 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-danger-800 dark:text-danger-300">
                <p>
                  Deleting <strong>{agent.name}</strong> will permanently remove the agent and all
                  its credentials. Any services using this agent's credentials will lose access.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={deleteAgent.isPending}>
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={showRevokeConfirm}
        onClose={() => setShowRevokeConfirm(false)}
        title={t("agents.revoke")}
        description="Revoke all access for this agent."
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-warning-300 bg-warning-50 dark:bg-warning-950/30 dark:border-warning-700 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-warning-800 dark:text-warning-300">
                <p>
                  Revoking <strong>{agent.name}</strong> will invalidate all credentials and deny
                  all requests. This agent will not be able to authenticate until reactivated.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowRevokeConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleRevoke} isLoading={revokeAgent.isPending}>
              <Ban className="h-4 w-4" />
              {t("agents.revoke")}
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

/* ─────────────────────────────────────────────
 * Overview Tab
 * ───────────────────────────────────────────── */

function OverviewTab({ agent }: { agent: any }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Agent Details - 2 columns */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader title="Agent Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
            <DetailRow icon={Bot} label={t("common.name")} value={agent.name} />
            <DetailRow icon={Tag} label={t("common.type")} value={t(`agents.${agent.agent_type}`)} />
            <DetailRow
              icon={CheckCircle}
              label={t("common.status")}
              value={
                <Badge variant={statusVariant[agent.status] || "default"}>
                  {t(`agents.${agent.status === "pending_approval" ? "pendingApproval" : agent.status}`)}
                </Badge>
              }
            />
            <DetailRow icon={User} label="Owner" value={agent.owner_name || agent.owner_id || "—"} />
            <DetailRow
              icon={Clock}
              label={t("common.created")}
              value={formatDate(agent.created_at)}
            />
            <DetailRow
              icon={Clock}
              label={t("agents.lastActive")}
              value={agent.last_active_at ? formatRelativeTime(agent.last_active_at) : t("agents.never")}
            />
            <DetailRow
              icon={Zap}
              label={t("agents.rateLimit")}
              value={agent.max_requests_per_minute?.toLocaleString() ?? "—"}
            />
            <DetailRow
              icon={Zap}
              label={t("agents.dailyLimit")}
              value={agent.max_requests_per_day?.toLocaleString() ?? "—"}
            />
            {agent.sandbox_id && (
              <DetailRow icon={Box} label="Sandbox" value={agent.sandbox_id} />
            )}
          </div>

          {/* Tags */}
          {agent.tags && agent.tags.length > 0 && (
            <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">{t("common.tags")}</p>
              <div className="flex flex-wrap gap-2">
                {agent.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {agent.metadata && Object.keys(agent.metadata).length > 0 && (
            <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Metadata</p>
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4">
                <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(agent.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Sidebar - Groups */}
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("groups.title")} description="Groups this agent belongs to" />
          {agent.groups && agent.groups.length > 0 ? (
            <div className="space-y-2">
              {agent.groups.map((group: any) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-100 dark:border-zinc-800 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-primary-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {group.name}
                    </p>
                    {group.description && (
                      <p className="text-xs text-zinc-500 truncate">{group.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Shield className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No groups assigned</p>
            </div>
          )}
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader title="Quick Stats" />
          <div className="space-y-3">
            <QuickStatRow
              label="Total Credentials"
              value={agent.credential_count ?? "—"}
            />
            <QuickStatRow
              label="Active Policies"
              value={agent.policy_count ?? "—"}
            />
            <QuickStatRow
              label={t("common.created")}
              value={formatRelativeTime(agent.created_at)}
            />
            <QuickStatRow
              label={t("common.updated")}
              value={agent.updated_at ? formatRelativeTime(agent.updated_at) : "—"}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">
          {value}
        </div>
      </div>
    </div>
  );
}

function QuickStatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Credentials Tab
 * ───────────────────────────────────────────── */

function CredentialsTab({
  credentials,
  isLoading,
  onCreateClick,
  onRevoke,
  revokeLoading,
  copiedCredId,
  onCopyPrefix,
}: {
  credentials: any[];
  isLoading: boolean;
  onCreateClick: () => void;
  onRevoke: (credId: string) => void;
  revokeLoading: boolean;
  copiedCredId: string | null;
  onCopyPrefix: (prefix: string, credId: string) => void;
}) {
  const { t } = useI18n();
  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
            {t("credentials.title")}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("credentials.subtitle")}
          </p>
        </div>
        <Button size="sm" onClick={onCreateClick}>
          <Plus className="h-4 w-4" />
          {t("credentials.create")}
        </Button>
      </div>

      {credentials.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Key className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
              {t("credentials.noCredentials")}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              {t("credentials.noCredentialsDesc")}
            </p>
            <Button size="sm" onClick={onCreateClick}>
              <Plus className="h-4 w-4" />
              {t("credentials.create")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred: any) => (
            <Card key={cred.id} padding="none">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <Key className="h-5 w-5 text-zinc-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {cred.name}
                      </p>
                      <Badge
                        variant={cred.status === "active" ? "success" : "danger"}
                      >
                        {t(`agents.${cred.status || "active"}`)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                          {cred.key_prefix}...
                        </code>
                        <button
                          onClick={() => onCopyPrefix(cred.key_prefix, cred.id)}
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                          title={t("credentials.copyKey")}
                        >
                          {copiedCredId === cred.id ? (
                            <Check className="h-3.5 w-3.5 text-success-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {capitalize(cred.credential_type || "api_key")}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {t("credentials.created")} {formatRelativeTime(cred.created_at)}
                      </span>
                      {cred.expires_at && (
                        <span className="text-xs text-zinc-400">
                          {t("credentials.expires")} {formatDate(cred.expires_at)}
                        </span>
                      )}
                      {cred.last_used_at && (
                        <span className="text-xs text-zinc-400">
                          {t("credentials.lastUsed")} {formatRelativeTime(cred.last_used_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cred.status !== "revoked" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRevoke(cred.id)}
                        disabled={revokeLoading}
                        title={t("credentials.revoke")}
                      >
                        <Ban className="h-4 w-4" />
                        {t("credentials.revoke")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Activity Tab
 * ───────────────────────────────────────────── */

function ActivityTab({
  activities,
  isLoading,
}: {
  activities: any[];
  isLoading: boolean;
}) {
  const { t } = useI18n();
  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
          {t("agents.activity")}
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Recent audit log entries for this agent
        </p>
      </div>

      {activities.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Activity className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
              {t("dashboard.noActivity")}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Activity will appear here once this agent starts making requests.
            </p>
          </div>
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {activities.map((entry: any) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex-shrink-0">
                  {entry.status === "success" ? (
                    <CheckCircle className="h-5 w-5 text-success-500" />
                  ) : entry.status === "denied" ? (
                    <Shield className="h-5 w-5 text-warning-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-danger-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">
                    <span className="font-medium">{entry.action}</span>
                    {entry.resource_type && (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {" "}on {entry.resource_type}
                      </span>
                    )}
                    {entry.resource_id && (
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {" "}({entry.resource_id})
                      </span>
                    )}
                  </p>
                  {entry.details && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                      {typeof entry.details === "string"
                        ? entry.details
                        : JSON.stringify(entry.details)}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    entry.status === "success"
                      ? "success"
                      : entry.status === "denied"
                      ? "warning"
                      : "danger"
                  }
                >
                  {entry.status}
                </Badge>
                <span className="text-xs text-zinc-400 whitespace-nowrap flex-shrink-0">
                  {formatRelativeTime(entry.created_at)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Metrics Tab
 * ───────────────────────────────────────────── */

function MetricsTab({ metrics, isLoading }: { metrics: any; isLoading: boolean }) {
  const { t } = useI18n();
  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <div className="text-center py-12">
          <BarChart3 className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
            No metrics data
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Metrics will populate once this agent starts processing requests.
          </p>
        </div>
      </Card>
    );
  }

  const statCards = [
    {
      label: t("dashboard.totalRequests"),
      value: metrics.requests_today?.toLocaleString() ?? "0",
      icon: Activity,
      color: "text-primary-500",
      bg: "bg-primary-50 dark:bg-primary-950",
    },
    {
      label: "Requests This Week",
      value: metrics.requests_week?.toLocaleString() ?? "0",
      icon: BarChart3,
      color: "text-success-500",
      bg: "bg-success-50 dark:bg-green-950",
    },
    {
      label: t("dashboard.errorRate"),
      value: `${(metrics.error_rate ?? 0).toFixed(1)}%`,
      icon: AlertTriangle,
      color: metrics.error_rate > 5 ? "text-danger-500" : "text-success-500",
      bg: metrics.error_rate > 5 ? "bg-danger-50 dark:bg-red-950" : "bg-success-50 dark:bg-green-950",
    },
    {
      label: "Avg Response Time",
      value: metrics.avg_response_ms ? `${metrics.avg_response_ms.toFixed(0)}ms` : "—",
      icon: Zap,
      color: "text-warning-500",
      bg: "bg-warning-50 dark:bg-yellow-950",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Volume Chart */}
        <Card>
          <CardHeader
            title="Request Volume"
            description="Requests over the last 24 hours"
          />
          <div className="h-72">
            {metrics.hourly_activity && metrics.hourly_activity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.hourly_activity}>
                  <defs>
                    <linearGradient id="requestGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 12, fill: "#71717a" }}
                    tickFormatter={(h) => `${h}:00`}
                  />
                  <YAxis tick={{ fontSize: 12, fill: "#71717a" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                    labelFormatter={(h) => `${h}:00`}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="#6366f1"
                    fill="url(#requestGradient)"
                    strokeWidth={2}
                    name={t("common.requests")}
                  />
                  <Area
                    type="monotone"
                    dataKey="errors"
                    stroke="#f43f5e"
                    fill="#f43f5e"
                    fillOpacity={0.08}
                    strokeWidth={2}
                    name={t("common.errors")}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-400">
                {t("common.noData")}
              </div>
            )}
          </div>
        </Card>

        {/* Daily Breakdown Chart */}
        <Card>
          <CardHeader
            title="Daily Breakdown"
            description="Request breakdown by day"
          />
          <div className="h-72">
            {metrics.daily_activity && metrics.daily_activity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.daily_activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "#71717a" }}
                  />
                  <YAxis tick={{ fontSize: 12, fill: "#71717a" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                  />
                  <Bar
                    dataKey="requests"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    name={t("common.requests")}
                  />
                  <Bar
                    dataKey="errors"
                    fill="#f43f5e"
                    radius={[4, 4, 0, 0]}
                    name={t("common.errors")}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-400">
                {t("common.noData")}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Error Breakdown */}
      {metrics.error_breakdown && metrics.error_breakdown.length > 0 && (
        <Card>
          <CardHeader title="Error Breakdown" description="Most common errors" />
          <div className="space-y-3">
            {metrics.error_breakdown.map((err: any, idx: number) => {
              const percentage =
                metrics.requests_today > 0
                  ? ((err.count / metrics.requests_today) * 100).toFixed(1)
                  : "0";
              return (
                <div key={idx} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {err.error_type || err.code || `Error ${idx + 1}`}
                      </span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400 flex-shrink-0 ml-3">
                        {err.count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-danger-500 transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            metrics.requests_today > 0
                              ? (err.count / metrics.requests_today) * 100
                              : 0
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
