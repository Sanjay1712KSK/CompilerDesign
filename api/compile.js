export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { compileC } = await import("../server/src/pipeline.js");
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body;
    const code = typeof body?.code === "string" ? body.code : "";
    if (!code.trim()) {
      return res.status(400).json({ error: "The request body must include non-empty C source in `code`." });
    }

    return res.status(200).json(compileC(code));
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Compilation pipeline failed.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
