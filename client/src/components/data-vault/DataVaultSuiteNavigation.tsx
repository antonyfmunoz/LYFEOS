import { Link } from "wouter";
import { FileSpreadsheet, FileText, FolderOpen, LayoutDashboard, Presentation, Star, TableProperties } from "lucide-react";
import { cn } from "@/lib/utils";

type DataVaultWorkspace = "vault" | "files" | "sheets" | "canvas" | "slides" | "forms" | "tables";

type DataVaultSuiteNavigationProps = {
  active: DataVaultWorkspace;
};

const workspaces: Array<{
  id: DataVaultWorkspace;
  label: string;
  href: string;
  icon: typeof FolderOpen;
}> = [
  { id: "vault", label: "Vault", href: "/data-vault", icon: Star },
  { id: "files", label: "Files & Docs", href: "/document-vault", icon: FolderOpen },
  { id: "sheets", label: "Sheets", href: "/spreadsheets", icon: FileSpreadsheet },
  { id: "canvas", label: "Canvas", href: "/canvases", icon: LayoutDashboard },
  { id: "slides", label: "Slides", href: "/slides", icon: Presentation },
  { id: "forms", label: "Forms", href: "/forms", icon: FileText },
  { id: "tables", label: "Tables", href: "/databases", icon: TableProperties },
];

/**
 * The suite shell makes the data workspaces one coherent Vault without
 * keeping every editor distinct while sharing one private content layer.
 */
export function DataVaultSuiteNavigation({ active }: DataVaultSuiteNavigationProps) {
  return (
    <section className="space-y-3" data-testid="data-vault-suite-navigation">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/chronilog" className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline">
            <span aria-hidden="true">←</span>
            Back
          </Link>
          <p className="mt-3 text-xs font-mono uppercase tracking-[0.14em] text-primary">Personal workspace suite</p>
          <h1 className="font-orbitron text-2xl">Data Vault</h1>
          <p className="text-sm text-muted-foreground">Your private home for documents, Sheets, Canvas, Slides, Forms, tables, and media.</p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <FileText className="h-4 w-4 text-primary" />
          One private workspace
        </div>
      </div>

      <nav aria-label="Data Vault workspaces" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;
          const selected = workspace.id === active;
          return (
            <Link
              key={workspace.id}
              href={workspace.href}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                selected
                  ? "border-primary/45 bg-primary/15 text-primary"
                  : "border-primary/15 bg-card/35 text-muted-foreground hover:border-primary/35 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {workspace.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
