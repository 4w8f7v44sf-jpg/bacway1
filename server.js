// BacWay server: serves the site and relays AI requests to Claude.
// The API key stays on the server (never in the browser).
const express = require("express");
const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(__dirname + "/public"));

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const SYSTEM = "You are BacWay's study coach for Tunisian secondary-school students (Bac and 3ème). Teach accurately and clearly, adapt to the student's profile, be warm and concise. If a student seems in serious distress, respond with care and encourage talking to a trusted adult or professional.";

const hits = new Map(); // simple per-IP rate limit: 20 requests / minute
setInterval(() => hits.clear(), 60000);

app.post("/api/ai", async (req, res) => {
  try {
    if (!KEY) return res.status(500).json({ error: "missing key" });
    const ip = req.headers["x-forwarded-for"] || req.ip;
    hits.set(ip, (hits.get(ip) || 0) + 1);
    if (hits.get(ip) > 20) return res.status(429).json({ error: "slow down" });
    let m = req.body.messages;
    if (!Array.isArray(m) || !m.length || m.length > 40) return res.status(400).json({ error: "bad request" });
    m = m.map(x => ({ role: x.role === "assistant" ? "assistant" : "user", content: String(x.content).slice(0, 12000) }));
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages: m })
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: "upstream" });
    res.json({ text: d.content.filter(b => b.type === "text").map(b => b.text).join("") });
  } catch (e) { res.status(500).json({ error: "server" }); }
});

app.listen(process.env.PORT || 3000, () => console.log("BacWay running"));
