"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Save, Shield } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/auth/session";
import { api, errorMessage } from "@/lib/api/client";
import { P } from "@/lib/permissions";
import { toast } from "sonner";

interface OrgProfile {
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string;
  currency: string;
  dateFormat: string;
}

export default function SettingsPage() {
  const { hasPermission } = useSession();
  const canView = hasPermission(P.organizationView) || hasPermission(P.settingsView);
  const canUpdate = hasPermission(P.organizationUpdate) || hasPermission(P.settingsManage);

  const [form, setForm] = useState({ name: "", slug: "", timezone: "", currency: "", dateFormat: "", email: "", phone: "", website: "", address: "" });

  const { isLoading } = useQuery({
    queryKey: ["orgSettings"],
    queryFn: async () => {
      const data = await api.get<OrgProfile>("/api/v1/organizations/me");
      setForm({
        name: data.name,
        slug: data.slug,
        timezone: data.timezone,
        currency: data.currency,
        dateFormat: data.dateFormat,
        email: data.email ?? "",
        phone: data.phone ?? "",
        website: data.website ?? "",
        address: data.address ?? "",
      });
      return data;
    },
    enabled: canView,
  });

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.patch("/api/v1/organizations/me", {
        timezone: form.timezone.trim(),
        currency: form.currency.trim(),
        dateFormat: form.dateFormat.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
      }),
    onSuccess: () => toast.success("Organization settings saved"),
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Organization & Platform Settings"
        description="Configure company preferences, timezone, currency standards, and security policies."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-primary" /> Company Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading organization profile...</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Organization Legal Name</Label>
                    <Input id="orgName" value={form.name} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Company Domain Identifier</Label>
                    <Input id="slug" value={form.slug} disabled className="bg-muted font-mono text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-1">
                    <Label htmlFor="tz">Timezone</Label>
                    <Input
                      id="tz"
                      value={form.timezone}
                      onChange={set("timezone")}
                      disabled={!canUpdate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="curr">Base Currency</Label>
                    <Input
                      id="curr"
                      value={form.currency}
                      maxLength={3}
                      onChange={set("currency")}
                      disabled={!canUpdate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="df">Date Format</Label>
                    <Input
                      id="df"
                      value={form.dateFormat}
                      onChange={set("dateFormat")}
                      disabled={!canUpdate}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="oemail">Support Email</Label>
                    <Input id="oemail" type="email" value={form.email} onChange={set("email")} disabled={!canUpdate} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ophone">Phone</Label>
                    <Input id="ophone" value={form.phone} onChange={set("phone")} disabled={!canUpdate} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="oweb">Website</Label>
                  <Input id="oweb" type="url" value={form.website} onChange={set("website")} disabled={!canUpdate} placeholder="https://" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="oadd">Registered Address</Label>
                  <Input id="oadd" value={form.address} onChange={set("address")} disabled={!canUpdate} />
                </div>

                {canUpdate && (
                  <Button type="submit" className="gap-2" disabled={saveMutation.isPending}>
                    <Save className="size-4" /> {saveMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="size-4 text-emerald-600" /> Security & Authentication Policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between items-center py-2 border-b">
              <div>
                <p className="font-semibold">Session Timeout</p>
                <p className="text-xs text-muted-foreground">Auto logout after 15 minutes of inactivity</p>
              </div>
              <span className="font-medium text-xs bg-muted px-2 py-1 rounded">15 mins</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <div>
                <p className="font-semibold">Password Throttling</p>
                <p className="text-xs text-muted-foreground">Lock account after 5 failed login attempts</p>
              </div>
              <span className="font-medium text-xs bg-muted px-2 py-1 rounded">Enabled</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-semibold">Bearer Token Sessions</p>
                <p className="text-xs text-muted-foreground">JWT access & refresh tokens via Authorization header (no cookies)</p>
              </div>
              <span className="font-medium text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 px-2 py-1 rounded">Enforced</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}