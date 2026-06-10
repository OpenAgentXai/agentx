"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast, Toaster } from "sonner";
import { useI18n } from "@/lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { register, isLoading } = useAuthStore();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    organization_name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error(t("auth.passwordsDontMatch"));
      return;
    }

    if (form.password.length < 8) {
      toast.error(t("auth.passwordMinLength"));
      return;
    }

    try {
      await register(form.email, form.password, form.name, form.organization_name);
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || t("auth.registrationFailed"));
    }
  };

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 text-white font-bold text-2xl mb-4">
            AX
          </div>
          <h1 className="text-3xl font-bold text-white">{t("auth.register")}</h1>
          <p className="text-zinc-400 mt-2">{t("auth.registerSubtitle")}</p>
        </div>

        <Card className="dark:bg-zinc-900 dark:border-zinc-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t("auth.fullName")}
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              placeholder="John Doe"
              required
            />

            <Input
              label={t("auth.email")}
              type="email"
              value={form.email}
              onChange={(e) => updateForm("email", e.target.value)}
              placeholder="john@company.com"
              required
            />

            <Input
              label={t("auth.orgName")}
              value={form.organization_name}
              onChange={(e) => updateForm("organization_name", e.target.value)}
              placeholder="My Company"
              required
            />

            <Input
              label={t("auth.password")}
              type="password"
              value={form.password}
              onChange={(e) => updateForm("password", e.target.value)}
              placeholder="Minimum 8 characters"
              hint="Must be at least 8 characters"
              required
            />

            <Input
              label={t("auth.confirmPassword")}
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateForm("confirmPassword", e.target.value)}
              placeholder={t("auth.confirmPassword")}
              required
            />

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              {t("auth.register")}
            </Button>

            <p className="text-center text-sm text-zinc-500">
              {t("auth.hasAccount")}{" "}
              <Link href="/login" className="text-primary-400 hover:text-primary-300 font-medium">
                {t("auth.signIn")}
              </Link>
            </p>
          </form>
        </Card>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
