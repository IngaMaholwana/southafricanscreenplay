import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 font-display text-2xl text-foreground">Reel not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page isn't in the archive. Head back to the catalogue.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to the archive
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          The projector jammed
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try again or head back to the archive.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mzansi Film Archive" },
      {
        name: "description",
        content:
          "A browsable archive of nearly a thousand South African films, 1898 to today. Search by title, genre, language, and year.",
      },
      { property: "og:title", content: "Mzansi Film Archive" },
      {
        property: "og:description",
        content: "Search and explore nearly a thousand South African films, 1898 to today.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Archivo:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
            <Link to="/" className="group flex items-baseline gap-3">
              <span className="font-display text-xl font-semibold tracking-tight text-foreground group-hover:text-primary">
                Mzansi Film Archive
              </span>
              <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">
                1898–2026
              </span>
            </Link>
            <Link
              to="/"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              Browse films
            </Link>
          </div>
        </header>
        <main className="flex-1">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </main>
        <footer className="border-t border-border py-8">
          <div className="mx-auto w-full max-w-6xl px-4 text-xs text-muted-foreground">
            Mzansi Film Archive — South African cinema, from the first reels of 1898 to today.
            Compiled from public film references; verify details before citation.
          </div>
        </footer>
      </div>
    </QueryClientProvider>
  );
}
