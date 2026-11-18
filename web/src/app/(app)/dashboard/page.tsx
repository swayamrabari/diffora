import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const db = getDb();
  const [projectCount, versions, comparisons, projects] = await Promise.all([
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

  const stats = [
    { label: "Projects", value: projectCount },
    { label: "Versions", value: versions },
    { label: "Comparisons", value: comparisons },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your projects and comparisons.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardContent className="space-y-1">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-3xl font-semibold tracking-tight">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Projects</h2>
          <Badge variant="outline">{projects.length}</Badge>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm font-medium">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a project to upload specs and compare them.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group block h-full"
              >
                <Card size="sm" className="h-full transition-colors group-hover:ring-foreground/20">
                  <CardContent className="flex h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{project.name}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {project.description || "No description"}
                        </p>
                      </div>
                      <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{project._count.versions} versions</Badge>
                      <Badge variant="outline">{project._count.comparisons} comparisons</Badge>
                      <span className="ms-auto">{formatDate(project.updatedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
