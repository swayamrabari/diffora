import Link from 'next/link';
import { cn } from 'cn';
import { FileDiff } from 'lucide-react';

type BrandProps = {
  href?: string;
  className?: string;
};

export function Brand({ href = '/dashboard', className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 text-foreground transition-opacity hover:opacity-80',
        className,
      )}
    >
      <FileDiff className="size-5 stroke-2.5 shrink-0 text-primary" />
      <span className="text-base font-semibold">Diffora</span>
    </Link>
  );
}
