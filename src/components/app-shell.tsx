import { useState, type ReactNode } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronLeft,
  ClipboardCheck,
  FileDown,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  PackageMinus,
  Settings,
  ShieldCheck,
  TrendingUp,
  Warehouse,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUnit, UnitProvider } from "@/hooks/useUnit";
import { settingsOptions } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type NavItem = {
  to: "/dashboard" | "/estoque" | "/entrada" | "/saida" | "/conferencia" | "/medias" |
    "/relatorios" | "/historico" | "/conferencias" | "/unidades" | "/produtos" |
    "/usuarios" | "/configuracoes";
  label: string;
  icon: typeof Boxes;
  adminOnly?: boolean;
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operação",
    items: [
      { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
      { to: "/estoque", label: "Estoque", icon: Boxes },
      { to: "/entrada", label: "Entrada", icon: PackagePlus },
      { to: "/saida", label: "Saída", icon: PackageMinus },
      { to: "/conferencia", label: "Conferência", icon: ClipboardCheck },
    ],
  },
  {
    group: "Análise e relatórios",
    items: [
      { to: "/medias", label: "Média de consumo", icon: TrendingUp },
      { to: "/relatorios", label: "Relatórios PDF", icon: FileDown },
      { to: "/historico", label: "Histórico", icon: History },
      { to: "/conferencias", label: "Conferências", icon: ClipboardCheck },
    ],
  },
  {
    group: "Administração",
    items: [
      { to: "/produtos", label: "Produtos e categorias", icon: Warehouse },
      { to: "/unidades", label: "Unidades", icon: Boxes, adminOnly: true },
      { to: "/usuarios", label: "Usuários", icon: ShieldCheck, adminOnly: true },
      { to: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
    ],
  },
];

function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-5">
      {NAV.map((section) => {
        const items = section.items.filter((i) => !i.adminOnly || isAdmin);
        if (!items.length) return null;
        return (
          <div key={section.group}>
            <p
              className={cn(
                "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/55",
                collapsed && "text-center",
              )}
            >
              {collapsed ? section.group.slice(0, 3) : section.group}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      title={item.label}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sidebar-primary" />
                      )}
                      <Icon className="size-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  const { data: settings } = useQuery(settingsOptions());
  const institution = settings?.nome_instituicao?.trim() || "Assistência Social";
  return (
    <div className={cn("flex items-center gap-2.5 px-4 py-4", compact && "justify-center px-0")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-primary/15 ring-1 ring-sidebar-primary/30">
        {settings?.logo_url ? (
          <img src={settings.logo_url} alt="" className="size-7 rounded object-contain" />
        ) : (
          <Boxes className="size-[18px] text-sidebar-primary" />
        )}
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold leading-tight text-sidebar-foreground">
            {institution}
          </span>
          <span className="block truncate text-[11px] leading-tight text-sidebar-foreground/60">
            Controle de Inventário
          </span>
        </span>
      )}
    </div>
  );
}

function UserFooter({ collapsed }: { collapsed?: boolean }) {
  const { profile, role, signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className={cn("border-t border-sidebar-border/70 p-3", collapsed && "px-2")}>
      <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-primary/20 text-xs font-bold text-sidebar-primary">
          {(profile?.nome ?? "?")
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase())
            .join("")}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">
              {profile?.nome ?? "Usuário"}
            </span>
            <span className="block truncate text-[11px] text-sidebar-foreground/60">
              {role === "admin" ? "Administrador Principal" : "Responsável pela unidade"}
            </span>
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          title="Sair do sistema"
          className="size-8 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut />
        </Button>
      </div>
    </div>
  );
}

function UnitSwitcher() {
  const { units, unitId, setUnitId, locked } = useUnit();
  if (!units.length) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="unit-switch" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Unidade
      </label>
      {locked ? (
        <Badge variant="secondary" className="max-w-[220px] truncate">
          {units.find((u) => u.id === unitId)?.nome ?? "—"}
        </Badge>
      ) : (
        <select
          id="unit-switch"
          value={unitId ?? ""}
          onChange={(e) => setUnitId(e.target.value)}
          className="h-8 max-w-[240px] truncate rounded-md border border-input bg-background px-2 text-sm font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] md:flex",
          collapsed ? "w-[74px]" : "w-[264px]",
        )}
      >
        <div className="flex items-center justify-between">
          <Brand compact={collapsed} />
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="mr-2 grid size-7 place-items-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks collapsed={collapsed} />
        </div>
        <UserFooter collapsed={collapsed} />
      </aside>

      {/* Menu lateral em celular */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[272px] gap-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex items-center justify-between border-b border-sidebar-border">
            <Brand />
            <button
              onClick={() => setMobileOpen(false)}
              className="mr-3 grid size-8 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
          <UserFooter />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <button
            onClick={() => setMobileOpen(true)}
            className="grid size-9 place-items-center rounded-md border border-input text-foreground md:hidden"
            title="Abrir menu"
          >
            <Menu className="size-[18px]" />
          </button>
          <div className="flex-1" />
          <UnitSwitcher />
          {isAdmin && (
            <Badge variant="outline" className="hidden gap-1 border-primary/40 text-primary sm:inline-flex">
              <ShieldCheck className="size-3" />
              Administrador
            </Badge>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <UnitProvider>
      <Shell>
        <Outlet />
      </Shell>
    </UnitProvider>
  );
}
