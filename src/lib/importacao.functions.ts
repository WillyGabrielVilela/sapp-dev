import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirSessao } from "@/lib/auth-middleware";
import type { ArquivoOriginal, ItemImportado } from "@/lib/tipos";

const TAMANHO_MAX = 25 * 1024 * 1024;

export const listarArquivosFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .handler(async ({ context }): Promise<ArquivoOriginal[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "cca", "gestao");
    return comUsuario(context.sessao.id, async (c) => (await c.query<ArquivoOriginal>("select * from arquivos_originais order by enviado_em desc")).rows);
  });

export const listarItensFn = createServerFn({ method: "GET" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ arquivoId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<ItemImportado[]> => {
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    exigirPapel(context.sessao, "cca", "gestao");
    return comUsuario(context.sessao.id, async (c) =>
      (await c.query<ItemImportado>("select * from itens_importados where arquivo_id = $1 order by pagina, linha", [data.arquivoId])).rows,
    );
  });

const LinhaLida = z.object({
  pagina: z.number().int(),
  linha: z.number().int(),
  especie: z.string().nullable(),
  numero: z.string().nullable(),
  abertura: z.string().nullable(),
  aberturaTexto: z.string().nullable(),
  proprietario: z.string().nullable(),
  alertas: z.array(z.string()),
});
const Leitura = z.object({
  layoutReconhecido: z.boolean(),
  temTexto: z.boolean(),
  totalRodape: z.number().int().nullable(),
  linhas: z.array(LinhaLida).max(50000),
  alertasGerais: z.array(z.string()),
});

/** Recebe o PDF original + o resultado da leitura feita no navegador. O hash é recalculado aqui. */
export const enviarArquivoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator((d: FormData) => {
    if (!(d instanceof FormData)) throw new Error("Envio inválido");
    const arquivo = d.get("arquivo");
    if (!(arquivo instanceof File)) throw new Error("Arquivo ausente");
    if (arquivo.size > TAMANHO_MAX) throw new Error("PDF maior que 25 MB");
    const leitura = Leitura.parse(JSON.parse(String(d.get("leitura") ?? "null")));
    return { arquivo, leitura };
  })
  .handler(async ({ context, data }): Promise<{ duplicado: boolean; arquivo: ArquivoOriginal | null }> => {
    const { createHash } = await import("node:crypto");
    const { comUsuario } = await import("@/server/db.server");
    const { exigirPapel } = await import("@/server/guarda.server");
    const { armazenamento } = await import("@/server/storage.server");
    exigirPapel(context.sessao, "cca");
    const bytes = Buffer.from(await data.arquivo.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("O arquivo não é um PDF");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const { leitura } = data;
    const invalido = !leitura.temTexto || !leitura.layoutReconhecido;
    const chave = `${hash}.pdf`;

    const existente = await comUsuario(context.sessao.id, async (c) => (await c.query("select 1 from arquivos_originais where sha256 = $1", [hash])).rowCount);
    if (existente) return { duplicado: true, arquivo: null };

    await armazenamento().salvar(chave, bytes, "application/pdf");

    const arquivo = await comUsuario(context.sessao.id, async (c) => {
      const arq = (
        await c.query<ArquivoOriginal>(
          `insert into arquivos_originais (nome, sha256, caminho, layout, situacao, total_rodape, total_lido, observacao, enviado_por)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
          [
            data.arquivo.name.slice(0, 255),
            hash,
            chave,
            leitura.layoutReconhecido ? "JR5260" : null,
            invalido ? "invalido" : "em_triagem",
            leitura.totalRodape,
            leitura.linhas.length,
            leitura.alertasGerais.join("\n") || null,
            context.sessao.id,
          ],
        )
      ).rows[0]!;
      if (!invalido && leitura.linhas.length) {
        const numeros = leitura.linhas.flatMap((l) => (l.numero ? [l.numero] : []));
        const ja = new Set(
          (await c.query<{ numero: string }>("select numero from processos where numero = any($1::text[])", [numeros])).rows.map((r) => r.numero),
        );
        for (const l of leitura.linhas) {
          await c.query(
            `insert into itens_importados (arquivo_id, pagina, linha, especie, numero, abertura, abertura_texto, proprietario, alertas)
             values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)`,
            [
              arq.id, l.pagina, l.linha, l.especie, l.numero, l.abertura, l.aberturaTexto, l.proprietario,
              l.numero && ja.has(l.numero) ? [...l.alertas, "Já cadastrado na base"] : l.alertas,
            ],
          );
        }
      }
      return arq;
    });
    return { duplicado: false, arquivo };
  });

const campos = z.enum(["especie", "numero", "abertura", "proprietario"]);
export const corrigirItemFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: z.string().uuid(), campo: campos, valor: z.string().max(300) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select corrigir_item($1, $2, $3)", [data.id, data.campo, data.valor]));
    return { ok: true as const };
  });

export const descartarItemFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select descartar_item($1)", [data.id]));
    return { ok: true as const };
  });

export const informarTotalFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ arquivoId: z.string().uuid(), total: z.number().int().min(1) }))
  .handler(async ({ context, data }) => {
    const { comUsuario } = await import("@/server/db.server");
    await comUsuario(context.sessao.id, (c) => c.query("select informar_total_rodape($1, $2)", [data.arquivoId, data.total]));
    return { ok: true as const };
  });

export const confirmarArquivoFn = createServerFn({ method: "POST" })
  .middleware([exigirSessao])
  .inputValidator(z.object({ arquivoId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<number> => {
    const { comUsuario } = await import("@/server/db.server");
    return comUsuario(context.sessao.id, async (c) => (await c.query<{ n: number }>("select confirmar_arquivo($1) as n", [data.arquivoId])).rows[0]!.n);
  });
