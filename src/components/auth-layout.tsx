import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { settingsOptions } from "@/lib/queries";
import { semadsLogoUrl } from "@/lib/brand";

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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--sidebar-primary)_24%,transparent)_0,transparent_45%),radial-gradient(circle_at_80%_70%,color-mix(in_oklab,var(--sidebar-accent)_45%,transparent)_0,transparent_40%)]" />
        <Link to="/auth" className="relative flex flex-col items-start gap-2.5">
          <img src={semadsLogoUrl} alt="SEMADS" className="h-auto w-52 rounded-md object-contain shadow-panel" />
          <span className="px-1">
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
            Controle de Estoque das dispensas
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
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src={semadsLogoUrl} alt="SEMADS" className="h-14 w-auto rounded-md object-contain shadow-panel" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold leading-tight">
                {institution}
              </span>
              <span className="block text-[11px] leading-tight text-muted-foreground">
                Controle de Estoque
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
