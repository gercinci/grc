// Agorà sunucusu: uygulamadan POST {prompt} alır, Anthropic API'sine iletir, {text} döndürür.
// Bağımlılık yok. Node.js 18 veya üstü gerekir.
// Çalıştırma:  ANTHROPIC_API_KEY=sk-ant-... node server.js
const http = require("http");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-haiku-5-5";
const BASE = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const MAX_PROMPT = 6000;        // karakter; uygulamanın gönderdiği en uzun istek bunun çok altında
const LIMIT = 30;               // bir IP'nin 10 dakikada yapabileceği istek sayısı
const WINDOW = 10 * 60 * 1000;
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";   // örn. https://gercinci.github.io

if (!API_KEY) { console.error("ANTHROPIC_API_KEY tanımlı değil."); process.exit(1); }

const hits = new Map();         // ip -> [zaman damgaları]
function allowed(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (list.length >= LIMIT) { hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list); return true;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (!l.some(t => now - t < WINDOW)) hits.delete(ip); }, WINDOW).unref();

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ORIGIN,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET") return send(res, 200, { ok: true });
  if (req.method !== "POST") return send(res, 405, { error: "Yalnızca POST" });
  if (ORIGIN !== "*" && req.headers.origin !== ORIGIN) return send(res, 403, { error: "İzin verilmeyen kaynak" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (!allowed(ip)) return send(res, 429, { error: "Çok fazla istek" });

  let raw = "";
  req.on("data", c => { raw += c; if (raw.length > 50000) req.destroy(); });
  req.on("end", async () => {
    let prompt;
    try { prompt = JSON.parse(raw).prompt; } catch (e) { return send(res, 400, { error: "Geçersiz JSON" }); }
    if (typeof prompt !== "string" || !prompt.trim()) return send(res, 400, { error: "prompt gerekli" });
    if (prompt.length > MAX_PROMPT) return send(res, 413, { error: "İstek çok uzun" });

    try {
      const r = await fetch(BASE + "/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] })
      });
      const j = await r.json();
      if (!r.ok) {
        console.error("Anthropic hatası", r.status, j && j.error && j.error.message);
        return send(res, r.status === 429 ? 429 : 502, { error: "Cevap alınamadı" });
      }
      const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      send(res, 200, { text });
    } catch (e) {
      console.error(e);
      send(res, 502, { error: "Cevap alınamadı" });
    }
  });
}).listen(PORT, () => console.log("Agorà sunucusu " + PORT + " portunda, model: " + MODEL));
