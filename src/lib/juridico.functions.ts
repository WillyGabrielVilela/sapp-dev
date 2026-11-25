import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirSessao } from "@/lib/auth-middleware";
import type { Gru, ItemLista, ListaSaida, ListaSaidaResumo, Parametro, Processo } from "@/lib/tipos";

const ID = z.string().uuid();
const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CANAL = z.enum(["correios", "whatsapp", "doe", "em_maos"]);
const DADOS = {
  numeroAi: z.string().max(20),
  documento: z.string().max(30),
  nomeFantasia: z.string().max(200),
  bairro: z.string().max(100),
};

export const protocolarFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, ...DADOS, obs: z.string().max(2000) }))
  .handler(async ({ context, data }): Promise<string> => {
    const { comUsuario } = await import("@/server/db.server");
    return comUsuario(context.sessao.id, async (c) =>
      (
        await c.query<{ p: string }>("select protocolar_processo($1, $2, $3, $4, $5, $6) as p", [
          data.processoId, data.numeroAi, data.documento, data.nomeFantasia, data.bairro, data.obs,
        ])
      ).rows[0]!.p,
    );
  });

export const atualizarDadosFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, ...DADOS }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) =>
      c.query("select atualizar_dados_notificacao($1, $2, $3, $4, $5)", [data.processoId, data.numeroAi, data.documento, data.nomeFantasia, data.bairro]),
    );
    return { ok: true as const };
  });

export const criarListaFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoIds: z.array(ID).min(1).max(500), canal: CANAL, data: DATA, titulo: z.string().max(200) }))
  .handler(async ({ context, data }): Promise<string> => {
    const { comUsuario } = await import("@/server/db.server");
    return comUsuario(context.sessao.id, async (c) =>
      (
        await c.query<{ id: string }>("select criar_lista_saida($1::uuid[], $2::canal_notificacao, $3::date, $4) as id", [
          data.processoIds, data.canal, data.data, data.titulo,
        ])
      ).rows[0]!.id,
    );
  });

export const listarListasFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<ListaSaidaResumo[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "juridico", "gestao");
    return comUsuario(context.sessao.id, async (c) =>
      (
        await c.query<ListaSaidaResumo>(
          `select l.*, count(n.id)::int as total, count(n.id) filter (where n.resultado = 'pendente')::int as pendentes
             from listas_saida l left join notificacoes n on n.lista_id = l.id
            group by l.id order by l.data desc, l.numero_dia desc`,
        )
      ).rows,
    );
  });

export const obterListaFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: ID }))
  .handler(async ({ context, data }): Promise<{ lista: ListaSaida; itens: ItemLista[] } | null> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "juridico", "gestao");
    return comUsuario(context.sessao.id, async (c) => {
      const lista = (await c.query<ListaSaida>("select * from listas_saida where id = $1", [data.id])).rows[0];
      if (!lista) return null;
      const itens = (
        await c.query<ItemLista>(
          `select n.*, p.numero, p.numero_ai, p.proprietario, p.nome_fantasia, p.documento_autuado, p.bairro
             from notificacoes n join processos p on p.id = n.processo_id
            where n.lista_id = $1 order by p.numero`,
          [data.id],
        )
      ).rows;
      return { lista, itens };
    });
  });

export const registrarResultadoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(
    z.object({
      notificacaoId: ID,
      resultado: z.enum(["entregue", "devolvido", "recusado", "mudou_se"]),
      data: DATA,
      recebedor: z.string().max(200),
      obs: z.string().max(2000),
    }),
  )
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) =>
      c.query("select registrar_resultado_notificacao($1, $2::resultado_notificacao, $3::date, $4, $5)", [
        data.notificacaoId, data.resultado, data.data, data.recebedor, data.obs,
      ]),
    );
    return { ok: true as const };
  });

export const registrarDefesaFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, data: DATA, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select registrar_defesa($1, $2::date, $3)", [data.processoId, data.data, data.obs]));
    return { ok: true as const };
  });

export const encerrarPrazoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select encerrar_prazo_defesa($1, $2)", [data.processoId, data.obs]));
    return { ok: true as const };
  });

// ---------- modo de teste (MODO_TESTE=true) ----------
export const modoTesteFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async (): Promise<boolean> => {
    const { modoTeste } = await import("@/server/teste.server");
    return modoTeste();
  });

export const anteciparPrazoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID }))
  .handler(async ({ context, data }) => {
    const { exigirPapel } = await import("@/server/guarda.server");
    const { anteciparPrazo } = await import("@/server/teste.server");
    exigirPapel(context.sessao, "juridico");
    await anteciparPrazo(context.sessao.id, data.processoId, 15);
    return { ok: true as const };
  });

// ---------- fase 3: GRU ----------
export const registrarGruFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID, numeroGru: z.string().max(60), vencimento: DATA, obs: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) =>
      c.query("select registrar_gru($1, $2, $3::date, $4)", [data.processoId, data.numeroGru, data.vencimento, data.obs]),
    );
    return { ok: true as const };
  });

export const obterEspelhoGruFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID }))
  .handler(async ({ context, data }): Promise<{ processo: Processo; gru: Gru; parametros: Parametro[] } | null> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "juridico", "gestao");
    return comUsuario(context.sessao.id, async (c) => {
      const processo = (await c.query<Processo>("select * from processos where id = $1", [data.processoId])).rows[0];
      const gru = (await c.query<Gru>("select * from grus where processo_id = $1", [data.processoId])).rows[0];
      if (!processo || !gru) return null;
      const parametros = (await c.query<Parametro>("select chave, valor from parametros")).rows;
      return { processo, gru, parametros };
    });
  });

export const listarParametrosFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<Parametro[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "admin");
    return comUsuario(context.sessao.id, async (c) => (await c.query<Parametro>("select chave, valor from parametros order by chave")).rows);
  });

export const definirParametroFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ chave: z.string().max(60), valor: z.string().max(1000) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select definir_parametro($1, $2)", [data.chave, data.valor]));
    return { ok: true as const };
  });

export const anteciparGruFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ processoId: ID }))
  .handler(async ({ context, data }) => {
    const { exigirPapel } = await import("@/server/guarda.server");
    const { anteciparGru } = await import("@/server/teste.server");
    exigirPapel(context.sessao, "juridico");
    await anteciparGru(context.sessao.id, data.processoId, 15);
    return { ok: true as const };
  });
