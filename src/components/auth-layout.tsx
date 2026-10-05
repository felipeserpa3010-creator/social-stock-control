import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
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
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col items-center justify-center bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex">
        <Link to="/auth" className="relative flex flex-col items-center gap-4">
          <img src={semadsLogoUrl} alt="SEMADS" className="h-auto w-64 rounded-md object-contain shadow-panel" />
          <span className="text-xl font-extrabold tracking-tight">Controle de Estoque</span>
        </Link>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 flex flex-col items-center gap-3 lg:hidden">
            <img src={semadsLogoUrl} alt="SEMADS" className="h-20 w-auto rounded-md object-contain shadow-panel" />
            <span className="text-lg font-extrabold tracking-tight">Controle de Estoque</span>
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
