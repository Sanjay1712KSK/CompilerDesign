import express from "express";
import cors from "cors";
import { compileC } from "./pipeline.js";

const app = express();
const port = process.env.PORT || 4000;
const host = process.env.HOST || "127.0.0.1";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, parser: "tree-sitter-c" });
});

app.post("/compile", (req, res) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code.trim()) {
      return res.status(400).json({ error: "The request body must include non-empty C source in `code`." });
    }

    res.json(compileC(code));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Compilation pipeline failed.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, host, () => {
  console.log(`C Compiler Visualizer API listening on http://${host}:${port}`);
});
