#!/usr/bin/env node
// Aplica db/migrations/*.sql em ordem, uma transação por arquivo, registrando em _migracoes.
// Uso: DATABASE_URL=postgres://... node scripts/migrar.mjs [--seed]
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL.");
  process.exit(1);
}

const cliente = new pg.Client({
  connectionString: url,
  ...(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false" ? { ssl: { rejectUnauthorized: false } } : {}),
});
await cliente.connect();
try {
  await cliente.query(
    "create table if not exists _migracoes (nome text primary key, aplicada_em timestamptz not null default now())",
  );
  const aplicadas = new Set((await cliente.query("select nome from _migracoes")).rows.map((r) => r.nome));
  const arquivos = (await readdir(join(raiz, "db/migrations"))).filter((f) => f.endsWith(".sql")).sort();
  for (const nome of arquivos) {
    if (aplicadas.has(nome)) continue;
    const sql = await readFile(join(raiz, "db/migrations", nome), "utf8");
    console.log(`Aplicando ${nome}…`);
    try {
      await cliente.query("begin");
      await cliente.query(sql);
      await cliente.query("insert into _migracoes (nome) values ($1)", [nome]);
      await cliente.query("commit");
    } catch (e) {
      await cliente.query("rollback");
      console.error(`Falhou em ${nome}:`, e.message);
      process.exit(1);
    }
  }
  if (process.argv.includes("--seed")) {
    if (process.env.NODE_ENV === "production") {
      console.error("--seed carrega dados fictícios e não roda com NODE_ENV=production.");
      process.exit(1);
    }
    await cliente.query(await readFile(join(raiz, "db/seeds/dados-ficticios.sql"), "utf8"));
    console.log("Dados fictícios carregados.");
  }
  console.log("Banco em dia.");
} finally {
  await cliente.end();
}
