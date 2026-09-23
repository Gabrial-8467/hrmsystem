"use client";

import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LeavePoliciesPage() {
  const policies = [
    { name: "Annual Paid Leave", code: "AL", days: "18 days/yr", paid: true, carryForward: "Up to 5 days" },
    { name: "Sick Leave", code: "SL", days: "10 days/yr", paid: true, carryForward: "Non-accumulative" },
    { name: "Casual Leave", code: "CL", days: "6 days/yr", paid: true, carryForward: "Lapses Dec 31" },
    { name: "Maternity Leave", code: "ML", days: "90 days", paid: true, carryForward: "N/A" },
    { name: "Paternity Leave", code: "PL", days: "10 days", paid: true, carryForward: "N/A" },
  ];

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Leave Management"
        title="Leave Types & Quota Policies"
        description="Configure annual leave entitlements, carry-forward limits, and paid leave rules."
        actions={
          <Button className="gap-2">
            <Plus className="size-4" /> Add Policy
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {policies.map((p) => (
          <Card key={p.code}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold">{p.name}</CardTitle>
                  <span className="text-xs font-mono text-muted-foreground">{p.code}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2 text-sm space-y-2">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Entitlement</span>
                <span className="font-bold text-foreground">{p.days}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Type</span>
                <Badge variant={p.paid ? "default" : "secondary"}>{p.paid ? "Paid Leave" : "Unpaid"}</Badge>
              </div>
              <div className="flex justify-between py-1 text-xs">
                <span className="text-muted-foreground">Carry Forward</span>
                <span className="font-medium">{p.carryForward}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
