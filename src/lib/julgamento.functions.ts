import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirSessao } from "@/lib/auth-middleware";
import type { JulgadorEspecies } from "@/lib/tipos";

const ID = z.string().uuid();

export const minhasEspeciesFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<string[]> => {
    const { comUsuario } = await import("@/server/db.server");
    return comUsuario(context.sessao.id, async (c) =>
      (await c.query<{ especie: string }>("select especie from julgadores_especies where usuario_id = $1 order by especie", [context.sessao.id])).rows.map((r) => r.especie),
    );
  });

export const julgarFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(
    z.object({
      processoId: ID,
      decisao: z.enum(["multa", "arquivamento"]),
      valor: z.number().positive().max(100000000).nullable(),
      fundamentacao: z.string().max(10000),
    }),
  )
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) =>
      c.query("select julgar_processo($1, $2::decisao_julgamento, $3::numeric, $4)", [data.processoId, data.decisao, data.valor, data.fundamentacao]),
    );
    return { ok: true as const };
  });

export const assinarFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select assinar_presidente($1, $2)", [data.processoId, data.obs]));
    return { ok: true as const };
  });

export const homologarFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select homologar_processo($1, $2)", [data.processoId, data.obs]));
    return { ok: true as const };
  });

export const devolverJulgamentoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select devolver_julgamento($1, $2)", [data.processoId, data.obs]));
    return { ok: true as const };
  });

// ---------- distribuição por espécie (administrador) ----------
export const listarJulgadoresFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<JulgadorEspecies[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin");
    return comUsuario(context.sessao.id, async (c) =>
      (
        await c.query<JulgadorEspecies>(
          `select u.id, coalesce(nullif(u.nome, ''), u.email) as nome, u.email,
                  coalesce(array_agg(je.especie order by je.especie) filter (where je.especie is not null), '{}') as especies
             from usuarios u
             join user_roles ur on ur.user_id = u.id and ur.role = 'juridico'
             left join julgadores_especies je on je.usuario_id = u.id
            group by u.id order by 2`,
        )
      ).rows,
    );
  });

export const definirEspeciesJulgadorFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: ID, especies: z.array(z.string().max(10)).max(200) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select definir_especies_julgador($1, $2::text[])", [data.id, data.especies]));
    return { ok: true as const };
  });
