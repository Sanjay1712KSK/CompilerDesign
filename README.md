# C Compiler Visualizer

A full-stack compiler phase visualizer for C code. The backend uses `tree-sitter-c` for real parsing, then derives lexical tokens, AST output, semantic diagnostics, three-address code, basic optimizations, and x86-like pseudo assembly. The frontend is a dark glassmorphism React app with Monaco Editor, Tailwind CSS, and Framer Motion transitions.

## Project Structure

```text
.
|-- client/          # React + Vite + Tailwind + Framer Motion UI
|-- server/          # Express API and compiler pipeline
|-- package.json     # Convenience scripts
`-- README.md
```

## Setup

Install dependencies:

```bash
npm install
```

Run the backend:

```bash
npm run server
```

Run the frontend in another terminal:

```bash
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Vercel Deployment

This repo can be deployed to a single Vercel project from the `phases` folder:

1. Import the repository into Vercel.
2. Set the project root to `phases`.
3. Leave the framework as Vite.
4. Vercel will build the frontend from `client/` and expose serverless API routes from `api/`.

Environment variables:

- `VITE_API_URL`

Recommended values:

- Local development: leave it unset. The app defaults to `http://127.0.0.1:4000`.
- Vercel: leave it unset if frontend and API are deployed together in the same Vercel project. The app defaults to `/api`.
- Separate frontend/backend deployment: set `VITE_API_URL` to your deployed API base URL, for example `https://your-app.vercel.app/api`.

Useful routes after deployment:

- Frontend: `/`
- Health check: `/api/health`
- Compiler endpoint: `POST /api/compile`

## API

`POST http://localhost:4000/compile`

Request:

```json
{
  "code": "int main() { int x = 1 + 2; return x; }"
}
```

Response includes:

- `lexical.tokens`: token table with type, value, line, and column
- `syntax.tree`: readable Tree-sitter AST
- `semantic.messages`: semantic errors, warnings, and success messages
- `icg.code`: three-address code
- `optimization.before` and `optimization.after`: optimization comparison
- `target.code`: pseudo assembly using instructions like `MOV`, `CMP`, `JMP`, and `LABEL`

## Notes

The semantic analyzer and code generation are intentionally educational subsets. Tree-sitter provides accurate C parsing, while semantic checks and TAC generation currently focus on common declarations, assignments, expressions, `if`, `switch`, calls, and returns.
