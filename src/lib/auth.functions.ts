import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Sessao } from "@/lib/tipos";

export const obterSessaoFn = createServerFn({ method: "GET" }).handler(async (): Promise<Sessao | null> => {
  const { obterSessao } = await import("@/server/auth.server");
  return obterSessao();
});

export const cadastroAbertoFn = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
  const { cadastroAberto } = await import("@/server/auth.server");
  return cadastroAberto();
});

export const entrarFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().max(200), senha: z.string().max(200) }))
  .handler(async ({ data }) => {
    const { entrar } = await import("@/server/auth.server");
    await entrar(data.email, data.senha);
    return { ok: true as const };
  });

export const cadastrarFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ nome: z.string().min(1).max(200), email: z.string().max(200), senha: z.string().max(200) }))
  .handler(async ({ data }) => {
    const { cadastrar, criarSessaoPara } = await import("@/server/auth.server");
    const id = await cadastrar(data.nome, data.email, data.senha);
    await criarSessaoPara(id);
    return { ok: true as const };
  });

export const sairFn = createServerFn({ method: "POST" }).handler(async () => {
  const { sair } = await import("@/server/auth.server");
  await sair();
  return { ok: true as const };
});
