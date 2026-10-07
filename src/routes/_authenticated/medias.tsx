import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota legada mantida apenas para compatibilidade com links antigos. */
export const Route = createFileRoute("/_authenticated/medias")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
