import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirSessao } from "@/lib/auth-middleware";
import type { Evento, Gru, Julgamento, Notificacao, Processo, Recurso } from "@/lib/tipos";

export const listarProcessosFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<Processo[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel, PAPEIS_SETORES } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, ...PAPEIS_SETORES); // admin gerencia o sistema, mas não vê dados dos processos
    return comUsuario(context.sessao.id, async (c) => {
      await c.query("select encerrar_prazos_vencidos()"); // prazo vencido sem defesa segue sozinho
      return (await c.query<Processo>("select * from processos order by updated_at desc")).rows;
    });
  });

export const obterProcessoFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<{ processo: Processo; eventos: Evento[]; notificacoes: Notificacao[]; julgamento: Julgamento | null; gru: Gru | null; recurso: Recurso | null } | null> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel, PAPEIS_SETORES } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, ...PAPEIS_SETORES);
    return comUsuario(context.sessao.id, async (c) => {
      await c.query("select encerrar_prazos_vencidos()");
      const p = (await c.query<Processo>("select * from processos where id = $1", [data.id])).rows[0];
      if (!p) return null;
      // registro de consulta (LGPD): uma linha por abertura da página de detalhe
      await c.query("insert into acesso_logs (processo_id, usuario_id) values ($1, $2)", [p.id, context.sessao.id]);
      const eventos = (await c.query<Evento>("select * from eventos where processo_id = $1 order by criado_em, id", [p.id])).rows;
      const notificacoes = (await c.query<Notificacao>("select * from notificacoes where processo_id = $1 order by criada_em", [p.id])).rows;
      const julgamento = (await c.query<Julgamento>("select * from julgamentos where processo_id = $1", [p.id])).rows[0] ?? null;
      const gru = (await c.query<Gru>("select * from grus where processo_id = $1", [p.id])).rows[0] ?? null;
      const recurso = (await c.query<Recurso>("select * from recursos where processo_id = $1", [p.id])).rows[0] ?? null;
      return { processo: p, eventos, notificacoes, julgamento, gru, recurso };
    });
  });

const ID = z.string().uuid();
const entrada = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("receber"), processoId: ID }),
  z.object({ acao: z.literal("digitalizacao"), processoId: ID }),
  z.object({ acao: z.literal("devolver"), processoId: ID, obs: z.string().max(2000) }),
  z.object({ acao: z.literal("encaminhar"), processoId: ID, obs: z.string().max(2000) }),
  z.object({ acao: z.literal("observacao"), processoId: ID, obs: z.string().max(2000) }),
  z.object({ acao: z.literal("fiscal"), processoId: ID, fiscalId: ID, setor: z.enum(["METROLOGIA", "QUALIDADE", "PRE_EMBALADOS"]) }),
  z.object({
    acao: z.literal("reencaminhar"),
    processoId: ID,
    especie: z.string().max(10),
    abertura: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    proprietario: z.string().max(300),
    obs: z.string().max(2000),
  }),
]);

/** Ações de tramitação CCA/CPMA/Jurídico: lista fechada, cada uma chama a função SQL que aplica a regra. */
export const tramitarFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(entrada)
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, async (c) => {
      switch (data.acao) {
        case "receber":
          return c.query("select receber_processo($1)", [data.processoId]);
        case "digitalizacao":
          return c.query("select registrar_digitalizacao($1)", [data.processoId]);
        case "devolver":
          return c.query("select devolver_processo($1, $2)", [data.processoId, data.obs]);
        case "encaminhar":
          return c.query("select encaminhar_juridico($1, $2)", [data.processoId, data.obs]);
        case "observacao":
          return c.query("select adicionar_observacao($1, $2)", [data.processoId, data.obs]);
        case "fiscal":
          return c.query("select informar_fiscal($1, $2, $3::setor_tecnico)", [data.processoId, data.fiscalId, data.setor]);
        case "reencaminhar":
          return c.query("select reencaminhar_cca($1, $2, $3::date, $4, $5)", [
            data.processoId,
            data.especie || null,
            data.abertura,
            data.proprietario,
            data.obs,
          ]);
      }
    });
    return { ok: true as const };
  });
