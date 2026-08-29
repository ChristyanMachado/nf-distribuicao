import { pathToFileURL } from "node:url";

const texto = (ambiente, nome) => (ambiente[nome] ?? "").trim();

function urlSupabase(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === "https:"
      && url.hostname.endsWith(".supabase.co")
      && url.hostname !== ".supabase.co"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && ["", "/"].includes(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function pendenciasEnvDeploy(ambiente) {
  const pendencias = [];
  const databaseUrl = texto(ambiente, "DATABASE_URL");
  const supabaseUrl = texto(ambiente, "SUPABASE_URL");
  const publicaUrl = texto(ambiente, "NEXT_PUBLIC_SUPABASE_URL");
  const chaveServidor = texto(ambiente, "SUPABASE_SECRET_KEY")
    || texto(ambiente, "SUPABASE_SERVICE_ROLE_KEY");
  const provedorAuth = texto(ambiente, "APP_AUTH_PROVIDER") || "administrativo";
  const chavePublica = texto(ambiente, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    || texto(ambiente, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) pendencias.push("DATABASE_URL");
  if (!urlSupabase(supabaseUrl)) pendencias.push("SUPABASE_URL");
  if (!urlSupabase(publicaUrl) || publicaUrl !== supabaseUrl) {
    pendencias.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (chaveServidor.length < 24 || !/^[!-~]+$/.test(chaveServidor)) {
    pendencias.push("SUPABASE_SECRET_KEY");
  }
  if (texto(ambiente, "SUPABASE_STORAGE_BUCKET") !== "documentos-fiscais") {
    pendencias.push("SUPABASE_STORAGE_BUCKET");
  }
  if (texto(ambiente, "APP_AUTH_ENABLED") !== "true") {
    pendencias.push("APP_AUTH_ENABLED");
  }
  if (!["administrativo", "supabase"].includes(provedorAuth)) {
    pendencias.push("APP_AUTH_PROVIDER");
  } else if (provedorAuth === "supabase") {
    if (chavePublica.length < 20 || !/^[!-~]+$/.test(chavePublica)) {
      pendencias.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    }
  } else {
    if (!texto(ambiente, "APP_ADMIN_USER")) pendencias.push("APP_ADMIN_USER");
    if (texto(ambiente, "APP_ADMIN_PASSWORD").length < 12) {
      pendencias.push("APP_ADMIN_PASSWORD");
    }
  }
  if (texto(ambiente, "APP_SESSION_SECRET").length < 32) {
    pendencias.push("APP_SESSION_SECRET");
  }
  return [...new Set(pendencias)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pendencias = pendenciasEnvDeploy(process.env);
  if (pendencias.length) {
    console.error(`Deploy bloqueado: configure ${pendencias.join(", ")}.`);
    process.exitCode = 1;
  } else {
    console.log("Variáveis obrigatórias do deploy validadas sem exibir valores.");
  }
}
