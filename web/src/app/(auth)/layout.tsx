import { CheckIcon } from "lucide-react";
import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const features = [
    "Compare YAML or JSON OpenAPI specs",
    "Review focused, line-level changes",
    "Reopen saved comparisons instantly",
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl lg:grid-cols-2">
        <div className="relative hidden overflow-hidden border-r border-border bg-card p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.12] via-transparent to-transparent" />
          <div className="pointer-events-none absolute -right-24 top-24 size-72 rounded-full bg-primary/[0.06] blur-3xl" />

          <div className="relative">
            <Brand />
          </div>

          <div className="relative max-w-md">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              OpenAPI comparison workspace
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight">
              See exactly what changed.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Diffora turns two API versions into a focused, reviewable diff
              without the noise.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary">
                    <CheckIcon className="size-3" />
                  </span>
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-muted-foreground">
            Diffora · API specification comparison
          </p>
        </div>

        <div className="flex items-center justify-center px-4 py-12 sm:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
