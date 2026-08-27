export const schema = `
  CREATE TABLE IF NOT EXISTS fighters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    author TEXT NOT NULL,
    prompt TEXT NOT NULL,
    config TEXT NOT NULL,
    script TEXT NOT NULL,
    portrait_url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fighters_owner ON fighters(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS stages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stages_owner ON stages(user_id, created_at DESC);
`;

const json = (data, status = 200) => Response.json(data, { status });
const clean = (value, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userId = request.headers.get("x-websim-user-id");
    const username = request.headers.get("x-websim-username") || "fighter";
    if (url.pathname === "/api/fighters" && request.method === "GET") {
      if (!userId) return json({ fighters: [] });
      const { results } = await env.DB.prepare("SELECT id, name, author, prompt, config, script, portrait_url, created_at FROM fighters WHERE user_id = ? ORDER BY created_at DESC LIMIT 40").bind(userId).all();
      return json({ fighters: results });
    }
    if (url.pathname === "/api/fighters" && request.method === "POST") {
      if (!userId) return json({ error: "Sign in to save fighters to your roster." }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid fighter data." }, 400); }
      const name = clean(body.name, 24), author = clean(body.author, 24), prompt = clean(body.prompt, 700), script = clean(body.script, 12000);
      const config = typeof body.config === "object" && body.config ? JSON.stringify(body.config).slice(0, 10000) : "";
      const portrait = clean(body.portraitUrl, 1000) || null;
      if (!name || !author || !config || !script) return json({ error: "Your fighter blueprint is incomplete." }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO fighters (id, user_id, username, name, author, prompt, config, script, portrait_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, userId, username, name, author, prompt, config, script, portrait, Date.now()).run();
      return json({ fighter: { id, name, author, prompt, config, script, portrait_url: portrait } });
    }
    if (url.pathname.startsWith("/api/fighters/") && ["PUT", "PATCH"].includes(request.method)) {
      if (!userId) return json({ error: "Sign in to edit fighters." }, 401);
      const id = decodeURIComponent(url.pathname.slice("/api/fighters/".length));
      if (!id || id.includes("/")) return json({ error: "Invalid fighter id." }, 400);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid fighter data." }, 400); }
      const name = clean(body.name, 24), author = clean(body.author, 24), prompt = clean(body.prompt, 700), script = clean(body.script, 12000);
      const config = typeof body.config === "object" && body.config ? JSON.stringify(body.config).slice(0, 10000) : "";
      const portrait = clean(body.portraitUrl, 1000) || null;
      if (!name || !author || !config || !script) return json({ error: "Your fighter blueprint is incomplete." }, 400);
      const result = await env.DB.prepare("UPDATE fighters SET name = ?, author = ?, prompt = ?, config = ?, script = ?, portrait_url = ? WHERE id = ? AND user_id = ?").bind(name, author, prompt, config, script, portrait, id, userId).run();
      if (!result.meta?.changes) return json({ error: "Fighter not found." }, 404);
      return json({ fighter: { id, name, author, prompt, config, script, portrait_url: portrait } });
    }
    // ── Stages ─────────────────────────────────────────────────────────────
    // Battle backgrounds a player has uploaded, saved the same way fighters are.
    if (url.pathname === "/api/stages" && request.method === "GET") {
      if (!userId) return json({ stages: [] });
      const { results } = await env.DB.prepare("SELECT id, name, image_url, created_at FROM stages WHERE user_id = ? ORDER BY created_at DESC LIMIT 40").bind(userId).all();
      return json({ stages: results });
    }
    if (url.pathname === "/api/stages" && request.method === "POST") {
      if (!userId) return json({ error: "Sign in to save stages." }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid stage data." }, 400); }
      const name = clean(body.name, 32) || "Untitled Stage";
      const imageUrl = clean(body.imageUrl, 1000);
      if (!/^https?:\/\//i.test(imageUrl)) return json({ error: "A stage needs an uploaded image." }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO stages (id, user_id, username, name, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, username, name, imageUrl, Date.now()).run();
      return json({ stage: { id, name, image_url: imageUrl } });
    }
    if (url.pathname.startsWith("/api/stages/") && request.method === "DELETE") {
      if (!userId) return json({ error: "Sign in to remove stages." }, 401);
      const id = decodeURIComponent(url.pathname.slice("/api/stages/".length));
      if (!id || id.includes("/")) return json({ error: "Invalid stage id." }, 400);
      const result = await env.DB.prepare("DELETE FROM stages WHERE id = ? AND user_id = ?").bind(id, userId).run();
      if (!result.meta?.changes) return json({ error: "Stage not found." }, 404);
      return json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  }
};
