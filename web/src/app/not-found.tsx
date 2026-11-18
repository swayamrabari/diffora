import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            404
          </p>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The page you are looking for does not exist.
            </p>
          </div>
          <Link href="/dashboard" className={buttonVariants()}>
            Go to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
