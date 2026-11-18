import Link from "next/link";
import { cn } from "cn";

type BrandProps = {
  href?: string;
  className?: string;
};

export function Brand({ href = "/dashboard", className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 text-foreground transition-opacity hover:opacity-80",
        className,
      )}
    >
      <span className="grid size-5 place-items-center rounded-[6px] bg-zinc-950 text-[10px] font-bold leading-none text-white dark:bg-zinc-50 dark:text-zinc-950">
        D
      </span>
      <span className="text-sm font-semibold tracking-tight">Diffora</span>
    </Link>
  );
}
