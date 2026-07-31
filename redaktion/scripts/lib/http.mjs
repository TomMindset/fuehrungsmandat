export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Erforderliche Konfiguration fehlt: ${name}`);
  return value;
}

export function optionalEnv(name) {
  return process.env[name]?.trim() || null;
}

export function safeBaseUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} fehlt oder ist keine gültige URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} muss eine HTTPS-URL ohne Zugangsdaten sein.`);
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

export async function requestJson(url, init = {}, label = "API-Aufruf") {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof body?.error?.message === "string"
        ? `: ${body.error.message}`
        : typeof body?.error === "string"
          ? `: ${body.error}`
          : "";
    throw new Error(`${label} fehlgeschlagen (HTTP ${response.status})${detail}`);
  }
  return { response, body };
}

export function portalAuthHeaders(secret) {
  const bypassToken = optionalEnv("FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN");
  const headers = {
    Authorization: `Bearer ${secret}`,
    "X-Fuehrungsmandat-Secret": secret
  };
  if (bypassToken) {
    headers["OAI-Sites-Authorization"] = `Bearer ${bypassToken}`;
  }
  return headers;
}

export async function portalJson(baseUrl, secret, path, init = {}) {
  return requestJson(
    `${baseUrl}${path}`,
    {
      ...init,
      headers: {
        ...portalAuthHeaders(secret),
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    },
    `Portalaufruf ${path}`
  );
}

export async function githubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const { appendFile } = await import("node:fs/promises");
  const normalized = String(value).replace(/\r?\n/gu, " ");
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${normalized}\n`, "utf8");
}
