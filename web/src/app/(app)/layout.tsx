import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <TopBar user={user} />
      <main className="w-full px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
