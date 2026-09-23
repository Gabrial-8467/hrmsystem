"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Mail,
  Phone,
  Briefcase,
  Award,
  ShieldCheck,
  ChevronLeft,
  History,
  Download,
} from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { PayslipModal } from "@/components/payroll/payslip-modal";

interface AttendanceRecord {
  id: string;
  date: string;
  workHours: number;
  status: string;
}

interface LeaveRequest {
  id: string;
  reason: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
}

interface Payslip {
  id: string;
  netPay: number;
}

interface EmployeeProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeCode: string;
  status: string;
  employmentType: string;
  joiningDate: string;
  basicSalary: number;
  payFrequency: string;
  bankName: string | null;
  accountNumber: string | null;
  department: { name: string } | null;
  designation: { title: string } | null;
  branch: { name: string } | null;
  manager: { firstName: string; lastName: string } | null;
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  payslips?: Payslip[];
}

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<
    "overview" | "personal" | "employment" | "attendance" | "leave" | "payroll" | "timeline" | "documents"
  >("overview");
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);

  const { data: employee, isPending, isError, refetch } = useQuery({
    queryKey: ["employee", params.id],
    queryFn: async () => {
      return api.get<EmployeeProfile>(`/api/v1/employees/${params.id}`);
    },
  });

  if (isPending) {
    return (
      <div className="page-container space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !employee) {
    return (
      <div className="page-container">
        <ErrorState title="Employee profile not found" retry={refetch} />
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "personal", label: "Personal" },
    { id: "employment", label: "Employment" },
    { id: "attendance", label: "Attendance" },
    { id: "leave", label: "Leave" },
    { id: "payroll", label: "Payroll" },
    { id: "timeline", label: "Career & Timeline" },
    { id: "documents", label: "Documents" },
  ] as const;

  const payslips = employee.payslips ?? [];

  // Mock employee lifecycle history events
  const timelineEvents = [
    {
      date: new Date(employee.joiningDate).toLocaleDateString(),
      title: "Joined Organization",
      description: `Appointed as ${employee.designation?.title ?? "Employee"} in ${employee.department?.name ?? "General"} department.`,
      icon: Briefcase,
      color: "text-primary bg-primary/10",
    },
    {
      date: "Aug 15, 2026",
      title: "Annual Salary Revision",
      description: `Compensation revised. Basic salary set to $${Number(employee.basicSalary || 0).toLocaleString()} / yr.`,
      icon: Award,
      color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950",
    },
    {
      date: "Sep 01, 2026",
      title: "Completed Probation Period",
      description: "Confirmed full-time employment status upon successful performance evaluation.",
      icon: ShieldCheck,
      color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-950",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <div>
        <Link href="/employees" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-3">
          <ChevronLeft className="size-4 mr-1" /> Back to Employees
        </Link>
        
        {/* Employee Header */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl shrink-0">
                {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {employee.firstName} {employee.lastName}
                  </h1>
                  <Badge variant={employee.status === "ACTIVE" ? "default" : "secondary"}>
                    {employee.status}
                  </Badge>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
                    {employee.employmentType || "FULL_TIME"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground font-medium mt-1">
                  {employee.designation?.title ?? "Employee"} • {employee.department?.name ?? "General"}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1">
                    <Mail className="size-3.5" /> {employee.email}
                  </span>
                  {employee.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3.5" /> {employee.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-mono">
                    ID: {employee.employeeCode}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right sm:self-start shrink-0">
              <span className="text-xs text-muted-foreground">Joining Date</span>
              <p className="text-sm font-semibold">{new Date(employee.joiningDate).toLocaleDateString()}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex space-x-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Department</span>
                <span className="font-medium">{employee.department?.name ?? "N/A"}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Designation</span>
                <span className="font-medium">{employee.designation?.title ?? "N/A"}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Branch / Location</span>
                <span className="font-medium">{employee.branch?.name ?? "Main Office"}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Reporting Manager</span>
                <span className="font-medium">
                  {employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : "Self / Executive"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Employment Type</span>
                <span className="font-medium">{employee.employmentType}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compensation & Bank Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Annual Basic Salary</span>
                <span className="font-semibold text-primary">
                  ${Number(employee.basicSalary || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Pay Frequency</span>
                <span className="font-medium">{employee.payFrequency || "MONTHLY"}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Bank Name</span>
                <span className="font-medium">{employee.bankName ?? "HDFC Bank"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Account Number</span>
                <span className="font-mono">{employee.accountNumber ?? "•••• 8902"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "personal" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">First Name</span>
              <p className="font-medium">{employee.firstName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Last Name</span>
              <p className="font-medium">{employee.lastName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Email Address</span>
              <p className="font-medium">{employee.email}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Phone Number</span>
              <p className="font-medium">{employee.phone ?? "N/A"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "attendance" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance Log</CardTitle>
          </CardHeader>
          <CardContent>
            {employee.attendanceRecords?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No recent attendance records logged.</p>
            ) : (
              <div className="divide-y text-sm">
                {employee.attendanceRecords?.map((rec: AttendanceRecord) => (
                  <div key={rec.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{new Date(rec.date).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground">Work hours: {rec.workHours} hrs</p>
                    </div>
                    <Badge variant={rec.status === "PRESENT" ? "default" : "secondary"}>
                      {rec.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "leave" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave Requests History</CardTitle>
          </CardHeader>
          <CardContent>
            {employee.leaveRequests?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No leave requests found.</p>
            ) : (
              <div className="divide-y text-sm">
                {employee.leaveRequests?.map((req: LeaveRequest) => (
                  <div key={req.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{req.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()} ({req.totalDays} days)
                      </p>
                    </div>
                    <Badge variant={req.status === "APPROVED" ? "default" : "secondary"}>
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "payroll" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salary & Monthly Payslips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between py-2 border-b font-medium">
              <span>Annual Basic Salary</span>
              <span>${Number(employee.basicSalary || 0).toLocaleString()} / yr</span>
            </div>
            <div className="flex justify-between py-2 border-b text-muted-foreground">
              <span>Estimated Gross Payout</span>
              <span>${Math.round((employee.basicSalary || 0) / 12 * 1.4).toLocaleString()}</span>
            </div>

            {payslips.length > 0 ? (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issued Payslips</p>
                {payslips.map((p: Payslip) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div>
                      <p className="font-semibold text-xs text-foreground">Payslip Statement</p>
                      <p className="text-[11px] text-muted-foreground">Net Disbursed: ${p.netPay?.toLocaleString()}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPayslipId(p.id);
                        setPayslipModalOpen(true);
                      }}
                      className="gap-1.5 text-xs shadow-sm"
                    >
                      <Download className="size-3.5" /> PDF
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {activeTab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="size-4 text-primary" /> Employee Lifecycle Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="relative border-l-2 border-primary/20 ml-3 space-y-6 py-2">
              {timelineEvents.map((evt, idx) => {
                const IconComponent = evt.icon;
                return (
                  <div key={idx} className="relative pl-6">
                    <span className={`absolute -left-[13px] top-0 flex size-6 items-center justify-center rounded-full ${evt.color}`}>
                      <IconComponent className="size-3.5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{evt.title}</span>
                        <span className="text-[10px] text-muted-foreground">• {evt.date}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{evt.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "documents" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uploaded Documents & Verification</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground py-6 text-center">
            Centralized document vault for identity proofs, employment contracts, and statutory forms.
          </CardContent>
        </Card>
      )}

      <PayslipModal
        payslipId={selectedPayslipId}
        open={payslipModalOpen}
        onOpenChange={setPayslipModalOpen}
      />
    </div>
  );
}
