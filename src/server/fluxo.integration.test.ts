// @vitest-environment node
// Teste de integração contra um PostgreSQL REAL e VAZIO, já migrado (npm run db:migrar).
//   DATABASE_URL_TESTE=postgres://usuario:senha@localhost:5432/sapp_test npm test
// Por segurança só roda se o nome do banco terminar em _test/_teste (o teste apaga os dados).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env["DATABASE_URL_TESTE"];
const nomeBanco = url ? new URL(url).pathname.slice(1) : "";
const habilitado = !!url && /_(test|teste)$/.test(nomeBanco);

describe.skipIf(!habilitado)("fluxo CCA → CPMA → Jurídico (PostgreSQL real)", () => {
  let comUsuario: typeof import("./db.server").comUsuario;
  let pool: typeof import("./db.server").pool;
  let hashSenha: typeof import("./auth.server").hashSenha;
  let conferirSenha: typeof import("./auth.server").conferirSenha;
  const u = {} as Record<"admin" | "cca" | "cpma" | "jur" | "gestao" | "pres" | "hom", string>;
  const num = (n: number) => `52627.${String(n).padStart(6, "0")}/2026-01`;
  const ids: string[] = [];

  const sql = async <T = Record<string, unknown>>(quem: string | null, q: string, p: unknown[] = []) =>
    comUsuario(quem, async (c) => (await c.query(q, p)).rows as T[]);
  const falha = (quem: string, q: string, p: unknown[], msg: RegExp) =>
    expect(sql(quem, q, p)).rejects.toThrow(msg);

  beforeAll(async () => {
    process.env["DATABASE_URL"] = url;
    ({ comUsuario, pool } = await import("./db.server"));
    ({ hashSenha, conferirSenha } = await import("./auth.server"));
    await pool().query(
      "truncate usuarios, user_roles, sessoes, especies, fiscais, arquivos_originais, itens_importados, processos, eventos, correcoes, acesso_logs, listas_saida, notificacoes, protocolo_seq restart identity cascade",
    );
    const h = await hashSenha("senha-de-teste-1");
    for (const [chave, papeis] of Object.entries({ admin: [], cca: ["cca"], cpma: ["cpma"], jur: ["juridico"], gestao: ["gestao"], pres: ["presidente"], hom: ["homologador"] })) {
      const r = await sql<{ id: string }>(null, "select criar_usuario($1, $2, $3) as id", [chave, `${chave}@ipem.test`, h]);
      u[chave as keyof typeof u] = r[0]!.id;
      for (const p of papeis) await pool().query("insert into user_roles (user_id, role) values ($1, $2)", [u[chave as keyof typeof u], p]);
    }
    await pool().query("insert into especies (codigo) values ('CT'), ('BO')");
    await pool().query("insert into fiscais (nome, matricula, setor_tecnico, especies) values ('Fiscal Teste','F1','METROLOGIA','{CT}')");
  });
  afterAll(async () => { await pool().end(); });

  it("senha: scrypt confere e rejeita", async () => {
    const h = await hashSenha("outra-senha-123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await conferirSenha("outra-senha-123", h)).toBe(true);
    expect(await conferirSenha("errada", h)).toBe(false);
  });

  it("o primeiro usuário cadastrado vira administrador; os demais não", async () => {
    const r = await sql<{ role: string }>(null, "select role from user_roles where user_id = $1", [u["admin"]]);
    expect(r.map((x) => x.role)).toEqual(["admin"]);
    expect(await sql(null, "select 1 from user_roles where user_id = $1", [u["cca"]])).toHaveLength(1); // só o papel dado no teste
    await expect(sql(null, "select criar_usuario('x','ADMIN@ipem.test','h')")).rejects.toThrow(/já está cadastrado/);
  });

  it("importação: CCA confirma o arquivo e os processos nascem no CPMA", async () => {
    const [arq] = await sql<{ id: string }>(u["cca"],
      `insert into arquivos_originais (nome, sha256, caminho, total_rodape, total_lido, enviado_por)
       values ('t.pdf', repeat('a',64), repeat('a',64)||'.pdf', 3, 3, $1) returning id`, [u["cca"]]);
    for (let i = 1; i <= 3; i++)
      await sql(u["cca"], "insert into itens_importados (arquivo_id, pagina, linha, especie, numero, abertura, proprietario) values ($1,1,$2,'CT',$3,'2026-09-01',$4)", [arq!.id, i, num(i), `Empresa ${i} Ltda`]);
    await falha(u["cpma"], "select confirmar_arquivo($1)", [arq!.id], /Permissão negada/);
    const [r] = await sql<{ n: number }>(u["cca"], "select confirmar_arquivo($1) as n", [arq!.id]);
    expect(r!.n).toBe(3);
    ids.push(...(await sql<{ id: string }>(u["cca"], "select id from processos order by numero")).map((x) => x.id));
    expect(ids).toHaveLength(3);
  });

  it("CPMA recebe, informa fiscal, digitaliza e encaminha; só o destino recebe", async () => {
    const [p1, p2, p3] = ids as [string, string, string];
    await falha(u["jur"], "select receber_processo($1)", [p1], /Permissão negada/);
    for (const p of [p1, p2, p3]) {
      await sql(u["cpma"], "select receber_processo($1)", [p]);
      const [f] = await sql<{ id: string }>(u["cpma"], "select id from fiscais limit 1");
      await sql(u["cpma"], "select informar_fiscal($1,$2,'METROLOGIA')", [p, f!.id]);
      await sql(u["cpma"], "select registrar_digitalizacao($1)", [p]);
      await sql(u["cpma"], "select encaminhar_juridico($1,'ok')", [p]);
    }
    const [r] = await sql<{ situacao: string }>(u["cpma"], "select situacao from processos where id = $1", [p1]);
    expect(r!.situacao).toBe("aguardando_juridico");
  });

  it("Jurídico: protocolo exige estar recebido, valida AI e não repete AI", async () => {
    const [p1, p2, p3] = ids as [string, string, string];
    await falha(u["jur"], "select protocolar_processo($1,'3707641','','Loja','Pina')", [p1], /recebido pelo Jurídico/);
    for (const p of [p1, p2, p3]) await sql(u["jur"], "select receber_processo($1)", [p]);
    await falha(u["cpma"], "select protocolar_processo($1,'3707641','','Loja','Pina')", [p1], /Permissão negada/);
    await falha(u["jur"], "select protocolar_processo($1,'123','','Loja','Pina')", [p1], /7 dígitos/);
    await falha(u["jur"], "select protocolar_processo($1,'3707641','123','Loja','Pina')", [p1], /CPF deve ter/);
    const [pr] = await sql<{ p: string }>(u["jur"], "select protocolar_processo($1,'3707641','11.222.333/0001-81','Cacau Show','Pina') as p", [p1]);
    expect(pr!.p).toMatch(/^JUR-\d{4}-00001$/);
    await falha(u["jur"], "select protocolar_processo($1,'3707641','','X','Y')", [p2], /já está vinculado ao processo/); // AI repetido
    const [pr2] = await sql<{ p: string }>(u["jur"], "select protocolar_processo($1,'3707642','529.982.247-25','Soberano','Arruda') as p", [p2]);
    expect(pr2!.p).toMatch(/-00002$/);
    await sql(u["jur"], "select protocolar_processo($1,null,null,null,null)", [p3]); // AI opcional
    await falha(u["jur"], "select devolver_processo($1,'devolvendo agora')", [p1], /não pode ser devolvido/);
  });

  let lista = "";
  it("lista de saída: só protocolados entram, numeração por dia e sem repetição", async () => {
    const [p1, p2, p3] = ids as [string, string, string];
    await falha(u["jur"], "select criar_lista_saida($1::uuid[],'correios',current_date + 1)", [[p1]], /futura/);
    await falha(u["jur"], "select criar_lista_saida($1::uuid[],'correios',(now() at time zone 'America/Recife')::date)", [[p1, p1]], /repetidos/);
    const [l] = await sql<{ id: string }>(u["jur"], "select criar_lista_saida($1::uuid[],'em_maos',hoje(),'Pina') as id", [[p1, p2]]);
    lista = l!.id;
    const [l2] = await sql<{ id: string }>(u["jur"], "select criar_lista_saida($1::uuid[],'correios',hoje()) as id", [[p3]]);
    const nums = await sql<{ numero_dia: number }>(u["jur"], "select numero_dia from listas_saida order by criada_em");
    expect(nums.map((x) => x.numero_dia)).toEqual([1, 2]);
    expect(l2!.id).not.toBe(lista);
    await falha(u["jur"], "select criar_lista_saida($1::uuid[],'correios',hoje())", [[p1]], /não está apto/); // já notificado: não reenvia
  });

  it("desfecho: entrega exige recebedor; entregue inicia prazo de 10 dias; devolvido libera reenvio", async () => {
    const [p1, p2, p3] = ids as [string, string, string];
    const nots = await sql<{ id: string; processo_id: string }>(u["jur"], "select id, processo_id from notificacoes");
    const de = (p: string) => nots.find((n) => n.processo_id === p)!.id;
    await falha(u["cpma"], "select registrar_resultado_notificacao($1,'entregue',hoje(),'Fulano')", [de(p1)], /Permissão negada/);
    await falha(u["jur"], "select registrar_resultado_notificacao($1,'entregue',hoje(),'')", [de(p1)], /quem recebeu/);
    await falha(u["jur"], "select registrar_resultado_notificacao($1,'entregue',hoje() + 1,'Fulano')", [de(p1)], /futura/);
    await sql(u["jur"], "select registrar_resultado_notificacao($1,'entregue',hoje(),'Maria Gerente')", [de(p1)]);
    await falha(u["jur"], "select registrar_resultado_notificacao($1,'entregue',hoje(),'Maria Gerente')", [de(p1)], /já foi registrado/);
    const [a] = await sql<{ situacao: string; ciencia_em: string; vencimento_defesa: string; ok: boolean }>(u["jur"],
      "select situacao, ciencia_em, vencimento_defesa, vencimento_defesa = prazo_defesa(ciencia_em) as ok from processos where id = $1", [p1]);
    expect(a!.situacao).toBe("aguardando_defesa");
    expect(a!.ok).toBe(true);
    // devolvido (D): fica frustrado e pode entrar em nova lista
    await sql(u["jur"], "select registrar_resultado_notificacao($1,'devolvido',hoje(),null,'Endereço não localizado')", [de(p2)]);
    const [b] = await sql<{ situacao: string }>(u["jur"], "select situacao from processos where id = $1", [p2]);
    expect(b!.situacao).toBe("notificacao_frustrada");
    await sql(u["jur"], "select criar_lista_saida($1::uuid[],'doe',hoje())", [[p2]]);
    // DOE dispensa recebedor
    const [n2] = await sql<{ id: string }>(u["jur"], "select id from notificacoes where processo_id = $1 and resultado = 'pendente'", [p2]);
    await sql(u["jur"], "select registrar_resultado_notificacao($1,'entregue',hoje(),null)", [n2!.id]);
    expect(p3).toBeTruthy();
  });

  it("prazo: calendário do vencimento e encerramento só após vencer", async () => {
    const r = await sql<{ d: string; v: string }>(null, "select d::text, prazo_defesa(d)::text as v from (values ('2026-10-01'::date),('2026-10-05'::date),('2026-10-06'::date)) t(d)");
    // 01/10 (qui) +10 = 11/10 (dom) → 12/10 (seg); 05/10 (seg) +10 = 15/10 (qui); 06/10 (ter) +10 = 16/10 (sex)
    expect(r.map((x) => x.v)).toEqual(["2026-10-12", "2026-10-15", "2026-10-16"]);
    const [p1] = ids as [string];
    await falha(u["jur"], "select encerrar_prazo_defesa($1)", [p1], /vai até/);
    await falha(u["jur"], "select registrar_defesa($1, hoje() - 5)", [p1], /anterior à ciência/);
    await pool().query("update processos set ciencia_em = hoje() - 20, vencimento_defesa = hoje() - 10 where id = $1", [p1]);
    await sql(u["jur"], "select encerrar_prazo_defesa($1)", [p1]);
    const [s] = await sql<{ situacao: string }>(u["jur"], "select situacao from processos where id = $1", [p1]);
    expect(s!.situacao).toBe("sem_defesa");
  });

  it("defesa fora do prazo é registrada e marcada no histórico", async () => {
    const [, p2] = ids as [string, string];
    await pool().query("update processos set ciencia_em = hoje() - 20, vencimento_defesa = hoje() - 10 where id = $1", [p2]);
    await sql(u["jur"], "select registrar_defesa($1, hoje() - 2)", [p2]);
    const ev = await sql<{ observacao: string }>(u["jur"], "select observacao from eventos where processo_id = $1 and tipo = 'DEFESA_REGISTRADA'", [p2]);
    expect(ev[0]!.observacao).toMatch(/FORA DO PRAZO/);
  });

  it("defesa no mesmo dia da ciência é aceita; data futura não", async () => {
    const [, , p3] = ids as [string, string, string];
    const [n] = await sql<{ id: string }>(u["jur"], "select id from notificacoes where processo_id = $1 and resultado = 'pendente'", [p3]);
    await sql(u["jur"], "select registrar_resultado_notificacao($1,'entregue',hoje(),'Fulano de Tal')", [n!.id]);
    await falha(u["jur"], "select registrar_defesa($1, hoje() + 1)", [p3], /futura/);
    await sql(u["jur"], "select registrar_defesa($1, hoje())", [p3]);
    const [s] = await sql<{ situacao: string }>(u["jur"], "select situacao from processos where id = $1", [p3]);
    expect(s!.situacao).toBe("com_defesa");
  });

  it("modo de teste: recua o prazo, registra no histórico e só funciona ligado", async () => {
    const { anteciparPrazo } = await import("./teste.server");
    const [p4] = await sql<{ id: string }>(u["jur"], "select id from processos where situacao = 'aguardando_defesa' limit 1");
    const alvo = p4?.id ?? ids[2]!;
    delete process.env["MODO_TESTE"];
    await expect(anteciparPrazo(u["jur"], alvo, 15)).rejects.toThrow(/desligado/);
    process.env["MODO_TESTE"] = "true";
    // prepara um processo em aguardando_defesa: reaproveita p3 recolocando-o nesse estado
    await pool().query("update processos set situacao = 'aguardando_defesa', defesa_em = null, ciencia_em = hoje(), vencimento_defesa = prazo_defesa(hoje()) where id = $1", [ids[2]]);
    await anteciparPrazo(u["jur"], ids[2]!, 15);
    await sql(u["jur"], "select encerrar_prazo_defesa($1)", [ids[2]]);
    const ev = await sql<{ observacao: string }>(u["jur"], "select observacao from eventos where processo_id = $1 and observacao like 'TESTE:%'", [ids[2]]);
    expect(ev).toHaveLength(1);
    delete process.env["MODO_TESTE"];
  });

  it("fase 2A: julgamento por espécie → Presidente → homologação", async () => {
    const [, p2] = ids as [string, string];
    const [st] = await sql<{ situacao: string }>(u["jur"], "select situacao from processos where id = $1", [p2]);
    expect(st!.situacao).toBe("com_defesa");
    await falha(u["jur"], "select julgar_processo($1,'multa',100,'Fundamentação suficiente')", [p2], /não está designado/);
    await falha(u["cpma"], "select definir_especies_julgador($1, '{CT}')", [u["jur"]], /Permissão negada/);
    await falha(u["admin"], "select definir_especies_julgador($1, '{CT}')", [u["cca"]], /perfil Jurídico/);
    await falha(u["admin"], "select definir_especies_julgador($1, '{XX}')", [u["jur"]], /inexistente/);
    await sql(u["admin"], "select definir_especies_julgador($1, '{CT}')", [u["jur"]]);
    await falha(u["jur"], "select julgar_processo($1,'multa',null,'Fundamentação suficiente')", [p2], /valor da multa/);
    await falha(u["jur"], "select julgar_processo($1,'arquivamento',50,'Fundamentação suficiente')", [p2], /não tem valor/);
    await falha(u["jur"], "select julgar_processo($1,'multa',100,'curta')", [p2], /fundamentação/);
    await falha(u["pres"], "select julgar_processo($1,'multa',100,'Fundamentação suficiente')", [p2], /Permissão negada/);
    await sql(u["jur"], "select julgar_processo($1,'multa',1234.5,'Infração comprovada pelo auto.')", [p2]);
    await falha(u["jur"], "select julgar_processo($1,'multa',1,'Fundamentação suficiente')", [p2], /não está apto/); // já julgado
    await falha(u["hom"], "select homologar_processo($1)", [p2], /depois da assinatura/);
    await falha(u["jur"], "select assinar_presidente($1)", [p2], /Permissão negada/);
    await falha(u["hom"], "select devolver_julgamento($1,'motivo qualquer')", [p2], /Permissão negada/); // homologador ainda não atua
    await sql(u["pres"], "select devolver_julgamento($1,'Rever o valor da multa')", [p2]);
    await sql(u["jur"], "select julgar_processo($1,'multa',900,'Valor revisto conforme porte da empresa.')", [p2]);
    await sql(u["pres"], "select assinar_presidente($1,'ok')", [p2]);
    await pool().query("insert into user_roles (user_id, role) values ($1, 'homologador') on conflict do nothing", [u["jur"]]);
    await falha(u["jur"], "select homologar_processo($1)", [p2], /Quem julgou/);
    await sql(u["hom"], "select homologar_processo($1)", [p2]);
    const [j] = await sql<{ valor_multa: string; assinado_por: string; homologado_por: string }>(u["jur"], "select valor_multa::text, assinado_por, homologado_por from julgamentos where processo_id = $1", [p2]);
    expect(j!.valor_multa).toBe("900.00");
    expect(j!.assinado_por).toBe(u["pres"]);
    expect(j!.homologado_por).toBe(u["hom"]);
    const ev = (await sql<{ tipo: string; observacao: string | null }>(u["jur"], "select tipo, observacao from eventos where processo_id = $1 and tipo in ('JULGADO','DEVOLVIDO','ASSINADO_PRESIDENTE','HOMOLOGADO') order by id", [p2]));
    expect(ev.map((x) => x.tipo)).toEqual(["JULGADO", "DEVOLVIDO", "JULGADO", "ASSINADO_PRESIDENTE", "HOMOLOGADO"]);
    expect(ev[0]!.observacao).toMatch(/R\$ 1234,50/); // a 1ª decisão fica na trilha mesmo após a revisão
    const [fim] = await sql<{ situacao: string }>(u["jur"], "select situacao from processos where id = $1", [p2]);
    expect(fim!.situacao).toBe("homologado");
  });

  it("histórico é imutável e inclui toda a trilha", async () => {
    await expect(pool().query("update eventos set observacao = 'x'")).rejects.toThrow(/não podem ser editados/);
    await expect(pool().query("delete from eventos")).rejects.toThrow(/não podem ser editados/);
    const [p1] = ids as [string];
    const tipos = (await sql<{ tipo: string }>(u["jur"], "select tipo from eventos where processo_id = $1 order by id", [p1])).map((x) => x.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["IMPORTADO", "RECEBIDO", "PROTOCOLADO", "NOTIFICADO", "CIENCIA_REGISTRADA", "PRAZO_ENCERRADO"]));
  });

  it("papéis: admin não é setor; usuário sem papel não opera", async () => {
    await falha(u["admin"], "select protocolar_processo($1,null,null,null,null)", [ids[0]], /Permissão negada/);
    await expect(sql(null, "select listar_usuarios()")).resolves.toEqual([]); // sem usuário logado, nada
    const lista2 = await sql(u["admin"], "select id, nome, email, papeis::text[] as papeis from listar_usuarios()");
    expect((lista2 as { papeis: unknown }[]).every((x) => Array.isArray(x.papeis))).toBe(true); // regressão: enum[] chegava como "{admin}"
    expect(lista2).toHaveLength(7);
    await falha(u["admin"], "select definir_papeis($1, '{cca}'::app_role[])", [u["admin"]], /próprio papel de administrador/);
  });
});
