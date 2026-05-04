# Visualization of Six Phases of Compiler Design 

A full-stack compiler phase visualizer for C programs. The app lets you paste or load sample C code, run it through an educational compilation pipeline, and inspect each stage from lexical analysis through pseudo assembly generation.

Live app: `https://phases-beta.vercel.app`  
Repository: `https://github.com/Sanjay1712KSK/Visualization-of-6-Phases-of-Compiler`

## What It Shows

- Lexical analysis with token type, lexeme, line, and column
- Syntax analysis with a readable Tree-sitter AST
- Semantic diagnostics with symbol table output
- Intermediate code generation in three-address code form
- Optimization output with before/after comparison
- Target code generation as x86-like pseudo assembly
- PDF report export for the generated compilation result

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Framer Motion, Monaco Editor
- Backend: Express, Tree-sitter, Tree-sitter C grammar
- Deployment: Vercel

## Project Structure

```text
.
|-- api/             # Vercel serverless API routes
|-- client/          # React + Vite frontend
|-- server/          # Compiler pipeline and local Express API
|-- vercel.json      # Vercel build and routing config
|-- package.json     # Workspace-level scripts
`-- README.md
```

## Local Development

Install dependencies:

```bash
npm install
```

Run the backend:

```bash
npm run server
```

Run the frontend in a second terminal:

```bash
npm run dev
```

Local URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend health check: `http://127.0.0.1:4000/health`
- Compile endpoint: `POST http://127.0.0.1:4000/compile`

Build the frontend:

```bash
npm run build
```

## Deployment

This project is configured to deploy from the `phases` folder as a single Vercel project.

- The frontend is built from `client/`
- The API is exposed through `api/`
- Production frontend requests default to `/api`

Useful deployed routes:

- App: `https://phases-beta.vercel.app`
- Health check: `https://phases-beta.vercel.app/api/health`
- Compile endpoint: `POST https://phases-beta.vercel.app/api/compile`

### Environment Variables

- `VITE_API_URL`

Recommended usage:

- Local development: leave it unset to use `http://127.0.0.1:4000`
- Same-project Vercel deploy: leave it unset to use `/api`
- Separate API deployment: set it to your deployed API base URL

## API Example

Request:

```http
POST /api/compile
Content-Type: application/json
```

```json
{
  "code": "int main() { int x = 1 + 2; return x; }"
}
```

Response includes:

- `lexical.tokens`
- `syntax.tree`
- `semantic.messages`
- `semantic.symbols`
- `icg.code`
- `optimization.before`
- `optimization.after`
- `optimization.events`
- `target.code`

## Notes

This project is designed for compiler-learning and visualization purposes. Tree-sitter provides real parsing, while the semantic analysis, TAC generation, optimization, and target code output intentionally focus on a practical educational subset of C.
