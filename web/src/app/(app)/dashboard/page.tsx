import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  FileCode2,
  FolderKanban,
  FolderPlus,
  GitCompareArrows,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const db = getDb();
  const [projectCount, versions, comparisons, projectRows] = await Promise.all([
    db.project.count({ where: { userId: user.id } }),
    db.apiVersion.count({ where: { project: { userId: user.id } } }),
    db.comparison.count({ where: { project: { userId: user.id } } }),
    db.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        _count: { select: { versions: true, comparisons: true } },
      },
    }),
  ]);

  const stats: Array<{ label: string; value: number; hint: string; icon: LucideIcon }> = [
    { label: "Projects", value: projectCount, hint: "spec workspaces", icon: FolderKanban },
    { label: "Versions", value: versions, hint: "uploaded specs", icon: FileCode2 },
    { label: "Comparisons", value: comparisons, hint: "saved reviews", icon: GitCompareArrows },
  ];

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <Badge variant="outline" className="border-border bg-background/60">
              Workspace overview
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Welcome back, {user.name}. Track your OpenAPI projects, upload new
              versions, and open a comparison to review every change.
            </p>
          </div>
          <NewProjectDialog />
        </div>

        <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} size="sm" className="bg-background/70">
                <CardContent className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground">{stat.hint}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Projects</h2>
              <Badge variant="outline">{projectRows.length}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Each project groups the versions and comparisons for one API.
            </p>
          </div>
        </div>

        {projectRows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <FolderPlus className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">No projects yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first project to start comparing specs.
                </p>
              </div>
              <NewProjectDialog />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projectRows.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group block h-full"
              >
                <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-foreground/20">
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate">{project.name}</span>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </CardTitle>
                    <CardDescription className="line-clamp-2 min-h-10">
                      {project.description || "No description yet."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        <Layers className="size-3" />
                        {project._count.versions} versions
                      </Badge>
                      <Badge variant="outline">
                        {project._count.comparisons} comparisons
                      </Badge>
                    </div>
                  </CardContent>
                  <CardFooter className="text-xs text-muted-foreground">
                    Updated {dateFormat.format(project.updatedAt)}
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
