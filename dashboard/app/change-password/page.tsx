import type { Metadata } from "next";
import { ForcedChangePasswordPage } from "@/components/auth/forced-change-password-page";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return <ForcedChangePasswordPage />;
}