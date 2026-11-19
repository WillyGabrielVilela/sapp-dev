import { createMiddleware } from "@tanstack/react-start";

/** Exige sessão válida (cookie) e entrega `context.sessao` à server function. */
export const exigirSessao = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { obterSessao } = await import("@/server/auth.server");
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada. Entre novamente.");
  return next({ context: { sessao } });
});
