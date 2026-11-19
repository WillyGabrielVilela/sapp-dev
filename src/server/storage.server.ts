// Armazenamento dos PDFs originais do JR5260.
//   STORAGE_DRIVER=local  → pasta no disco (STORAGE_LOCAL_DIR; padrão ./armazenamento). Bom para desenvolvimento
//                            ou para um servidor da ATI com volume persistente.
//   STORAGE_DRIVER=s3     → bucket S3 ou compatível (AWS, MinIO…). Variáveis: S3_BUCKET, S3_REGION,
//                            S3_ENDPOINT (opcional, p/ S3 compatível), S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY
//                            (opcionais: sem elas vale o papel IAM do ambiente).
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface Armazenamento {
  salvar(chave: string, dados: Buffer, contentType: string): Promise<void>;
  ler(chave: string): Promise<Buffer>;
  existe(chave: string): Promise<boolean>;
}

const CHAVE_VALIDA = /^[a-f0-9]{64}\.pdf$/;
function validar(chave: string) {
  if (!CHAVE_VALIDA.test(chave)) throw new Error("Chave de arquivo inválida");
}

function local(): Armazenamento {
  const raiz = resolve(process.env["STORAGE_LOCAL_DIR"] ?? "./armazenamento");
  return {
    async salvar(chave, dados) {
      validar(chave);
      await mkdir(raiz, { recursive: true });
      await writeFile(join(raiz, chave), dados, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "EEXIST") throw e; // mesmo hash = mesmo conteúdo
      });
    },
    async ler(chave) {
      validar(chave);
      return readFile(join(raiz, chave));
    },
    async existe(chave) {
      validar(chave);
      return stat(join(raiz, chave)).then(() => true, () => false);
    },
  };
}

function s3(): Armazenamento {
  const bucket = process.env["S3_BUCKET"];
  if (!bucket) throw new Error("S3_BUCKET não configurado");
  const cliente = async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const id = process.env["S3_ACCESS_KEY_ID"];
    const segredo = process.env["S3_SECRET_ACCESS_KEY"];
    const endpoint = process.env["S3_ENDPOINT"];
    return new S3Client({
      region: process.env["S3_REGION"] ?? "us-east-1",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(id && segredo ? { credentials: { accessKeyId: id, secretAccessKey: segredo } } : {}),
    });
  };
  return {
    async salvar(chave, dados, contentType) {
      validar(chave);
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await (await cliente()).send(new PutObjectCommand({ Bucket: bucket, Key: chave, Body: dados, ContentType: contentType }));
    },
    async ler(chave) {
      validar(chave);
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const r = await (await cliente()).send(new GetObjectCommand({ Bucket: bucket, Key: chave }));
      return Buffer.from((await r.Body?.transformToByteArray()) ?? []);
    },
    async existe(chave) {
      validar(chave);
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      return (await cliente()).send(new HeadObjectCommand({ Bucket: bucket, Key: chave })).then(() => true, () => false);
    },
  };
}

export function armazenamento(): Armazenamento {
  return (process.env["STORAGE_DRIVER"] ?? "local") === "s3" ? s3() : local();
}
