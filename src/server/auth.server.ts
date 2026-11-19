// Login próprio: senha com scrypt, sessão opaca em cookie httpOnly (guardada como hash no banco).
// Para trocar por SSO/OIDC da ATI-PE no futuro, só este arquivo e auth.functions.ts mudam.
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import type { Papel, Sessao } from "@/lib/tipos";
import { comUsuario, pool } from "./db.server";

const COOKIE = "sapp_sessao";
const N = 1 << 16;
const R = 8;
const P = 2;
const MAX_FALHAS = 5;
const BLOQUEIO_MIN = 15;

function derivar(senha: string, sal: Buffer, n: number, r: number, p: number, len: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 256 * 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scrypt(senha.normalize("NFKC"), sal, len, opts, (e, k) => (e ? reject(e) : resolve(k))),
  );
}

export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const k = await derivar(senha, sal, N, R, P, 32);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${k.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [alg, n, r, p, sal, esperado] = guardado.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !sal || !esperado) return false;
  const alvo = Buffer.from(esperado, "base64");
  const k = await derivar(senha, Buffer.from(sal, "base64"), Number(n), Number(r), Number(p), alvo.length);
  return k.length === alvo.length && timingSafeEqual(k, alvo);
}

let hashFalso: Promise<string> | undefined;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const horasSessao = () => Number(process.env["SESSAO_HORAS"] ?? 12);
const cookieSeguro = () =>
  process.env["COOKIE_SECURE"] ? process.env["COOKIE_SECURE"] === "true" : process.env["NODE_ENV"] === "production";

export const MSG_CREDENCIAIS = "E-mail ou senha inválidos";

export async function cadastroAberto(): Promise<boolean> {
  if (process.env["PERMITIR_CADASTRO"] === "true") return true;
  const { rows } = await pool().query("select not exists (select 1 from usuarios) as vazio");
  return rows[0]?.vazio === true;
}

export function validarCredenciais(email: string, senha: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido");
  if (senha.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres");
  if (senha.length > 200) throw new Error("Senha longa demais");
}

export async function cadastrar(nome: string, email: string, senha: string): Promise<string> {
  validarCredenciais(email, senha);
  if (!(await cadastroAberto())) throw new Error("O cadastro por conta própria está desativado. Peça ao administrador");
  const hash = await hashSenha(senha);
  return comUsuario(null, async (c) => {
    const { rows } = await c.query("select criar_usuario($1, $2, $3) as id", [nome.trim(), email.trim(), hash]);
    return rows[0].id as string;
  });
}

async function abrirSessao(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const horas = horasSessao();
  await pool().query("delete from sessoes where expira_em < now()");
  await pool().query(
    "insert into sessoes (token_hash, usuario_id, expira_em) values ($1, $2, now() + make_interval(hours => $3))",
    [sha256(token), usuarioId, horas],
  );
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSeguro(),
    path: "/",
    maxAge: horas * 3600,
  });
}

export async function criarSessaoPara(usuarioId: string) {
  await abrirSessao(usuarioId);
}

export async function entrar(email: string, senha: string): Promise<void> {
  const { rows } = await pool().query(
    "select id, senha_hash, ativo, bloqueado_ate > now() as bloqueado from usuarios where lower(email) = lower($1)",
    [email.trim()],
  );
  const u = rows[0] as { id: string; senha_hash: string; ativo: boolean; bloqueado: boolean | null } | undefined;
  if (!u) {
    // gasta o mesmo tempo para não revelar quais e-mails existem
    hashFalso ??= hashSenha("senha-falsa");
    await conferirSenha(senha, await hashFalso);
    throw new Error(MSG_CREDENCIAIS);
  }
  if (u.bloqueado) throw new Error(`Conta bloqueada por tentativas incorretas. Tente de novo em até ${BLOQUEIO_MIN} minutos`);
  const ok = await conferirSenha(senha, u.senha_hash);
  if (!ok || !u.ativo) {
    if (!ok) {
      await pool().query(
        `update usuarios set
           bloqueado_ate = case when falhas_login + 1 >= $2 then now() + make_interval(mins => $3) else bloqueado_ate end,
           falhas_login = case when falhas_login + 1 >= $2 then 0 else falhas_login + 1 end
         where id = $1`,
        [u.id, MAX_FALHAS, BLOQUEIO_MIN],
      );
    }
    throw new Error(MSG_CREDENCIAIS);
  }
  await pool().query("update usuarios set falhas_login = 0, bloqueado_ate = null, ultimo_acesso = now() where id = $1", [u.id]);
  await abrirSessao(u.id);
}

export async function sair(): Promise<void> {
  const token = getCookie(COOKIE);
  if (token) await pool().query("delete from sessoes where token_hash = $1", [sha256(token)]);
  deleteCookie(COOKIE, { path: "/" });
}

export async function obterSessao(): Promise<Sessao | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const { rows } = await pool().query(
    `select u.id, u.email, u.nome,
            coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}') as papeis
       from sessoes s
       join usuarios u on u.id = s.usuario_id and u.ativo
       left join user_roles ur on ur.user_id = u.id
      where s.token_hash = $1 and s.expira_em > now()
      group by u.id`,
    [sha256(token)],
  );
  const r = rows[0] as { id: string; email: string; nome: string; papeis: Papel[] } | undefined;
  return r ? { id: r.id, email: r.email, nome: r.nome, papeis: r.papeis } : null;
}

/** Usado pelo administrador para definir/redefinir senha. Encerra as sessões abertas do usuário. */
export async function definirSenha(usuarioId: string, senha: string) {
  validarCredenciais("a@b.co", senha);
  const hash = await hashSenha(senha);
  await pool().query("update usuarios set senha_hash = $2, falhas_login = 0, bloqueado_ate = null where id = $1", [usuarioId, hash]);
  await pool().query("delete from sessoes where usuario_id = $1", [usuarioId]);
}
