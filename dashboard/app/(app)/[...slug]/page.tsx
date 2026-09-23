"use client";

import { useParams } from "next/navigation";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { slugToTitle } from "@/lib/utils";

export default function ModulePlaceholderPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug.join("/") : (params.slug ?? "");
  const title = slugToTitle(slug || "Module");

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={slug || "Module"}
        title={title}
        description="This module is under active development."
      />
      <EmptyState
        icon={Construction}
        title={`${title} is coming soon`}
        description="We're building this feature for the next phase of the platform. Check back shortly."
      />
    </div>
  );
}