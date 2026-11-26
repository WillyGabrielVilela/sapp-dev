import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirSessao } from "@/lib/auth-middleware";
import type { LinhaGru, ResultadoLote } from "@/lib/tipos";

const ID = z.string().uuid();
const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listarClassificacaoGruFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<LinhaGru[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "advogado", "gestao");
    return comUsuario(context.sessao.id, async (c) =>
      (
        await c.query<LinhaGru>(
          `select p.id as processo_id, p.numero, p.numero_ai, p.proprietario, p.documento_autuado, p.situacao,
                  g.numero_gru, g.valor::text, g.valor_com_desconto::text, g.vencimento, g.pago_em, g.valor_pago::text,
                  r.data_recurso as recurso_em, p.updated_at as atualizado_em
             from processos p
             join grus g on g.processo_id = p.id
             left join recursos r on r.processo_id = p.id
            where p.situacao in ('gru_gerada', 'em_recurso', 'pago', 'nao_pago')
            order by g.vencimento, p.numero`,
        )
      ).rows,
    );
  });

export const registrarPagamentoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, data: DATA, valor: z.number().positive().max(100000000), comDesconto: z.boolean(), obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) =>
      c.query("select registrar_pagamento_gru($1, $2::date, $3::numeric, $4, $5)", [data.processoId, data.data, data.valor, data.comDesconto, data.obs]),
    );
    return { ok: true as const };
  });

export const registrarRecursoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, data: DATA, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select registrar_recurso($1, $2::date, $3)", [data.processoId, data.data, data.obs]));
    return { ok: true as const };
  });

export const classificarNaoPagoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select classificar_nao_pago($1, $2)", [data.processoId, data.obs]));
    return { ok: true as const };
  });

/** Classificação em lote (checkboxes): cada GRU é conferida individualmente (só vencidas viram "não pago"). */
export const classificarNaoPagoLoteFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoIds: z.array(ID).min(1).max(500), obs: z.string().max(2000) }))
  .handler(async ({ context, data }): Promise<ResultadoLote> => {
    const { exigirPapel } = await import("@/server/guarda.server");
    const { executarLote } = await import("@/server/lote.server");
    exigirPapel(context.sessao, "advogado");
    return executarLote(context.sessao.id, data.processoIds, "classificar_nao_pago", data.obs);
  });
