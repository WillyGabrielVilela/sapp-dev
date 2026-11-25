// Homologação / assinatura em lote ("em cascata"). Cada processo roda dentro de um SAVEPOINT: o que não puder
// avançar (ex.: o homologador julgou aquele processo) é relatado e os demais seguem. As regras continuam sendo
// as das funções SQL, aplicadas uma a uma.
import { comUsuario, traduzirErroBanco } from "./db.server";
import type { ResultadoLote } from "@/lib/tipos";

export async function executarLote(
  usuarioId: string,
  ids: string[],
  fn: "homologar_processo" | "assinar_presidente" | "classificar_nao_pago",
  obs: string,
): Promise<ResultadoLote> {
  const unicos = [...new Set(ids)];
  return comUsuario(usuarioId, async (c) => {
    let feitos = 0;
    const falhas: ResultadoLote["falhas"] = [];
    for (const [i, id] of unicos.entries()) {
      await c.query(`savepoint lote_${i}`);
      try {
        await c.query(`select ${fn}($1, $2)`, [id, obs]);
        await c.query(`release savepoint lote_${i}`);
        feitos++;
      } catch (e) {
        await c.query(`rollback to savepoint lote_${i}`);
        const numero = (await c.query<{ numero: string }>("select numero from processos where id = $1", [id])).rows[0]?.numero ?? id;
        falhas.push({ numero, motivo: traduzirErroBanco(e).message });
      }
    }
    return { feitos, falhas };
  });
}
