"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export default function Home() {
  const router = useRouter();
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    if (checkAuth()) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [checkAuth, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center text-white font-bold text-2xl">
          AX
        </div>
        <p className="text-zinc-400 animate-pulse">Loading AgentX...</p>
      </div>
    </div>
  );
}
