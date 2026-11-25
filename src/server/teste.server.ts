// SOMENTE PARA TESTE DO FLUXO (MODO_TESTE=true). Em produção deve ficar desligado.
// Recua as datas de um processo em "aguardando defesa" para simular a passagem do tempo.
// O ajuste entra no histórico (imutável) com o prefixo "TESTE:", para nunca passar por fato real.
import { comUsuario } from "./db.server";

export const modoTeste = () => process.env["MODO_TESTE"] === "true";

export async function anteciparPrazo(usuarioId: string, processoId: string, dias: number) {
  if (!modoTeste()) throw new Error("Modo de teste desligado");
  await comUsuario(usuarioId, async (c) => {
    const { rows } = await c.query<{ situacao: string }>("select situacao from processos where id = $1 for update", [processoId]);
    if (rows[0]?.situacao !== "aguardando_defesa") throw new Error("Só vale para processo aguardando defesa");
    await c.query(
      "update processos set ciencia_em = ciencia_em - $2::int, vencimento_defesa = vencimento_defesa - $2::int, updated_at = now() where id = $1",
      [processoId, dias],
    );
    await c.query(
      `update notificacoes set data_saida = data_saida - $2::int, data_resultado = data_resultado - $2::int
        where id = (select id from notificacoes where processo_id = $1 and resultado = 'entregue' order by criada_em desc limit 1)`,
      [processoId, dias],
    );
    await c.query(
      "insert into eventos (processo_id, tipo, setor_origem, usuario_id, observacao) values ($1, 'OBSERVACAO', 'JURIDICO', $2, $3)",
      [processoId, usuarioId, `TESTE: datas recuadas em ${dias} dias para simular a passagem do tempo (não é fato real)`],
    );
  });
}

/** Recua o vencimento da GRU para testar "não pago" sem esperar. */
export async function anteciparGru(usuarioId: string, processoId: string, dias: number) {
  if (!modoTeste()) throw new Error("Modo de teste desligado");
  await comUsuario(usuarioId, async (c) => {
    const { rows } = await c.query<{ situacao: string }>("select situacao from processos where id = $1 for update", [processoId]);
    if (rows[0]?.situacao !== "gru_gerada") throw new Error("Só vale para processo com GRU a classificar");
    await c.query("update grus set vencimento = vencimento - $2::int where processo_id = $1", [processoId, dias]);
    await c.query(
      "insert into eventos (processo_id, tipo, setor_origem, usuario_id, observacao) values ($1, 'OBSERVACAO', 'JURIDICO', $2, $3)",
      [processoId, usuarioId, `TESTE: vencimento da GRU recuado em ${dias} dias para simular a passagem do tempo (não é fato real)`],
    );
  });
}
