"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Toaster, toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { login, verify2FA, isLoading, requires2FA } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      if (!requires2FA) {
        router.push("/dashboard");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || t("auth.loginFailed"));
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verify2FA(totpCode);
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || t("auth.invalidCode"));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 text-white font-bold text-2xl mb-4">
            AX
          </div>
          <h1 className="text-3xl font-bold text-white">AgentX</h1>
          <p className="text-zinc-400 mt-2">Agent Identity & Access Management</p>
        </div>

        <Card className="dark:bg-zinc-900 dark:border-zinc-800">
          {!requires2FA ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <h2 className="text-xl font-semibold text-white">{t("auth.signIn")}</h2>

              <Input
                label={t("auth.email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@agentx.dev"
                required
              />

              <Input
                label={t("auth.password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.password")}
                required
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  <input type="checkbox" className="rounded border-zinc-600" />
                  {t("auth.rememberMe")}
                </label>
                <Link href="/forgot-password" className="text-sm text-primary-400 hover:text-primary-300">
                  {t("auth.forgotPassword")}
                </Link>
              </div>

              <Button type="submit" className="w-full" isLoading={isLoading}>
                {t("auth.signIn")}
              </Button>

              <p className="text-center text-sm text-zinc-500">
                {t("auth.noAccount")}{" "}
                <Link href="/register" className="text-primary-400 hover:text-primary-300 font-medium">
                  {t("auth.signUp")}
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-5">
              <h2 className="text-xl font-semibold text-white">{t("auth.twoFactor")}</h2>
              <p className="text-sm text-zinc-400">
                {t("auth.enterCode")}
              </p>

              <Input
                label={t("auth.verificationCode")}
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                required
                className="text-center text-2xl tracking-widest font-mono"
              />

              <Button type="submit" className="w-full" isLoading={isLoading}>
                {t("auth.verify")}
              </Button>
            </form>
          )}
        </Card>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
