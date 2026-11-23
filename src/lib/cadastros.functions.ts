import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirSessao } from "@/lib/auth-middleware";
import type { Especie, Fiscal, UsuarioAdmin } from "@/lib/tipos";

const PAPEL = z.enum(["cca", "cpma", "juridico", "gestao", "admin", "presidente", "homologador", "advogado"]);
const SETOR_TECNICO = z.enum(["METROLOGIA", "QUALIDADE", "PRE_EMBALADOS"]);

// ---------- espécies ----------
export const listarEspeciesFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<Especie[]> => {
    const { comUsuario } = await import("@/server/db.server");
    return comUsuario(context.sessao.id, async (c) => (await c.query<Especie>("select * from especies order by codigo")).rows);
  });

export const inserirEspecieFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ codigo: z.string().trim().min(1).max(10) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin");
    await comUsuario(context.sessao.id, (c) => c.query("insert into especies (codigo) values ($1)", [data.codigo.toUpperCase()]));
    return { ok: true as const };
  });

export const atualizarEspecieFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ codigo: z.string().min(1).max(10), descricao: z.string().max(200) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin");
    await comUsuario(context.sessao.id, (c) => c.query("update especies set descricao = $2 where codigo = $1", [data.codigo, data.descricao]));
    return { ok: true as const };
  });

// ---------- fiscais ----------
export const listarFiscaisFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<Fiscal[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel, PAPEIS_SETORES } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin", ...PAPEIS_SETORES);
    return comUsuario(context.sessao.id, async (c) => (await c.query<Fiscal>("select * from fiscais order by nome")).rows);
  });

export const inserirFiscalFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(
    z.object({
      nome: z.string().trim().min(1).max(200),
      matricula: z.string().trim().min(1).max(40),
      setor: SETOR_TECNICO,
      especies: z.array(z.string().max(10)).max(100),
    }),
  )
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin", "cpma");
    await comUsuario(context.sessao.id, (c) =>
      c.query("insert into fiscais (nome, matricula, setor_tecnico, especies) values ($1, $2, $3, $4)", [
        data.nome,
        data.matricula,
        data.setor,
        data.especies,
      ]),
    );
    return { ok: true as const };
  });

export const alternarFiscalFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: z.string().uuid(), ativo: z.boolean() }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin", "cpma");
    await comUsuario(context.sessao.id, (c) => c.query("update fiscais set ativo = $2 where id = $1", [data.id, data.ativo]));
    return { ok: true as const };
  });

// ---------- usuários ----------
export const listarPerfisFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<{ id: string; nome: string }[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel, PAPEIS_SETORES } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin", ...PAPEIS_SETORES);
    return comUsuario(context.sessao.id, async (c) =>
      (await c.query<{ id: string; nome: string }>("select id, coalesce(nullif(nome, ''), email) as nome from usuarios")).rows,
    );
  });

export const listarUsuariosFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<UsuarioAdmin[]> => {
    const { comUsuario } = await import("@/server/db.server");
    return comUsuario(context.sessao.id, async (c) => (await c.query<UsuarioAdmin>("select id, nome, email, papeis::text[] as papeis from listar_usuarios()")).rows);
  });

export const definirPapeisFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: z.string().uuid(), papeis: z.array(PAPEL).max(8) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select definir_papeis($1, $2::app_role[])", [data.id, data.papeis]));
    return { ok: true as const };
  });

export const criarUsuarioFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ nome: z.string().trim().min(1).max(200), email: z.string().trim().max(200), senha: z.string().max(200) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    const { hashSenha, validarCredenciais } = await import("@/server/auth.server");
    exigirPapel(context.sessao, "admin");
    validarCredenciais(data.email, data.senha);
    const hash = await hashSenha(data.senha);
    await comUsuario(context.sessao.id, (c) => c.query("select criar_usuario($1, $2, $3)", [data.nome, data.email, hash]));
    return { ok: true as const };
  });

export const redefinirSenhaFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: z.string().uuid(), senha: z.string().max(200) }))
  .handler(async ({ context, data }) => {
    const { exigirPapel } = await import("@/server/guarda.server");
    const { definirSenha } = await import("@/server/auth.server");
    exigirPapel(context.sessao, "admin");
    await definirSenha(data.id, data.senha);
    return { ok: true as const };
  });
