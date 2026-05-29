import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import httpsProxyAgent from "https-proxy-agent";

const { HttpsProxyAgent } = httpsProxyAgent;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8080);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function cleanMultipartToken(value) {
  return String(value).replace(/[\r\n"]/g, "_");
}

function removeContentHeaders(headers) {
  const result = { ...headers };
  for (const key of Object.keys(result)) {
    const lower = key.toLowerCase();
    if (lower === "content-type" || lower === "content-length") {
      delete result[key];
    }
  }
  return result;
}

function encodeProxyFormData(fields) {
  const boundary = `----santipx-proxy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  const pushText = (text) => chunks.push(Buffer.from(text, "utf8"));

  for (const field of fields) {
    if (!field?.name) continue;
    const name = cleanMultipartToken(field.name);
    if (field.dataBase64 !== undefined) {
      const fileName = cleanMultipartToken(field.fileName || "upload.bin");
      const mimeType = field.mimeType || "application/octet-stream";
      pushText(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
      chunks.push(Buffer.from(field.dataBase64, "base64"));
      pushText("\r\n");
      continue;
    }

    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${field.value ?? ""}\r\n`);
  }

  pushText(`--${boundary}--\r\n`);
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function getEnvProxyUrl(targetUrl) {
  const url = new URL(targetUrl);
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";
  const isNoProxy = noProxy
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .some((entry) => url.hostname === entry || url.hostname.endsWith(entry.replace(/^\./, "")));

  if (isNoProxy) return null;
  if (url.protocol === "https:") {
    return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy || null;
  }
  return process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy || null;
}

function fetchViaProxy(targetUrl, method, headers, body, proxyUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const requestHeaders = { ...headers };
    if (body && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === "content-length")) {
      requestHeaders["content-length"] = String(body.length);
    }

    const req = request(url, {
      method,
      headers: requestHeaders,
      agent: new HttpsProxyAgent(proxyUrl),
    }, (proxyResponse) => {
      const chunks = [];
      proxyResponse.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      proxyResponse.on("end", () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(proxyResponse.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(key, item);
          } else if (value !== undefined) {
            responseHeaders.set(key, String(value));
          }
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: proxyResponse.statusCode || 502,
          statusText: proxyResponse.statusMessage,
          headers: responseHeaders,
        }));
      });
    });

    req.on("error", reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

async function fetchWithProxyFallback(targetUrl, method, headers, body) {
  try {
    return await fetch(targetUrl, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? body : undefined,
    });
  } catch (error) {
    const proxyUrl = getEnvProxyUrl(targetUrl);
    if (!proxyUrl) throw error;
    console.warn("[api-proxy] Direct fetch failed, retrying via proxy", {
      targetUrl,
      proxyUrl,
      detail: error instanceof Error ? error.message : String(error),
    });
    return fetchViaProxy(
      targetUrl,
      method,
      headers,
      method !== "GET" && method !== "HEAD" ? body : undefined,
      proxyUrl,
    );
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

async function handleApiProxy(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }

  const targetUrl = new URL(req.url || "", "http://localhost").searchParams.get("url");
  if (!targetUrl) {
    sendJson(res, 400, { error: "Missing ?url= parameter" });
    return;
  }

  try {
    const method = req.method || "GET";
    const proxyHeaders = req.headers["x-proxy-headers"];
    let headers = {};
    if (typeof proxyHeaders === "string") {
      try {
        headers = JSON.parse(proxyHeaders);
      } catch {
        headers = {};
      }
    }

    let body = await readRequestBody(req);
    if (req.headers["x-proxy-form-data"] === "1") {
      const fields = JSON.parse(body.toString("utf8"));
      const encoded = encodeProxyFormData(fields);
      headers = removeContentHeaders(headers);
      headers["content-type"] = encoded.contentType;
      body = encoded.body;
    }

    const response = await fetchWithProxyFallback(targetUrl, method, headers, body.length > 0 ? body : undefined);
    const responseBuffer = Buffer.from(await response.arrayBuffer());
    const responseHeaders = {
      "Access-Control-Allow-Origin": "*",
    };

    for (const headerName of ["content-type", "content-disposition", "cache-control"]) {
      const value = response.headers.get(headerName);
      if (value) responseHeaders[headerName] = value;
    }

    res.writeHead(response.status, responseHeaders);
    res.end(responseBuffer);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[api-proxy] Proxy request failed", { targetUrl, method: req.method || "GET", detail });
    sendJson(res, 502, { error: "Proxy request failed", detail, targetUrl });
  }
}

function isSafePath(filePath) {
  const relative = path.relative(distDir, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveStaticFile(pathname) {
  const decodedPathname = decodeURIComponent(pathname);
  const requestPath = decodedPathname === "/" ? "/index.html" : decodedPathname;
  const filePath = path.join(distDir, requestPath);

  if (!isSafePath(filePath)) return null;

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) return filePath;
  } catch {
    return path.join(distDir, "index.html");
  }

  return path.join(distDir, "index.html");
}

async function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const filePath = await resolveStaticFile(url.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": filePath.includes(`${path.sep}assets${path.sep}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    };
    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/__api_proxy") {
    handleApiProxy(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`SantiPX server listening on http://${host}:${port}`);
});
