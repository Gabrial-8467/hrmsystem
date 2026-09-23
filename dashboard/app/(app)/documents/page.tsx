"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Link2, Trash2, BadgeCheck, Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api/client";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/session";
import { API_URL } from "@/config/env";
import { P } from "@/lib/permissions";

interface EmployeeDocument {
  id: string;
  title: string;
  category: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  expiryDate: string | null;
  verifiedAt: string | null;
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

const CATEGORIES = ["IDENTIFICATION", "CONTRACT", "RESUME", "CERTIFICATE", "TAX", "OTHER"] as const;

const EMPTY_UPLOAD = { title: "", category: "OTHER", employeeId: "" };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { hasPermission, user } = useSession();
  const canUpload = hasPermission(P.documentsUpload);
  const canManage = hasPermission(P.documentsManage);

  const [isOpen, setIsOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD);
  const [file, setFile] = useState<File | null>(null);
  const [linkForm, setLinkForm] = useState({ title: "", url: "", employeeId: "" });

  const { data: docs, isLoading, error } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => api.get<EmployeeDocument[]>("/api/v1/documents"),
  });

  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => api.get<Employee[]>("/api/v1/employees"),
    enabled: canUpload,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["documents"] });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", uploadForm.title.trim() || (file?.name ?? "Untitled document"));
      fd.append("category", uploadForm.category);
      if (uploadForm.employeeId) fd.append("employeeId", uploadForm.employeeId);
      fd.append("file", file as File);
      return api.post<EmployeeDocument>("/api/v1/documents/upload", fd);
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      setIsOpen(false);
      setUploadForm(EMPTY_UPLOAD);
      setFile(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const linkMutation = useMutation({
    mutationFn: async (payload: typeof linkForm) =>
      api.post("/api/v1/documents", {
        title: payload.title.trim(),
        url: payload.url.trim(),
        employeeId: payload.employeeId || null,
      }),
    onSuccess: () => {
      toast.success("Document linked");
      setIsLinkOpen(false);
      setLinkForm({ title: "", url: "", employeeId: "" });
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/api/v1/documents/${id}`, { verified: true }),
    onSuccess: () => {
      toast.success("Document verified");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.del(`/api/v1/documents/${id}`),
    onSuccess: () => {
      toast.success("Document deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(errorMessage(err)),
  });

  const downloadUrl = (d: EmployeeDocument) => `${API_URL}/api/v1/documents/${d.id}/content`;

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow="Central Repository"
        title="Organization Documents & Files"
        description="Centralized document storage for company policies, contracts, tax files, and compliance guides."
        actions={
          canUpload ? (
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setIsLinkOpen(true)}>
                <Link2 className="size-4" /> Add by Link
              </Button>
              <Button className="gap-2" onClick={() => setIsOpen(true)}>
                <Upload className="size-4" /> Upload Document
              </Button>
            </div>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                    Loading documents...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-6 text-center text-destructive" colSpan={6}>
                    {errorMessage(error)}
                  </td>
                </tr>
              ) : docs?.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                    No documents yet. Upload or link your first file.
                  </td>
                </tr>
              ) : (
                docs?.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-primary shrink-0" />
                        <div>
                          <p>{d.title}</p>
                          {d.expiryDate && (
                            <p className="text-xs text-muted-foreground">
                              Expires {new Date(d.expiryDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{d.category}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {d.employee.firstName} {d.employee.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{d.employee.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {d.fileSize !== null ? formatSize(d.fileSize) : "external link"}
                    </td>
                    <td className="px-4 py-3">
                      {d.verifiedAt ? (
                        <Badge variant="default">
                          <BadgeCheck className="mr-1 size-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <a
                          href={downloadUrl(d)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
                        >
                          <Download className="size-3.5" /> Download
                        </a>
                        {canManage && !d.verifiedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={verifyMutation.isPending}
                            onClick={() => verifyMutation.mutate(d.id)}
                          >
                            <BadgeCheck className="size-3.5" /> Verify
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(d.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!file) {
                toast.error("Choose a file to upload");
                return;
              }
              uploadMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="d-file">File</Label>
              <Input
                id="d-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="d-title">Title</Label>
                <Input
                  id="d-title"
                  placeholder={file?.name ?? "Document title"}
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-cat">Category</Label>
                <select
                  id="d-cat"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-owner">Employee</Label>
              <select
                id="d-owner"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={uploadForm.employeeId}
                onChange={(e) => setUploadForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="">Me ({user?.email ?? "current user"})</option>
                {employees?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={uploadMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document by Link</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              linkMutation.mutate(linkForm);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="l-title">Title</Label>
              <Input
                id="l-title"
                value={linkForm.title}
                onChange={(e) => setLinkForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-url">URL</Label>
              <Input
                id="l-url"
                type="url"
                placeholder="https://drive.example.com/policy.pdf"
                value={linkForm.url}
                onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-owner">Employee</Label>
              <select
                id="l-owner"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={linkForm.employeeId}
                onChange={(e) => setLinkForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="">Me ({user?.email ?? "current user"})</option>
                {employees?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsLinkOpen(false)} disabled={linkMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={linkMutation.isPending}>
                {linkMutation.isPending ? "Saving..." : "Link Document"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}