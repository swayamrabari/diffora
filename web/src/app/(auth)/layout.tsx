export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      {/* Faint dot-grid backdrop that fades out toward the edges. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,#000_35%,transparent_80%)] [-webkit-mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,#000_35%,transparent_80%)]"
      />

      {children}
    </div>
  );
}
