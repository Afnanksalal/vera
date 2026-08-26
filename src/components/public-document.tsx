import type { ReactNode } from "react";
import Link from "next/link";

export type DocumentLink = { href: string; label: string };

export function PublicDocument({
  eyebrow,
  title,
  summary,
  updated,
  links,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updated?: string;
  links: DocumentLink[];
  children: ReactNode;
}) {
  return (
    <div data-public-page>
      <header className="border-b border-border bg-secondary/35">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-18">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">{summary}</p>
          {updated ? <p className="mt-4 text-xs text-muted-foreground">Last updated {updated}</p> : null}
        </div>
      </header>
      <div className="mx-auto grid min-w-0 w-full max-w-6xl gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-16">
        <aside className="min-w-0">
          <nav aria-label={`${title} sections`} className="min-w-0 lg:sticky lg:top-24">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
            <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
              {links.map((link) => (
                <a key={link.href} href={link.href} className="shrink-0 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  {link.label}
                </a>
              ))}
            </div>
          </nav>
        </aside>
        <article className="min-w-0 max-w-3xl">{children}</article>
      </div>
    </div>
  );
}

export function DocumentSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border py-9 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 grid gap-4 text-[15px] leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

export function DocumentList({ children }: { children: ReactNode }) {
  return <ul className="grid list-disc gap-2 pl-5 marker:text-brand">{children}</ul>;
}

export function DocumentCallout({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-xl border border-brand/20 bg-brand/[0.035] p-4"><p className="font-medium text-foreground">{title}</p><div className="mt-1">{children}</div></div>;
}

export function DocumentLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="font-medium text-brand underline-offset-4 hover:underline">{children}</Link>;
}
