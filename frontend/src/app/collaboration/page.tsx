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
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatRelativeTime, capitalize } from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Plus,
  MessageSquare,
  Search,
  Hash,
  Lock,
  Globe,
  Users,
  Send,
  X,
  Radio,
  MessageCircle,
  Workflow,
  Sparkles,
  ChevronRight,
  Bot,
  User,
} from "lucide-react";

interface Channel {
  id: string;
  name: string;
  description: string;
  type: "direct" | "group" | "broadcast";
  visibility: "public" | "private";
  member_count: number;
  last_message_at: string | null;
  created_at: string;
}

interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: "user" | "agent";
  content: string;
  created_at: string;
}

const channelTypeVariant: Record<string, "info" | "success" | "warning"> = {
  direct: "info",
  group: "success",
  broadcast: "warning",
};

const ChannelTypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "direct":
      return <MessageCircle className="h-4 w-4" />;
    case "broadcast":
      return <Radio className="h-4 w-4" />;
    default:
      return <Hash className="h-4 w-4" />;
  }
};

export default function CollaborationPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [newChannel, setNewChannel] = useState({
    name: "",
    description: "",
    type: "group",
    visibility: "public",
  });

  const channelTypeOptions = [
    { value: "group", label: t("collaboration.group") },
    { value: "direct", label: t("collaboration.direct") },
    { value: "broadcast", label: t("collaboration.broadcast") },
  ];

  const visibilityOptions = [
    { value: "public", label: t("collaboration.public") },
    { value: "private", label: t("collaboration.private") },
  ];

  // Fetch channels
  const { data: channelsData, isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get("/collaboration/channels").then((r) => r.data),
  });
  const channels: Channel[] = channelsData?.data || [];

  // Fetch messages for selected channel
  const { data: messagesData } = useQuery({
    queryKey: ["channel-messages", selectedChannel],
    queryFn: () =>
      api
        .get(`/collaboration/channels/${selectedChannel}/messages`)
        .then((r) => r.data),
    enabled: !!selectedChannel,
    refetchInterval: 5000,
  });
  const messages: Message[] = messagesData?.data || [];

  const selectedChannelData = channels.find(
    (c) => c.id === selectedChannel
  );

  const filteredChannels = channels.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase())
  );

  const createChannel = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/collaboration/channels", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success(t("common.createdSuccess"));
      setShowCreate(false);
      setNewChannel({
        name: "",
        description: "",
        type: "group",
        visibility: "public",
      });
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const sendMessage = useMutation({
    mutationFn: (data: { channel_id: string; content: string }) =>
      api.post(`/collaboration/channels/${data.channel_id}/messages`, {
        content: data.content,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["channel-messages", selectedChannel],
      });
      setMessageInput("");
    },
    onError: () => {
      toast.error(t("common.operationFailed"));
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createChannel.mutateAsync({
      name: newChannel.name,
      description: newChannel.description || undefined,
      type: newChannel.type,
      visibility: newChannel.visibility,
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel || !messageInput.trim()) return;
    sendMessage.mutate({
      channel_id: selectedChannel,
      content: messageInput.trim(),
    });
  };

  const columns = [
    {
      key: "name",
      header: t("collaboration.channelName"),
      render: (channel: Channel) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              channel.type === "broadcast"
                ? "bg-warning-50 dark:bg-warning-950"
                : channel.type === "direct"
                ? "bg-primary-50 dark:bg-primary-950"
                : "bg-success-50 dark:bg-green-950"
            }`}
          >
            <ChannelTypeIcon type={channel.type} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-zinc-900 dark:text-white">
                {channel.name}
              </p>
              {channel.visibility === "private" && (
                <Lock className="h-3 w-3 text-zinc-400" />
              )}
            </div>
            <p className="text-xs text-zinc-500 max-w-[250px] truncate">
              {channel.description || t("common.noDescription")}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: t("common.type"),
      render: (channel: Channel) => (
        <Badge variant={channelTypeVariant[channel.type] || "default"}>
          {capitalize(channel.type)}
        </Badge>
      ),
    },
    {
      key: "visibility",
      header: t("collaboration.visibility"),
      render: (channel: Channel) => (
        <div className="flex items-center gap-1.5 text-sm text-zinc-500">
          {channel.visibility === "public" ? (
            <Globe className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          {capitalize(channel.visibility)}
        </div>
      ),
    },
    {
      key: "member_count",
      header: t("groups.members"),
      render: (channel: Channel) => (
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {channel.member_count}
          </span>
        </div>
      ),
    },
    {
      key: "last_message_at",
      header: t("agents.lastActive"),
      render: (channel: Channel) => (
        <span className="text-sm text-zinc-500">
          {channel.last_message_at
            ? formatRelativeTime(channel.last_message_at)
            : t("collaboration.noMessages")}
        </span>
      ),
    },
    {
      key: "actions_col",
      header: "",
      render: (channel: Channel) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedChannel(
              selectedChannel === channel.id ? null : channel.id
            );
          }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
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
              {t("collaboration.title")}
            </h1>
            <p className="text-zinc-500 mt-1">
              {t("collaboration.subtitle")}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("collaboration.createChannel")}
          </Button>
        </div>

        {/* Workflow Designer Teaser */}
        <Card className="border-dashed border-2 border-zinc-300 dark:border-zinc-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Workflow className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Workflow Designer
                  </h3>
                  <Badge variant="warning">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Coming Soon
                  </Badge>
                </div>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Visual workflow builder for multi-agent orchestration.
                  Design complex agent pipelines with drag-and-drop.
                </p>
              </div>
            </div>
            <Button variant="outline" disabled>
              Preview
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Channels List */}
          <div className={selectedChannel ? "lg:col-span-1" : "lg:col-span-3"}>
            <Card padding="none">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder={t("collaboration.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                  />
                </div>
              </div>

              {selectedChannel ? (
                // Compact channel list when a channel is selected
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredChannels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() =>
                        setSelectedChannel(
                          selectedChannel === channel.id
                            ? null
                            : channel.id
                        )
                      }
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        selectedChannel === channel.id
                          ? "bg-primary-50 dark:bg-primary-950/50"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <ChannelTypeIcon type={channel.type} />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${
                            selectedChannel === channel.id
                              ? "text-primary-600 dark:text-primary-400"
                              : "text-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {channel.name}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                          {channel.member_count} {t("groups.memberCount")}
                        </p>
                      </div>
                      {channel.visibility === "private" && (
                        <Lock className="h-3 w-3 text-zinc-400" />
                      )}
                    </button>
                  ))}
                  {filteredChannels.length === 0 && (
                    <div className="text-center py-8 text-zinc-400">
                      <p className="text-sm">{t("collaboration.noChannels")}</p>
                    </div>
                  )}
                </div>
              ) : (
                <Table
                  columns={columns}
                  data={filteredChannels}
                  isLoading={isLoading}
                  keyExtractor={(c: Channel) => c.id}
                  onRowClick={(c: Channel) => setSelectedChannel(c.id)}
                  emptyMessage={t("collaboration.noChannels")}
                />
              )}
            </Card>
          </div>

          {/* Channel Detail & Messages */}
          {selectedChannel && selectedChannelData && (
            <div className="lg:col-span-2">
              <Card padding="none" className="flex flex-col h-[600px]">
                {/* Channel Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center gap-3">
                    <ChannelTypeIcon type={selectedChannelData.type} />
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {selectedChannelData.name}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {selectedChannelData.member_count} {t("groups.memberCount")} -{" "}
                        {capitalize(selectedChannelData.type)} -{" "}
                        {capitalize(selectedChannelData.visibility)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedChannel(null)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                      <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
                      <p className="text-sm font-medium">{t("collaboration.noMessages")}</p>
                      <p className="text-xs mt-1">
                        Start the conversation by sending a message
                      </p>
                    </div>
                  )}
                  {messages.map((msg) => {
                    const isOwnMessage = msg.sender_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${
                          isOwnMessage ? "flex-row-reverse" : ""
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                            msg.sender_type === "agent"
                              ? "bg-primary-100 dark:bg-primary-900/30"
                              : "bg-zinc-200 dark:bg-zinc-700"
                          }`}
                        >
                          {msg.sender_type === "agent" ? (
                            <Bot className="h-4 w-4 text-primary-600" />
                          ) : (
                            <span className="text-zinc-600 dark:text-zinc-300">
                              {msg.sender_name?.charAt(0)?.toUpperCase() ||
                                "U"}
                            </span>
                          )}
                        </div>
                        <div
                          className={`max-w-[70%] ${
                            isOwnMessage ? "items-end" : "items-start"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              {msg.sender_name}
                            </span>
                            <Badge
                              variant={
                                msg.sender_type === "agent"
                                  ? "info"
                                  : "default"
                              }
                              className="text-[10px] px-1.5 py-0"
                            >
                              {capitalize(msg.sender_type)}
                            </Badge>
                            <span className="text-[10px] text-zinc-400">
                              {formatRelativeTime(msg.created_at)}
                            </span>
                          </div>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm ${
                              isOwnMessage
                                ? "bg-primary-600 text-white rounded-tr-md"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-md"
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Message Input */}
                <div className="border-t border-zinc-200 dark:border-zinc-700 px-6 py-4">
                  <form
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-3"
                  >
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder={`Message #${selectedChannelData.name}`}
                      className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                    />
                    <Button
                      type="submit"
                      disabled={!messageInput.trim()}
                      isLoading={sendMessage.isPending}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Create Channel Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={t("collaboration.createChannel")}
        description={t("collaboration.subtitle")}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label={t("collaboration.channelName")}
            value={newChannel.name}
            onChange={(e) =>
              setNewChannel((p) => ({ ...p, name: e.target.value }))
            }
            placeholder="e.g., production-alerts"
            required
          />

          <Input
            label={t("common.description")}
            value={newChannel.description}
            onChange={(e) =>
              setNewChannel((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="Describe the purpose of this channel"
          />

          <Select
            label={t("collaboration.channelType")}
            value={newChannel.type}
            onChange={(e) =>
              setNewChannel((p) => ({ ...p, type: e.target.value }))
            }
            options={channelTypeOptions}
          />

          <Select
            label={t("collaboration.visibility")}
            value={newChannel.visibility}
            onChange={(e) =>
              setNewChannel((p) => ({ ...p, visibility: e.target.value }))
            }
            options={visibilityOptions}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" isLoading={createChannel.isPending}>
              {t("collaboration.createChannel")}
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
