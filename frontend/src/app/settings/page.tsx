"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/stores/auth-store";
import { authAPI, api } from "@/lib/api";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Settings,
  User,
  ShieldCheck,
  Building2,
  Key,
  Palette,
  Sun,
  Moon,
  Monitor,
  Globe,
  Bell,
  BellOff,
  Lock,
  Smartphone,
  Webhook,
  Gauge,
  Save,
  Plus,
  Trash2,
  Copy,
  Check,
} from "lucide-react";

type TabId = "account" | "security" | "organization" | "api" | "preferences";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("account");

  const tabs: TabConfig[] = [
    { id: "account", label: "Account", icon: User },
    { id: "security", label: t("settings.security"), icon: ShieldCheck },
    { id: "organization", label: "Organization", icon: Building2 },
    { id: "api", label: "API", icon: Key },
    { id: "preferences", label: "Preferences", icon: Palette },
  ];

  // Account state
  const [accountName, setAccountName] = useState(user?.name || "");
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [is2FASetup, setIs2FASetup] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  // Organization state
  const [orgName, setOrgName] = useState("My Organization");
  const [isSavingOrg, setIsSavingOrg] = useState(false);

  // API state
  const [webhooks, setWebhooks] = useState<
    { id: string; url: string; events: string }[]
  >([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState("");
  const [globalRateLimit, setGlobalRateLimit] = useState(1000);
  const [globalDailyLimit, setGlobalDailyLimit] = useState(100000);
  const [isSavingApi, setIsSavingApi] = useState(false);

  // Preferences state
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  const [language, setLanguage] = useState("en");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [alertNotifications, setAlertNotifications] = useState(true);
  const [auditNotifications, setAuditNotifications] = useState(false);

  // Load theme from document
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      setTheme(stored);
    } else if (document.documentElement.classList.contains("dark")) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  }, []);

  useEffect(() => {
    if (user?.totp_enabled !== undefined) {
      setIs2FASetup(user.totp_enabled);
    }
  }, [user]);

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    if (newTheme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    } else {
      document.documentElement.classList.toggle("dark", newTheme === "dark");
    }
    toast.success(`Theme changed to ${newTheme}`);
  };

  const handleSaveAccount = async () => {
    setIsSavingAccount(true);
    try {
      await api.put("/users/me", { name: accountName });
      toast.success(t("common.updatedSuccess"));
    } catch {
      toast.error(t("common.operationFailed"));
    }
    setIsSavingAccount(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t("auth.passwordsDontMatch"));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t("auth.passwordMinLength"));
      return;
    }
    setIsChangingPassword(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error(t("common.operationFailed"));
    }
    setIsChangingPassword(false);
  };

  const handleSetup2FA = async () => {
    try {
      const response = await authAPI.setup2FA();
      const data = response.data?.data || response.data;
      setQrCode(data.qr_code || "");
      setTotpSecret(data.secret || "");
      setShow2FAModal(true);
    } catch {
      toast.error(t("common.operationFailed"));
    }
  };

  const handleAddWebhook = () => {
    if (!newWebhookUrl) {
      toast.error("Please enter a webhook URL");
      return;
    }
    const webhook = {
      id: Date.now().toString(),
      url: newWebhookUrl,
      events: newWebhookEvents || "*",
    };
    setWebhooks([...webhooks, webhook]);
    setNewWebhookUrl("");
    setNewWebhookEvents("");
    toast.success(t("common.createdSuccess"));
  };

  const handleRemoveWebhook = (id: string) => {
    setWebhooks(webhooks.filter((w) => w.id !== id));
    toast.success(t("common.deletedSuccess"));
  };

  const handleSaveApiSettings = async () => {
    setIsSavingApi(true);
    try {
      await api.put("/settings/api", {
        webhooks: webhooks.map((w) => ({
          url: w.url,
          events: w.events.split(",").map((e) => e.trim()),
        })),
        global_rate_limit: globalRateLimit,
        global_daily_limit: globalDailyLimit,
      });
      toast.success(t("common.updatedSuccess"));
    } catch {
      toast.error(t("common.operationFailed"));
    }
    setIsSavingApi(false);
  };

  const handleSavePreferences = async () => {
    try {
      await api.put("/settings/preferences", {
        language,
        email_notifications: emailNotifications,
        alert_notifications: alertNotifications,
        audit_notifications: auditNotifications,
      });
      toast.success(t("common.updatedSuccess"));
    } catch {
      toast.error(t("common.operationFailed"));
    }
  };

  const [copiedSecret, setCopiedSecret] = useState(false);
  const copySecret = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {t("settings.title")}
          </h1>
          <p className="text-zinc-500 mt-1">
            {t("settings.subtitle")}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Tabs Sidebar */}
          <div className="lg:w-56 flex-shrink-0">
            <Card padding="sm">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      activeTab === tab.id
                        ? "bg-primary-600/10 text-primary-600 dark:text-primary-400"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </Card>
          </div>

          {/* Tab Content */}
          <div className="flex-1">
            {/* Account Tab */}
            {activeTab === "account" && (
              <Card>
                <CardHeader
                  title="Account Settings"
                  description="Manage your personal account information"
                />
                <div className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-white text-2xl font-bold">
                      {user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        Profile Photo
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Displayed across the platform
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Input
                      label={t("auth.fullName")}
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Your name"
                    />

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {t("auth.email")}
                      </label>
                      <input
                        type="email"
                        value={user?.email || ""}
                        readOnly
                        className="block w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-500 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400 cursor-not-allowed"
                      />
                      <p className="text-xs text-zinc-400">
                        Email cannot be changed. Contact support if needed.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span>Role: {user?.role || "N/A"}</span>
                      <span>|</span>
                      <span>
                        Member since:{" "}
                        {user?.created_at
                          ? new Date(user.created_at).toLocaleDateString()
                          : "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <Button
                      onClick={handleSaveAccount}
                      isLoading={isSavingAccount}
                    >
                      <Save className="h-4 w-4" />
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader
                    title={t("settings.changePassword")}
                    description="Update your password to keep your account secure"
                  />
                  <form
                    onSubmit={handleChangePassword}
                    className="space-y-4"
                  >
                    <Input
                      label={t("settings.currentPassword")}
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t("settings.currentPassword")}
                      required
                    />
                    <Input
                      label={t("settings.newPassword")}
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t("settings.newPassword")}
                      hint="Minimum 8 characters"
                      required
                    />
                    <Input
                      label={t("settings.confirmNewPassword")}
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t("settings.confirmNewPassword")}
                      error={
                        confirmPassword &&
                        newPassword !== confirmPassword
                          ? t("auth.passwordsDontMatch")
                          : undefined
                      }
                      required
                    />
                    <div className="flex justify-end pt-4 border-t border-zinc-200 dark:border-zinc-700">
                      <Button
                        type="submit"
                        isLoading={isChangingPassword}
                        disabled={
                          !currentPassword ||
                          !newPassword ||
                          newPassword !== confirmPassword
                        }
                      >
                        <Lock className="h-4 w-4" />
                        {t("settings.changePassword")}
                      </Button>
                    </div>
                  </form>
                </Card>

                <Card>
                  <CardHeader
                    title={t("auth.twoFactor")}
                    description="Add an extra layer of security to your account"
                  />
                  <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          Authenticator App
                        </p>
                        <p className="text-xs text-zinc-400">
                          {is2FASetup
                            ? "Two-factor authentication is enabled"
                            : "Not configured yet"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={is2FASetup ? "success" : "default"}>
                        {is2FASetup ? "Enabled" : "Disabled"}
                      </Badge>
                      {!is2FASetup && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSetup2FA}
                        >
                          {t("settings.enable2fa")}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Organization Tab */}
            {activeTab === "organization" && (
              <Card>
                <CardHeader
                  title="Organization Settings"
                  description="Manage your organization details and members"
                />
                <div className="space-y-6">
                  <Input
                    label={t("settings.orgName")}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder={t("settings.orgName")}
                  />

                  <div>
                    <p className="text-xs font-semibold uppercase text-zinc-400 mb-3">
                      {t("groups.members")}
                    </p>
                    <div className="space-y-2">
                      {/* Current user */}
                      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">
                            {user?.name?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {user?.name || "You"}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {user?.email}
                            </p>
                          </div>
                        </div>
                        <Badge variant="info">
                          {user?.role === "admin" ? "Admin" : "Member"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <Button
                      onClick={async () => {
                        setIsSavingOrg(true);
                        try {
                          await api.put("/organizations/me", {
                            name: orgName,
                          });
                          toast.success(t("common.updatedSuccess"));
                        } catch {
                          toast.error(t("common.operationFailed"));
                        }
                        setIsSavingOrg(false);
                      }}
                      isLoading={isSavingOrg}
                    >
                      <Save className="h-4 w-4" />
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* API Tab */}
            {activeTab === "api" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader
                    title="Webhook Configuration"
                    description="Configure webhook endpoints to receive event notifications"
                  />
                  <div className="space-y-4">
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <Input
                          label="Webhook URL"
                          value={newWebhookUrl}
                          onChange={(e) => setNewWebhookUrl(e.target.value)}
                          placeholder="https://your-server.com/webhook"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          label="Events (comma-separated)"
                          value={newWebhookEvents}
                          onChange={(e) =>
                            setNewWebhookEvents(e.target.value)
                          }
                          placeholder="agent.created, policy.updated"
                          hint="Leave empty for all events"
                        />
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleAddWebhook}
                        className="mb-[2px]"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {webhooks.length === 0 && (
                        <div className="text-center py-6 text-zinc-400">
                          <Webhook className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No webhooks configured</p>
                        </div>
                      )}
                      {webhooks.map((wh) => (
                        <div
                          key={wh.id}
                          className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                        >
                          <div>
                            <p className="text-sm font-mono text-zinc-900 dark:text-zinc-100">
                              {wh.url}
                            </p>
                            <p className="text-xs text-zinc-400">
                              Events: {wh.events}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveWebhook(wh.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title="Global Rate Limits"
                    description="Configure default rate limits for all API endpoints"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label={t("agents.rateLimit")}
                      type="number"
                      value={globalRateLimit}
                      onChange={(e) =>
                        setGlobalRateLimit(parseInt(e.target.value) || 0)
                      }
                      min={1}
                      max={100000}
                    />
                    <Input
                      label={t("agents.dailyLimit")}
                      type="number"
                      value={globalDailyLimit}
                      onChange={(e) =>
                        setGlobalDailyLimit(parseInt(e.target.value) || 0)
                      }
                      min={1}
                      max={10000000}
                    />
                  </div>
                  <div className="flex justify-end pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <Button
                      onClick={handleSaveApiSettings}
                      isLoading={isSavingApi}
                    >
                      <Save className="h-4 w-4" />
                      {t("common.save")}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === "preferences" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader
                    title="Appearance"
                    description="Customize the look and feel of the platform"
                  />
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                        {t("settings.theme")}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {
                            id: "light" as const,
                            label: t("settings.light"),
                            icon: Sun,
                          },
                          {
                            id: "dark" as const,
                            label: t("settings.dark"),
                            icon: Moon,
                          },
                          {
                            id: "system" as const,
                            label: t("settings.system"),
                            icon: Monitor,
                          },
                        ].map((t) => (
                          <button
                            key={t.id}
                            onClick={() => handleThemeChange(t.id)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                              theme === t.id
                                ? "border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300"
                                : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
                            }`}
                          >
                            <t.icon className="h-5 w-5" />
                            <span className="text-sm font-medium">
                              {t.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Select
                      label={t("settings.language")}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      options={languageOptions}
                    />
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title={t("settings.notifications")}
                    description="Configure which notifications you receive"
                  />
                  <div className="space-y-3">
                    {[
                      {
                        key: "email",
                        label: t("settings.emailNotifications"),
                        description:
                          "Receive important updates via email",
                        checked: emailNotifications,
                        onChange: setEmailNotifications,
                      },
                      {
                        key: "alerts",
                        label: t("settings.alertNotifications"),
                        description:
                          "Get notified about security events and anomalies",
                        checked: alertNotifications,
                        onChange: setAlertNotifications,
                      },
                      {
                        key: "audit",
                        label: "Audit Log Digest",
                        description:
                          "Receive daily summary of audit log activity",
                        checked: auditNotifications,
                        onChange: setAuditNotifications,
                      },
                    ].map((pref) => (
                      <div
                        key={pref.key}
                        className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-3">
                          {pref.checked ? (
                            <Bell className="h-5 w-5 text-primary-500" />
                          ) : (
                            <BellOff className="h-5 w-5 text-zinc-400" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {pref.label}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {pref.description}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => pref.onChange(!pref.checked)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            pref.checked
                              ? "bg-primary-600"
                              : "bg-zinc-300 dark:bg-zinc-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              pref.checked
                                ? "translate-x-6"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <Button onClick={handleSavePreferences}>
                      <Save className="h-4 w-4" />
                      {t("common.save")}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2FA Setup Modal */}
      <Modal
        isOpen={show2FAModal}
        onClose={() => setShow2FAModal(false)}
        title={t("settings.enable2fa")}
        description="Scan the QR code with your authenticator app"
      >
        <div className="space-y-4">
          {qrCode && (
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <img
                src={qrCode}
                alt="2FA QR Code"
                className="w-48 h-48"
              />
            </div>
          )}

          {totpSecret && (
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                Manual Entry Key
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 break-all">
                  {totpSecret}
                </code>
                <button
                  onClick={copySecret}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {copiedSecret ? (
                    <Check className="h-4 w-4 text-success-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          <Input
            label={t("auth.verificationCode")}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            placeholder={t("auth.enterCode")}
            maxLength={6}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <Button
              variant="secondary"
              onClick={() => setShow2FAModal(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                try {
                  await authAPI.verify2FA({
                    code: verificationCode,
                    temp_token: totpSecret,
                  });
                  setIs2FASetup(true);
                  setShow2FAModal(false);
                  toast.success("Two-factor authentication enabled");
                } catch {
                  toast.error(t("auth.invalidCode"));
                }
              }}
              disabled={verificationCode.length !== 6}
            >
              <ShieldCheck className="h-4 w-4" />
              {t("auth.verify")}
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
