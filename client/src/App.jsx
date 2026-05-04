import { useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Braces,
  Bug,
  ChevronRight,
  Cpu,
  Download,
  FileCode2,
  Github,
  Layers3,
  Play,
  Sparkles,
  Zap
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { defaultCode, examples } from "./examples";

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:4000" : "/api");

const phases = [
  { id: "lexical", label: "Lexical", icon: FileCode2 },
  { id: "syntax", label: "Syntax", icon: Braces },
  { id: "semantic", label: "Semantic", icon: Bug },
  { id: "icg", label: "ICG", icon: Layers3 },
  { id: "optimization", label: "Optimization", icon: Sparkles },
  { id: "target", label: "Target Code", icon: Cpu }
];

export default function App() {
  const [code, setCode] = useState(defaultCode);
  const [result, setResult] = useState(null);
  const [activePhase, setActivePhase] = useState("lexical");
  const [loading, setLoading] = useState(false);
  const [pipelineMode, setPipelineMode] = useState(false);
  const [error, setError] = useState("");
  const reportRef = useRef(null);

  const activeIndex = phases.findIndex((phase) => phase.id === activePhase);

  const runCompilation = async (animateAll = false) => {
    setLoading(true);
    setError("");
    setPipelineMode(animateAll);

    try {
      const response = await fetch(`${API_URL}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Compilation failed.");
      setResult(payload);

      if (animateAll) {
        for (const phase of phases) {
          setActivePhase(phase.id);
          await wait(520);
        }
      } else {
        setActivePhase("lexical");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
      setPipelineMode(false);
    }
  };

  const downloadReport = async () => {
    if (!reportRef.current || !result) return;
    const canvas = await html2canvas(reportRef.current, {
      backgroundColor: "#070a12",
      scale: 1.5
    });
    const pdf = new jsPDF("p", "mm", "a4");
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, Math.min(height, 287));
    pdf.save("c-compiler-report.pdf");
  };

  const summary = useMemo(() => {
    if (!result) return null;
    return [
      { label: "Tokens", value: result.lexical.count },
      { label: "AST", value: result.syntax.hasError ? "Partial" : "Valid" },
      { label: "Semantic", value: result.semantic.ok ? "Clean" : "Issues" },
      { label: "TAC Lines", value: result.icg.code.length }
    ];
  }, [result]);

  return (
    <main className="min-h-screen px-4 py-5 text-slate-100 md:px-6 lg:px-8">
      <section className="mx-auto flex max-w-[1800px] flex-col gap-5">
        <header className="glass flex flex-col gap-4 rounded-lg px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-300/10 shadow-glow">
                <Zap className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">C Compiler Visualizer</h1>
                <p className="text-sm text-slate-400">Tree-sitter powered compiler phases from source to pseudo assembly.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-10 rounded-md border border-slate-700/80 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition hover:border-cyan-300/50"
              onChange={(event) => {
                const selected = examples.find((item) => item.name === event.target.value);
                if (selected) setCode(selected.code);
              }}
              defaultValue=""
              aria-label="Load example"
            >
              <option value="" disabled>Examples</option>
              {examples.map((example) => (
                <option key={example.name} value={example.name}>{example.name}</option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/15 px-4 text-sm font-medium text-cyan-50 shadow-glow transition hover:-translate-y-0.5 hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runCompilation(false)}
              disabled={loading}
            >
              <Play className="h-4 w-4" />
              {loading && !pipelineMode ? "Running..." : "Run Compilation"}
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-fuchsia-300/25 bg-fuchsia-300/10 px-4 text-sm font-medium text-fuchsia-50 shadow-violet transition hover:-translate-y-0.5 hover:bg-fuchsia-300/20 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runCompilation(true)}
              disabled={loading}
            >
              <Activity className="h-4 w-4" />
              Run All Phases
            </button>
            <button
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-600/70 bg-slate-900/70 px-3 text-slate-200 transition hover:border-cyan-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={downloadReport}
              disabled={!result}
              title="Download PDF report"
            >
              <Download className="h-4 w-4" />
            </button>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-600/70 bg-slate-900/70 px-4 text-sm font-medium text-slate-200 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:text-white"
              href="https://github.com/Sanjay1712KSK/Visualization-of-6-Phases-of-Compiler"
              target="_blank"
              rel="noreferrer"
              title="Open GitHub repository"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[minmax(420px,0.95fr)_minmax(520px,1.05fr)]">
          <section className="glass flex min-h-[520px] flex-col overflow-hidden rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">Source Editor</h2>
                <p className="text-xs text-slate-500">Any valid C source, compiled on demand.</p>
              </div>
              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">Monaco</div>
            </div>
            <div className="min-h-[460px] flex-1">
              <Editor
                height="100%"
                defaultLanguage="c"
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value ?? "")}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 18, bottom: 18 },
                  smoothScrolling: true,
                  bracketPairColorization: { enabled: true },
                  automaticLayout: true
                }}
              />
            </div>
          </section>

          <section ref={reportRef} className="glass flex min-h-[520px] flex-col overflow-hidden rounded-lg">
            <PhaseStepper activePhase={activePhase} setActivePhase={setActivePhase} result={result} loading={pipelineMode} />

            {error ? (
              <div className="m-4 rounded-md border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
            ) : null}

            {summary ? (
              <div className="grid grid-cols-2 gap-3 border-b border-slate-700/50 px-4 py-4 md:grid-cols-4">
                {summary.map((item) => (
                  <div key={item.label} className="rounded-md border border-slate-700/60 bg-slate-950/40 px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                    <div className="mt-1 text-lg font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePhase}
                  initial={{ opacity: 0, x: 28, filter: "blur(8px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -28, filter: "blur(8px)" }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="h-full"
                >
                  <PhasePanel phase={activePhase} result={result} activeIndex={activeIndex} />
                </motion.div>
              </AnimatePresence>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function PhaseStepper({ activePhase, setActivePhase, result, loading }) {
  const activeIndex = phases.findIndex((phase) => phase.id === activePhase);

  return (
    <nav className="border-b border-slate-700/60 px-4 py-4">
      <div className="thin-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
        {phases.map((phase, index) => {
          const Icon = phase.icon;
          const active = phase.id === activePhase;
          const passed = index < activeIndex;
          return (
            <button
              key={phase.id}
              onClick={() => setActivePhase(phase.id)}
              className={`group relative flex min-w-max items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                active
                  ? "border-cyan-300/50 bg-cyan-300/15 text-white shadow-glow"
                  : passed
                    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                    : "border-slate-700/70 bg-slate-950/40 text-slate-400 hover:border-slate-500 hover:text-slate-100"
              }`}
              disabled={!result && index > 0}
            >
              <Icon className="h-4 w-4" />
              <span>{phase.label}</span>
              {loading && active ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-glow" /> : null}
              {index < phases.length - 1 ? <ChevronRight className="h-4 w-4 text-slate-600" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PhasePanel({ phase, result }) {
  if (!result) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 p-8 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-300/10 shadow-glow">
            <Play className="h-6 w-6 text-cyan-100" />
          </div>
          <h2 className="text-xl font-semibold text-white">Ready to compile</h2>
          <p className="mt-2 max-w-md text-sm text-slate-400">Run the pipeline to produce live tokens, AST, semantic diagnostics, TAC, optimizations, and target code.</p>
        </div>
      </div>
    );
  }

  if (phase === "lexical") return <LexicalPanel tokens={result.lexical.tokens} />;
  if (phase === "syntax") return <SyntaxPanel tree={result.syntax.tree} hasError={result.syntax.hasError} />;
  if (phase === "semantic") return <SemanticPanel semantic={result.semantic} />;
  if (phase === "icg") return <CodePanel title="Three Address Code" lines={result.icg.code} accent="cyan" />;
  if (phase === "optimization") return <OptimizationPanel optimization={result.optimization} />;
  return <CodePanel title="Pseudo x86-like Assembly" lines={result.target.code} accent="violet" />;
}

function LexicalPanel({ tokens }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <PanelTitle title="Lexical Analysis" subtitle={`${tokens.length} tokens discovered by the source scanner.`} />
      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto rounded-lg border border-slate-700/70">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.16em] text-slate-400 backdrop-blur">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Lexeme</th>
              <th className="px-4 py-3">Position</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id} className="border-t border-slate-800/90 hover:bg-slate-800/35">
                <td className="px-4 py-3 text-slate-500">{token.id}</td>
                <td className="px-4 py-3">
                  <span className={`token-${token.type} rounded border px-2 py-1 text-xs font-medium`}>{token.type}</span>
                </td>
                <td className="px-4 py-3 font-mono text-slate-100">{token.value}</td>
                <td className="px-4 py-3 text-slate-400">Ln {token.line}, Col {token.column}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SyntaxPanel({ tree, hasError }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <PanelTitle title="Syntax Analysis" subtitle={hasError ? "Tree-sitter returned a partial parse with errors." : "Tree-sitter generated a valid C AST."} />
      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto rounded-lg border border-slate-700/70 bg-slate-950/45 p-3">
        <TreeNode node={tree} depth={0} />
      </div>
    </div>
  );
}

function TreeNode({ node, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;

  return (
    <div className="font-mono text-sm">
      <button
        className="my-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left transition hover:bg-slate-800/70"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        <span className="w-4 text-slate-500">{hasChildren ? (open ? "v" : ">") : "-"}</span>
        <span className="text-cyan-200">{node.type}</span>
        {node.text ? <span className="truncate text-slate-500">{node.text}</span> : null}
      </button>
      {open && hasChildren ? node.children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />) : null}
    </div>
  );
}

function SemanticPanel({ semantic }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <PanelTitle title="Semantic Analysis" subtitle={semantic.ok ? "No blocking semantic errors found." : "Semantic checks found issues to inspect."} />
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          {semantic.messages.map((item, index) => (
            <div
              key={`${item.text}-${index}`}
              className={`rounded-md border p-3 text-sm ${
                item.level === "error"
                  ? "border-rose-300/30 bg-rose-500/10 text-rose-100"
                  : item.level === "warning"
                    ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
                    : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
              }`}
            >
              <div className="font-medium">{item.text}</div>
              <div className="mt-1 text-xs opacity-70">Line {item.line}, column {item.column}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Symbol Table</h3>
          <div className="mt-3 space-y-2">
            {semantic.symbols.length ? semantic.symbols.map((symbol) => (
              <div key={symbol.name} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-2 py-2 text-sm">
                <span className="font-mono text-slate-100">{symbol.name}</span>
                <span className="text-cyan-200">{symbol.type}</span>
              </div>
            )) : <p className="text-sm text-slate-500">No symbols recorded.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function OptimizationPanel({ optimization }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <PanelTitle title="Optimization" subtitle="Constant folding and simple dead temporary elimination." />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2">
          <div className="text-xs uppercase tracking-[0.16em] text-cyan-200">Iterations</div>
          <div className="mt-1 text-lg font-semibold text-white">{optimization.iterations ?? 1}</div>
        </div>
        <div className="rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2">
          <div className="text-xs uppercase tracking-[0.16em] text-emerald-200">Changes</div>
          <div className="mt-1 text-lg font-semibold text-white">{optimization.events?.length ?? 0}</div>
        </div>
        <div className="rounded-md border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-2">
          <div className="text-xs uppercase tracking-[0.16em] text-fuchsia-200">CFG Blocks</div>
          <div className="mt-1 text-lg font-semibold text-white">{optimization.cfg?.length ?? 0}</div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <CodePanel title="Before" lines={optimization.before} compact accent="rose" />
        <CodePanel title="After" lines={optimization.after} compact accent="emerald" />
      </div>
      <div className="thin-scrollbar max-h-40 overflow-auto rounded-lg border border-slate-700/70 bg-slate-950/45 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Optimization Log</h3>
        <div className="mt-3 space-y-2">
          {(optimization.events ?? []).length ? optimization.events.map((item, index) => (
            <div key={`${item.pass}-${index}`} className="rounded border border-slate-800 bg-slate-900/60 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 font-medium text-cyan-100">{item.pass}</span>
                <span className="text-slate-400">line {item.line}</span>
              </div>
              <div className="mt-1 font-mono text-slate-300">{item.before} =&gt; {item.after}</div>
              <div className="mt-1 text-slate-500">{item.detail}</div>
            </div>
          )) : <p className="text-sm text-slate-500">No optimization opportunities found.</p>}
        </div>
      </div>
    </div>
  );
}

function CodePanel({ title, lines, compact = false, accent = "cyan" }) {
  const accentClass = accent === "violet" ? "border-fuchsia-300/30" : accent === "rose" ? "border-rose-300/30" : accent === "emerald" ? "border-emerald-300/30" : "border-cyan-300/30";
  return (
    <div className={`flex h-full min-h-0 flex-col gap-4 ${compact ? "" : ""}`}>
      <PanelTitle title={title} subtitle={`${lines.length} generated lines.`} compact={compact} />
      <pre className={`thin-scrollbar min-h-0 flex-1 overflow-auto rounded-lg border ${accentClass} bg-slate-950/70 p-4 text-sm leading-7 text-slate-100 shadow-inner`}>
        <code>
          {lines.map((line, index) => (
            <span key={`${line}-${index}`} className="block">
              <span className="mr-4 select-none text-slate-600">{String(index + 1).padStart(2, "0")}</span>
              <span className={line.endsWith(":") || line.startsWith("LABEL") ? "text-cyan-200" : line.startsWith("J") || line.startsWith("CMP") ? "text-fuchsia-200" : "text-slate-100"}>{line}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function PanelTitle({ title, subtitle, compact = false }) {
  return (
    <div>
      <h2 className={`${compact ? "text-base" : "text-xl"} font-semibold text-white`}>{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
