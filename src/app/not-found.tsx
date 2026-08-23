import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col justify-center px-5 py-16 sm:px-6">
      <p className="text-xs font-medium tracking-wide text-brand uppercase">404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Nothing to reconcile here.</h1>
      <p className="mt-3 text-muted-foreground">
        That page does not exist. Head back and open the live ledger.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className={cn(buttonVariants(), "h-10 w-fit px-4")}>
          Back to overview
        </Link>
        <Link href="/ledger" className={cn(buttonVariants({ variant: "outline" }), "h-10 w-fit px-4")}>
          Live ledger
        </Link>
      </div>
    </div>
  );
}
