import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const ROLE = "nf_worker_local";
const WORKER_ID = "worker-local-piloto";
let etapaAtual = "inicio";

function exigirUrl(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(`${nome} não configurada.`);
  }

  const url = new URL(valor);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${nome} deve usar PostgreSQL.`);
  }
  return url;
}

function identificadorSql(valor) {
  return `"${valor.replaceAll('"', '""')}"`;
}

function literalSql(valor) {
  return `'${valor.replaceAll("'", "''")}'`;
}

function montarUrlWorker(urlProprietaria, senha) {
  const url = new URL(urlProprietaria);
  const usuarioProprietario = decodeURIComponent(url.username);
  const separadorPooler = usuarioProprietario.indexOf(".");
  const sufixoPooler = separadorPooler >= 0
    ? usuarioProprietario.slice(separadorPooler)
    : "";

  url.username = `${ROLE}${sufixoPooler}`;
  url.password = senha;
  return url.toString();
}

async function atualizarEnv(caminho, valores) {
  let conteudo = "";
  try {
    conteudo = await readFile(caminho, "utf8");
  } catch (erro) {
    if (erro?.code !== "ENOENT") throw erro;
  }

  const linhas = conteudo.split(/\r?\n/);
  for (const [chave, valor] of Object.entries(valores)) {
    const indice = linhas.findIndex((linha) => linha.startsWith(`${chave}=`));
    if (indice >= 0) linhas[indice] = `${chave}=${valor}`;
    else linhas.push(`${chave}=${valor}`);
  }

  const temporario = `${caminho}.tmp`;
  await writeFile(temporario, `${linhas.filter(Boolean).join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporario, caminho);
}

async function lerValorEnv(caminho, chave) {
  try {
    const conteudo = await readFile(caminho, "utf8");
    const linha = conteudo
      .split(/\r?\n/)
      .find((item) => item.startsWith(`${chave}=`));
    return linha?.slice(chave.length + 1).trim() || null;
  } catch (erro) {
    if (erro?.code === "ENOENT") return null;
    throw erro;
  }
}

async function main() {
  const urlProprietaria = exigirUrl("DATABASE_URL");
  const pastaWeb = dirname(dirname(fileURLToPath(import.meta.url)));
  const envWorker = resolve(pastaWeb, "..", "worker", ".env");
  let urlWorker;
  const banco = decodeURIComponent(urlProprietaria.pathname.slice(1));
  const roleSql = identificadorSql(ROLE);
  const bancoSql = identificadorSql(banco);

  const admin = postgres(urlProprietaria.toString(), {
    max: 1,
    ssl: "require",
    connect_timeout: 10,
  });

  try {
    etapaAtual = "consultar_papel";
    const [papel] = await admin`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${ROLE}) AS existe
    `;

    if (papel.existe) {
      etapaAtual = "carregar_conexao_existente";
      urlWorker = await lerValorEnv(envWorker, "WORKER_DATABASE_URL");
      if (!urlWorker) {
        throw new Error("A conexão local existente do Worker não foi encontrada.");
      }
      const usuarioWorker = decodeURIComponent(new URL(urlWorker).username).split(".")[0];
      if (usuarioWorker !== ROLE) {
        throw new Error("A conexão local não pertence ao papel esperado.");
      }
      etapaAtual = "restringir_privilegios";
      await admin.unsafe(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA fiscal FROM ${roleSql}`);
      await admin.unsafe(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA fiscal FROM ${roleSql}`);
      await admin.unsafe(`REVOKE ALL PRIVILEGES ON SCHEMA fiscal FROM ${roleSql}`);
    } else {
      etapaAtual = "criar_papel";
      const senha = randomBytes(32).toString("base64url");
      const senhaSql = literalSql(senha);
      urlWorker = montarUrlWorker(urlProprietaria, senha);
      await admin.unsafe(`CREATE ROLE ${roleSql} LOGIN PASSWORD ${senhaSql}
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
    }

    etapaAtual = "conceder_privilegios";
    await admin.unsafe(`GRANT CONNECT ON DATABASE ${bancoSql} TO ${roleSql}`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA fiscal TO ${roleSql}`);
    await admin.unsafe(`GRANT USAGE ON TYPE fiscal.status_tarefa TO ${roleSql}`);
    await admin.unsafe(`GRANT SELECT ON TABLE fiscal.tarefas TO ${roleSql}`);
    await admin.unsafe(`GRANT UPDATE (
      status, reservada_por, reserva_token, reserva_expira_em, tentativas,
      iniciado_em, atualizado_em, mensagem_status, ultimo_erro, codigo_erro,
      concluido_em
    ) ON TABLE fiscal.tarefas TO ${roleSql}`);
    await admin.unsafe(`GRANT SELECT ON TABLE fiscal.notas TO ${roleSql}`);
    await admin.unsafe(`GRANT INSERT (
      tarefa_id, cliente_id, numero, chave_acesso, protocolo_autorizacao,
      status, valor_total, data_emissao
    ) ON TABLE fiscal.notas TO ${roleSql}`);
    await admin.unsafe(`GRANT UPDATE (
      pdf_path, xml_path, documento_expira_em,
      limpeza_reserva_token, limpeza_reserva_expira_em
    ) ON TABLE fiscal.notas TO ${roleSql}`);
    await admin.unsafe(`GRANT EXECUTE ON FUNCTION
      fiscal.reservar_tarefas_worker(text, integer, integer) TO ${roleSql}`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  if (!urlWorker) throw new Error("A conexão do Worker não foi preparada.");

  const worker = postgres(urlWorker, {
    max: 1,
    ssl: "require",
    connect_timeout: 10,
  });
  try {
    etapaAtual = "validar_conexao";
    const [sessao] = await worker`SELECT current_user AS usuario`;
    if (sessao.usuario !== ROLE) {
      throw new Error("O banco não confirmou a identidade exclusiva do Worker.");
    }
  } finally {
    await worker.end({ timeout: 5 });
  }

  etapaAtual = "atualizar_env";
  await atualizarEnv(envWorker, {
    WORKER_DATABASE_URL: urlWorker,
    WORKER_ID,
  });

  console.log(JSON.stringify({
    papel: ROLE,
    conexaoValidada: true,
    envWorkerAtualizado: true,
    segredoExibido: false,
  }));
}

main().catch((erro) => {
  const codigoSql = typeof erro?.code === "string" && /^[0-9A-Z]{5}$/.test(erro.code)
    ? erro.code
    : undefined;
  console.error(JSON.stringify({
    provisionamentoWorker: "erro",
    tipoErro: erro instanceof Error ? erro.name : "ErroDesconhecido",
    etapa: etapaAtual,
    ...(codigoSql ? { codigoSql } : {}),
  }));
  process.exitCode = 1;
});
