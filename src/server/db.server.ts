// Acesso ao PostgreSQL. Funciona com qualquer Postgres 13+ (Neon, RDS, servidor da ATI-PE…):
// só depende de DATABASE_URL. Nada aqui é específico de um provedor.
import pg from "pg";

const { Pool, types } = pg;

// date → "YYYY-MM-DD" (sem fuso); timestamptz → ISO; bigint → number (ids de eventos cabem em number)
types.setTypeParser(1082, (v) => v);
const parseTimestamptz = types.getTypeParser(1184, "text") as (v: string) => Date;
types.setTypeParser(1184, (v) => parseTimestamptz(v).toISOString());
types.setTypeParser(20, (v) => Number(v));

export type Cliente = pg.PoolClient;

type Globais = typeof globalThis & { __sappPool?: pg.Pool };

export function pool(): pg.Pool {
  const g = globalThis as Globais;
  if (!g.__sappPool) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL não configurada");
    g.__sappPool = new Pool({
      connectionString: url,
      max: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
      ...(process.env["DATABASE_SSL_REJECT_UNAUTHORIZED"] === "false" ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    g.__sappPool.on("error", (e) => console.error("[pg] erro em conexão ociosa:", e.message));
  }
  return g.__sappPool;
}

/** Traduz erros do banco em mensagens para a tela, sem vazar SQL/estrutura. */
export function traduzirErroBanco(e: unknown): Error {
  const err = e as { code?: string; message?: string; constraint?: string };
  if (err?.code === "P0001") return new Error(err.message ?? "Operação não permitida"); // RAISE EXCEPTION das funções
  if (err?.code === "23505") return new Error("Já existe um registro com estes dados");
  if (err?.code === "23503") return new Error("Registro relacionado não encontrado");
  if (err?.code === "23514") return new Error("Valor fora do formato permitido");
  if (err?.code && /^22/.test(err.code)) return new Error("Valor inválido");
  if (e instanceof Error && !err?.code) return e;
  console.error("[pg]", e);
  return new Error("Erro ao acessar o banco de dados");
}

/**
 * Executa `fn` numa transação em que app_uid() devolve o usuário logado.
 * set_config(..., true) vale só dentro da transação, por isso funciona também com pooler em modo transação (Neon, pgbouncer).
 */
export async function comUsuario<T>(usuarioId: string | null, fn: (c: Cliente) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.user_id', $1, true)", [usuarioId ?? ""]);
    const resultado = await fn(c);
    await c.query("commit");
    return resultado;
  } catch (e) {
    try {
      await c.query("rollback");
    } catch {
      /* conexão já perdida */
    }
    throw traduzirErroBanco(e);
  } finally {
    c.release();
  }
}
