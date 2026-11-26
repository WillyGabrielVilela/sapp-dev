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
  const u = {} as Record<"admin" | "cca" | "cpma" | "jur" | "gestao" | "pres" | "hom" | "adv", string>;
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
    for (const [chave, papeis] of Object.entries({ admin: [], cca: ["cca"], cpma: ["cpma"], jur: ["juridico"], gestao: ["gestao"], pres: ["presidente"], hom: ["homologador"], adv: ["advogado"] })) {
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
    await falha(u["jur"], "select encerrar_prazo_defesa($1)", [p1], /informe o motivo/);
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

  it("fase 2A: advogado julga (todas as espécies por padrão) → homologador → Presidente → Ger. Jurídica", async () => {
    const [, p2] = ids as [string, string];
    const [st] = await sql<{ situacao: string }>(u["adv"], "select situacao from processos where id = $1", [p2]);
    expect(st!.situacao).toBe("com_defesa");
    const J = "select julgar_processo($1,'multa',100,'Fundamentação suficiente')";
    await falha(u["jur"], J, [p2], /Permissão negada/); // perfil Jurídico (setor) não julga: precisa ser Advogado
    await falha(u["pres"], J, [p2], /Permissão negada/);
    // designação por espécie: quem define são os homologadores
    await falha(u["admin"], "select definir_especies_julgador($1, '{BO}')", [u["adv"]], /Permissão negada/);
    await falha(u["cpma"], "select definir_especies_julgador($1, '{BO}')", [u["adv"]], /Permissão negada/);
    await falha(u["hom"], "select definir_especies_julgador($1, '{BO}')", [u["cca"]], /perfil Advogado/);
    await falha(u["hom"], "select definir_especies_julgador($1, '{XX}')", [u["adv"]], /inexistente/);
    await sql(u["hom"], "select definir_especies_julgador($1, '{BO}')", [u["adv"]]);
    await falha(u["adv"], J, [p2], /não está designado/); // restrito a BO; o processo é CT
    await sql(u["hom"], "select definir_especies_julgador($1, '{}')", [u["adv"]]); // volta ao padrão: todas
    // validações do julgamento
    await falha(u["adv"], "select julgar_processo($1,'multa',null,'Fundamentação suficiente')", [p2], /valor da multa/);
    await falha(u["adv"], "select julgar_processo($1,'arquivamento',50,'Fundamentação suficiente')", [p2], /não tem valor/);
    await falha(u["adv"], "select julgar_processo($1,'multa',100,'curta')", [p2], /fundamentação/);
    await sql(u["adv"], "select julgar_processo($1,'multa',1234.5,'Infração comprovada pelo auto.')", [p2]);
    await falha(u["adv"], "select julgar_processo($1,'multa',1,'Fundamentação suficiente')", [p2], /não está apto/); // já julgado
    await falha(u["hom"], "select assinar_presidente($1)", [p2], /depois da homologação/); // a assinatura só depois da homologação
    await falha(u["adv"], "select homologar_processo($1)", [p2], /Permissão negada/);
    await falha(u["pres"], "select devolver_julgamento($1,'motivo qualquer')", [p2], /Permissão negada/); // ainda é a vez do homologador
    await sql(u["hom"], "select devolver_julgamento($1,'Rever o valor da multa')", [p2]);
    await sql(u["adv"], "select julgar_processo($1,'multa',900,'Valor revisto conforme porte da empresa.')", [p2]);
    await pool().query("insert into user_roles (user_id, role) values ($1, 'homologador') on conflict do nothing", [u["adv"]]);
    await falha(u["adv"], "select homologar_processo($1)", [p2], /Quem julgou/); // advogado-homologador não homologa o que julgou
    await sql(u["hom"], "select homologar_processo($1,'de acordo')", [p2]);
    await falha(u["pres"], "select assinar_presidente($1)", [p2], /Permissão negada/); // o Presidente não usa o sistema: quem informa é o homologador
    await falha(u["jur"], "select assinar_presidente($1)", [p2], /Permissão negada/);
    await falha(u["hom"], "select assinar_presidente($1, null, hoje() + 1)", [p2], /futura/);
    await falha(u["hom"], "select assinar_presidente($1, null, hoje() - 1)", [p2], /anterior à homologação/);
    await sql(u["hom"], "select assinar_presidente($1, 'assinado em papel', hoje())", [p2]);
    const [j] = await sql<{ valor_multa: string; assinado_por: string; homologado_por: string }>(u["adv"], "select valor_multa::text, assinado_por, homologado_por from julgamentos where processo_id = $1", [p2]);
    expect(j!.valor_multa).toBe("900.00");
    expect(j!.homologado_por).toBe(u["hom"]);
    expect(j!.assinado_por).toBe(u["hom"]); // quem registrou a assinatura
    const ev = await sql<{ tipo: string; observacao: string | null }>(u["adv"], "select tipo, observacao from eventos where processo_id = $1 and tipo in ('JULGADO','DEVOLVIDO','HOMOLOGADO','ASSINADO_PRESIDENTE') order by id", [p2]);
    expect(ev.map((x) => x.tipo)).toEqual(["JULGADO", "DEVOLVIDO", "JULGADO", "HOMOLOGADO", "ASSINADO_PRESIDENTE"]);
    expect(ev[0]!.observacao).toMatch(/R\$ 1234,50/); // a 1ª decisão fica na trilha mesmo após a revisão
    expect(ev[4]!.observacao).toMatch(/GRU/);
    const [fim] = await sql<{ situacao: string }>(u["adv"], "select situacao from processos where id = $1", [p2]);
    expect(fim!.situacao).toBe("assinado_presidente"); // volta à Ger. Jurídica (fase 3)
  });

  it("arquivamento assinado pelo Presidente encerra o processo (sem GRU)", async () => {
    const [p1] = ids as [string];
    const [st] = await sql<{ situacao: string }>(u["adv"], "select situacao from processos where id = $1", [p1]);
    expect(st!.situacao).toBe("sem_defesa");
    await sql(u["adv"], "select julgar_processo($1,'arquivamento',null,'Não houve infração comprovada.')", [p1]);
    await sql(u["hom"], "select homologar_processo($1)", [p1]);
    await sql(u["hom"], "select assinar_presidente($1)", [p1]);
    const [fim] = await sql<{ situacao: string }>(u["adv"], "select situacao from processos where id = $1", [p1]);
    expect(fim!.situacao).toBe("arquivado");
  });

  it("prazo vencido sem defesa segue sozinho; defesa tardia ainda é registrada", async () => {
    const [, , p3] = ids as [string, string, string];
    await pool().query("update processos set situacao = 'aguardando_defesa', defesa_em = null, ciencia_em = hoje() - 30, vencimento_defesa = hoje() - 15 where id = $1", [p3]);
    await pool().query("delete from julgamentos where processo_id = $1", [p3]);
    const [r] = await sql<{ n: number }>(u["adv"], "select encerrar_prazos_vencidos() as n");
    expect(r!.n).toBe(1);
    const [r2] = await sql<{ n: number }>(u["adv"], "select encerrar_prazos_vencidos() as n");
    expect(r2!.n).toBe(0); // idempotente
    const [st] = await sql<{ situacao: string }>(u["adv"], "select situacao from processos where id = $1", [p3]);
    expect(st!.situacao).toBe("sem_defesa");
    const [ev] = await sql<{ usuario_id: string; observacao: string }>(u["adv"], "select usuario_id, observacao from eventos where processo_id = $1 and tipo = 'PRAZO_ENCERRADO' order by id desc limit 1", [p3]);
    expect(ev!.usuario_id).toBe("00000000-0000-0000-0000-000000000000");
    expect(ev!.observacao).toMatch(/automático/);
    // um processo ainda dentro do prazo não é tocado
    await pool().query("update processos set situacao = 'aguardando_defesa', vencimento_defesa = hoje() + 3 where id = $1", [p3]);
    expect((await sql<{ n: number }>(u["adv"], "select encerrar_prazos_vencidos() as n"))[0]!.n).toBe(0);
    // defesa que chega depois do encerramento automático
    await pool().query("update processos set vencimento_defesa = hoje() - 15 where id = $1", [p3]);
    await sql(u["adv"], "select encerrar_prazos_vencidos()");
    await sql(u["jur"], "select registrar_defesa($1, hoje() - 1, 'chegou pelos Correios')", [p3]);
    const [fim] = await sql<{ situacao: string }>(u["jur"], "select situacao from processos where id = $1", [p3]);
    expect(fim!.situacao).toBe("com_defesa");
    const [e2] = await sql<{ observacao: string }>(u["jur"], "select observacao from eventos where processo_id = $1 and tipo = 'DEFESA_REGISTRADA' order by id desc limit 1", [p3]);
    expect(e2!.observacao).toMatch(/FORA DO PRAZO/);
  });

  it("registro manual sem defesa: antes do vencimento exige motivo e deixa rastro", async () => {
    const [, , p3] = ids as [string, string, string];
    await pool().query("update processos set situacao = 'aguardando_defesa', ciencia_em = hoje(), vencimento_defesa = hoje() + 8 where id = $1", [p3]);
    await falha(u["jur"], "select encerrar_prazo_defesa($1, 'curto')", [p3], /informe o motivo/);
    await falha(u["cpma"], "select encerrar_prazo_defesa($1, 'renúncia expressa ao prazo')", [p3], /Permissão negada/);
    await sql(u["jur"], "select encerrar_prazo_defesa($1, 'Autuado renunciou expressamente ao prazo')", [p3]);
    const [e] = await sql<{ observacao: string }>(u["jur"], "select observacao from eventos where processo_id = $1 and tipo = 'PRAZO_ENCERRADO' order by id desc limit 1", [p3]);
    expect(e!.observacao).toMatch(/antes do vencimento.*renunciou/);
    const [st] = await sql<{ situacao: string }>(u["jur"], "select situacao from processos where id = $1", [p3]);
    expect(st!.situacao).toBe("sem_defesa");
  });

  it("lote: homologa e assina vários, relata os que não podem avançar sem derrubar os demais", async () => {
    const { executarLote } = await import("./lote.server");
    const novo: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [r] = await sql<{ id: string }>(null, "insert into processos (numero, especie, setor_atual, situacao) values ($1,'CT','JURIDICO','julgado') returning id", [num(900 + i)]);
      // o 3º foi julgado pelo próprio homologador: não pode homologar
      await pool().query("insert into julgamentos (processo_id, julgador_id, decisao, valor_multa, fundamentacao) values ($1,$2,'multa',50,'fundamentação do lote')", [r!.id, i === 2 ? u["hom"] : u["adv"]]);
      novo.push(r!.id);
    }
    const semPapel = await executarLote(u["cca"], novo, "homologar_processo", "");
    expect(semPapel.feitos).toBe(0);
    expect(semPapel.falhas.every((f) => /Permissão negada/.test(f.motivo))).toBe(true);
    const h = await executarLote(u["hom"], [...novo, novo[0]!], "homologar_processo", "lote ok"); // id repetido é ignorado
    expect(h.feitos).toBe(2);
    expect(h.falhas).toHaveLength(1);
    expect(h.falhas[0]!.motivo).toMatch(/Quem julgou/);
    const sit = await sql<{ situacao: string }>(null, "select situacao from processos where id = any($1::uuid[]) order by numero", [novo]);
    expect(sit.map((x) => x.situacao)).toEqual(["homologado", "homologado", "julgado"]);
    const a = await executarLote(u["hom"], novo, "assinar_presidente", "");
    expect(a.feitos).toBe(2);
    expect(a.falhas).toHaveLength(1); // o 3º ainda não foi homologado
    expect(a.falhas[0]!.motivo).toMatch(/depois da homologação/);
    const fim = await sql<{ situacao: string }>(null, "select situacao from processos where id = any($1::uuid[]) order by numero", [novo]);
    expect(fim.map((x) => x.situacao)).toEqual(["assinado_presidente", "assinado_presidente", "julgado"]);
  });

  it("fase 3: Ger. Jurídica registra a GRU (valor, desconto à vista, número único)", async () => {
    const [, p2] = ids as [string, string];
    const [st] = await sql<{ situacao: string }>(u["adv"], "select situacao from processos where id = $1", [p2]);
    expect(st!.situacao).toBe("assinado_presidente");
    const R = "select registrar_gru($1, $2, hoje() + 30, 'emitida no portal')";
    await falha(u["cpma"], R, [p2, "GRU-0001"], /Permissão negada/);
    await falha(u["jur"], R, [p2, "GRU-0001"], /Permissão negada/); // Jurídico administrativo não gera GRU: é dos advogados
    await falha(u["adv"], R, [p2, "ab"], /número da GRU/);
    await falha(u["adv"], "select registrar_gru($1, 'GRU-0001', hoje() - 1)", [p2], /anterior a hoje/);
    await falha(u["adv"], R, [ids[0]!, "GRU-0001"], /não está aguardando a GRU/); // arquivado não tem GRU
    await falha(u["adv"], "select definir_parametro('desconto_vista_percentual','20')", [], /Permissão negada/);
    await falha(u["admin"], "select definir_parametro('desconto_vista_percentual','99')", [], /0 a 90/);
    await falha(u["admin"], "select definir_parametro('qualquer_coisa','1')", [], /desconhecido/);
    await sql(u["adv"], R, [p2, "GRU-0001"]);
    const [g] = await sql<{ valor: string; valor_com_desconto: string; desconto_percentual: number }>(u["adv"], "select valor::text, valor_com_desconto::text, desconto_percentual from grus where processo_id = $1", [p2]);
    expect(g).toEqual({ valor: "900.00", valor_com_desconto: "630.00", desconto_percentual: 30 }); // 30% de 900
    const [fim] = await sql<{ situacao: string }>(u["adv"], "select situacao from processos where id = $1", [p2]);
    expect(fim!.situacao).toBe("gru_gerada");
    await falha(u["adv"], R, [p2, "GRU-0002"], /não está aguardando a GRU/);
    // número repetido em outro processo; desconto parametrizado
    const [outro] = await sql<{ id: string }>(null, "select id from processos where situacao = 'assinado_presidente' limit 1");
    await falha(u["adv"], R, [outro!.id, "gru-0001"], /já está registrado/);
    await sql(u["admin"], "select definir_parametro('desconto_vista_percentual','20')");
    await sql(u["adv"], R, [outro!.id, "GRU-0002"]);
    const [g2] = await sql<{ valor_com_desconto: string }>(u["adv"], "select valor_com_desconto::text from grus where processo_id = $1", [outro!.id]);
    expect(g2!.valor_com_desconto).toBe("40.00"); // 20% de desconto sobre 50,00
    const ev = await sql<{ observacao: string }>(u["adv"], "select observacao from eventos where processo_id = $1 and tipo = 'GRU_REGISTRADA'", [p2]);
    expect(ev[0]!.observacao).toMatch(/GRU-0001.*R\$ 900,00.*30%.*R\$ 630,00/);
  });

  it("fase 4A: GRU classificada como pago, em recurso ou não pago (dívida ativa)", async () => {
    const [, p2] = ids as [string, string];
    const gruDe = async (pid: string) => (await sql<{ situacao: string }>(null, "select situacao from processos where id = $1", [pid]))[0]!.situacao;
    const [b] = await sql<{ id: string }>(null, "select id from processos where numero = $1", [num(901)]); // assinado, ainda sem GRU
    const [c] = await sql<{ id: string }>(null, "select id from processos where situacao = 'gru_gerada' and id <> $1 limit 1", [p2]); // GRU-0002 (R$ 50, desconto 20%)
    await sql(u["adv"], "select registrar_gru($1, 'GRU-0003', hoje() + 20)", [b!.id]);

    // permissões e estados inválidos
    await falha(u["cpma"], "select registrar_pagamento_gru($1, hoje(), 100, false)", [p2], /Permissão negada/);
    await falha(u["jur"], "select classificar_nao_pago($1)", [p2], /Permissão negada/);
    await falha(u["adv"], "select registrar_pagamento_gru($1, hoje() + 1, 100, false)", [p2], /futura/);
    await falha(u["adv"], "select registrar_pagamento_gru($1, hoje(), 0, false)", [p2], /valor pago/);
    await falha(u["adv"], "select registrar_recurso($1, hoje() + 1)", [b!.id], /futura/);

    // NÃO PAGO só depois do vencimento
    await falha(u["adv"], "select classificar_nao_pago($1)", [c!.id], /vence em/);
    await pool().query("update grus set vencimento = hoje() - 5 where processo_id = $1", [c!.id]);
    await sql(u["adv"], "select classificar_nao_pago($1, 'sem pagamento no prazo')", [c!.id]);
    expect(await gruDe(c!.id)).toBe("nao_pago");
    const [lista] = await sql<{ n: number }>(null, "select count(*)::int as n from processos where situacao = 'nao_pago'");
    expect(lista!.n).toBe(1); // entrou na listagem de dívida ativa
    await falha(u["adv"], "select classificar_nao_pago($1)", [c!.id], /não está aguardando/);

    // RECURSO → depois não pago exige o resultado do recurso
    await sql(u["adv"], "select registrar_recurso($1, hoje(), 'protocolado na instância superior')", [b!.id]);
    expect(await gruDe(b!.id)).toBe("em_recurso");
    await falha(u["adv"], "select registrar_recurso($1, hoje())", [b!.id], /aguardando classificação/);
    await falha(u["adv"], "select classificar_nao_pago($1)", [b!.id], /resultado do recurso/);

    // PAGO: valor esperado confere; valor diferente é avisado no histórico; pagamento posterior tira da dívida ativa
    await sql(u["adv"], "select registrar_pagamento_gru($1, hoje(), 630, true, 'à vista')", [p2]);
    expect(await gruDe(p2)).toBe("pago");
    const [e1] = await sql<{ observacao: string }>(null, "select observacao from eventos where processo_id = $1 and tipo = 'PAGAMENTO_REGISTRADO'", [p2]);
    expect(e1!.observacao).toMatch(/630,00.*à vista/);
    expect(e1!.observacao).not.toMatch(/ATENÇÃO/);
    await falha(u["adv"], "select registrar_pagamento_gru($1, hoje(), 630, true)", [p2], /etapa de pagamento/); // já pago
    await sql(u["adv"], "select registrar_pagamento_gru($1, hoje(), 33.33, false)", [c!.id]); // pago depois de ir para a dívida ativa, valor divergente
    const [e2] = await sql<{ observacao: string }>(null, "select observacao from eventos where processo_id = $1 and tipo = 'PAGAMENTO_REGISTRADO'", [c!.id]);
    expect(e2!.observacao).toMatch(/ATENÇÃO.*R\$ 50,00/);
    const [lista2] = await sql<{ n: number }>(null, "select count(*)::int as n from processos where situacao = 'nao_pago'");
    expect(lista2!.n).toBe(0);

    // recurso encerrado sem pagamento → não pago (com resultado informado)
    await sql(u["adv"], "select classificar_nao_pago($1, 'Recurso indeferido; sem pagamento')", [b!.id]);
    expect(await gruDe(b!.id)).toBe("nao_pago");
  });

  it("lote: classificar como não pago só as GRUs vencidas", async () => {
    const { executarLote } = await import("./lote.server");
    const novo: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [r] = await sql<{ id: string }>(null, "insert into processos (numero, especie, setor_atual, situacao) values ($1,'CT','JURIDICO','gru_gerada') returning id", [num(950 + i)]);
      await pool().query("insert into grus (processo_id, numero_gru, valor, desconto_percentual, valor_com_desconto, vencimento, emitida_por) values ($1,$2,100,30,70,$3,$4)", [r!.id, `LOTE-${i}`, i === 2 ? "2099-01-01" : "2020-01-01", u["adv"]]);
      novo.push(r!.id);
    }
    const r = await executarLote(u["adv"], novo, "classificar_nao_pago", "");
    expect(r.feitos).toBe(2);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]!.motivo).toMatch(/vence em/);
  });

  it("observações no Jurídico: administrativo, advogado e homologador podem; CPMA não", async () => {
    const [, p2] = ids as [string, string];
    for (const quem of ["jur", "adv", "hom"] as const) await sql(u[quem], "select adicionar_observacao($1, 'nota de acompanhamento')", [p2]);
    await falha(u["cpma"], "select adicionar_observacao($1, 'não deveria')", [p2], /Só o setor atual/);
    await falha(u["pres"], "select adicionar_observacao($1, 'não deveria')", [p2], /Só o setor atual/);
  });

  it("histórico é imutável e inclui toda a trilha", async () => {
    await expect(pool().query("update eventos set observacao = 'x'")).rejects.toThrow(/não podem ser editados/);
    await expect(pool().query("delete from eventos")).rejects.toThrow(/não podem ser editados/);
    const [p1] = ids as [string];
    const tipos = (await sql<{ tipo: string }>(u["adv"], "select tipo from eventos where processo_id = $1 order by id", [p1])).map((x) => x.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["IMPORTADO", "RECEBIDO", "PROTOCOLADO", "NOTIFICADO", "CIENCIA_REGISTRADA", "PRAZO_ENCERRADO"]));
  });

  it("papéis: admin não é setor; usuário sem papel não opera", async () => {
    await falha(u["admin"], "select protocolar_processo($1,null,null,null,null)", [ids[0]], /Permissão negada/);
    await expect(sql(null, "select listar_usuarios()")).resolves.toEqual([]); // sem usuário logado, nada
    const lista2 = await sql(u["admin"], "select id, nome, email, papeis::text[] as papeis from listar_usuarios()");
    expect((lista2 as { papeis: unknown }[]).every((x) => Array.isArray(x.papeis))).toBe(true); // regressão: enum[] chegava como "{admin}"
    expect(lista2).toHaveLength(8);
    await falha(u["admin"], "select definir_papeis($1, '{cca}'::app_role[])", [u["admin"]], /próprio papel de administrador/);
  });
});
