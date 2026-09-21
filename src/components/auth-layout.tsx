import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { settingsOptions } from "@/lib/queries";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { data: settings } = useQuery(settingsOptions());
  const institution = settings?.nome_instituicao?.trim() || "Assistência Social";
  const secretaria = settings?.nome_secretaria?.trim();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.75 0.12 158) 0, transparent 45%), radial-gradient(circle at 80% 70%, oklch(0.7 0.13 152) 0, transparent 40%)",
          }}
        />
        <Link to="/auth" className="relative flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-md bg-sidebar-primary/15 ring-1 ring-sidebar-primary/30">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="size-8 rounded object-contain" />
            ) : (
              <Boxes className="size-5 text-sidebar-primary" />
            )}
          </span>
          <span>
            <span className="block text-sm font-bold leading-tight">{institution}</span>
            {secretaria && (
              <span className="block text-[11px] leading-tight text-sidebar-foreground/60">
                {secretaria}
              </span>
            )}
          </span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
            Controle de Inventário das dispensas
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-sidebar-foreground/70">
            Registre entradas e saídas, confira o estoque aproximado de cada unidade, acompanhe a
            média de consumo mensal e emita relatórios prontos para assinatura e arquivamento.
          </p>
          <ul className="mt-6 space-y-2 text-[13px] text-sidebar-foreground/80">
            {[
              "Várias unidades, um único controle",
              "Conferência com registro de diferenças",
              "Relatórios A4 com paginação e assinatura",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0 text-sidebar-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-sidebar-foreground/50">
          Uso interno. O acesso é concedido pelo Administrador Principal.
        </p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-md bg-primary/10 ring-1 ring-primary/20">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="" className="size-7 rounded object-contain" />
              ) : (
                <Boxes className="size-[18px] text-primary" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold leading-tight">
                {institution}
              </span>
              <span className="block text-[11px] leading-tight text-muted-foreground">
                Controle de Inventário
              </span>
            </span>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
