import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsAPI, credentialsAPI } from "@/lib/api";
import { toast } from "sonner";

export function useAgents(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["agents", params],
    queryFn: () => agentsAPI.list(params).then((r) => r.data),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentsAPI.get(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useAgentMetrics(id: string) {
  return useQuery({
    queryKey: ["agent-metrics", id],
    queryFn: () => agentsAPI.metrics(id).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 30000,
  });
}

export function useAgentActivity(id: string) {
  return useQuery({
    queryKey: ["agent-activity", id],
    queryFn: () => agentsAPI.activity(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => agentsAPI.create(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Failed to create agent");
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      agentsAPI.update(id, data).then((r) => r.data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      toast.success("Agent updated");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Failed to update agent");
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsAPI.delete(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent deleted");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Failed to delete agent");
    },
  });
}

export function useSuspendAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsAPI.suspend(id).then((r) => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      toast.success("Agent suspended");
    },
  });
}

export function useActivateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsAPI.activate(id).then((r) => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      toast.success("Agent activated");
    },
  });
}

export function useRevokeAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsAPI.revoke(id).then((r) => r.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      toast.success("Agent revoked");
    },
  });
}

// Credentials hooks
export function useCredentials(agentId: string) {
  return useQuery({
    queryKey: ["credentials", agentId],
    queryFn: () => credentialsAPI.list(agentId).then((r) => r.data),
    enabled: !!agentId,
  });
}

export function useCreateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: Record<string, unknown> }) =>
      credentialsAPI.create(agentId, data).then((r) => r.data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ["credentials", agentId] });
      toast.success("Credential created — copy the key now, it won't be shown again");
    },
  });
}

export function useRevokeCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, credId }: { agentId: string; credId: string }) =>
      credentialsAPI.revoke(agentId, credId).then((r) => r.data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ["credentials", agentId] });
      toast.success("Credential revoked");
    },
  });
}
