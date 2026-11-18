import Link from "next/link";
import { redirect } from "next/navigation";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
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

  const cards = [
    { label: "Projects", value: projectCount },
    { label: "Versions", value: versions },
    { label: "Comparisons", value: comparisons },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {user.name}.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-sm text-zinc-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Projects</h2>
        </div>

        {projectRows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No projects yet
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Create your first project to start comparing specs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Versions</th>
                  <th className="px-5 py-3 font-medium">Comparisons</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {projectRows.map((project) => (
                  <tr key={project.id}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {project.name}
                      </Link>
                      {project.description ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                          {project.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {project._count.versions}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {project._count.comparisons}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {dateFormat.format(project.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
