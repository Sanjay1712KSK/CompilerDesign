import Parser from "tree-sitter";
import C from "tree-sitter-c";

const parser = new Parser();
parser.setLanguage(C);

const primitiveTypes = new Set([
  "char",
  "short",
  "int",
  "long",
  "float",
  "double",
  "void",
  "signed",
  "unsigned",
  "bool",
  "_Bool"
]);

const keywords = new Set([
  "auto",
  "break",
  "case",
  "char",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extern",
  "float",
  "for",
  "goto",
  "if",
  "inline",
  "int",
  "long",
  "register",
  "restrict",
  "return",
  "short",
  "signed",
  "sizeof",
  "static",
  "struct",
  "switch",
  "typedef",
  "union",
  "unsigned",
  "void",
  "volatile",
  "while"
]);

const tokenPatterns = [
  ["comment", /^\/\/[^\n]*|^\/\*[\s\S]*?\*\//],
  ["string", /^"(?:\\.|[^"\\])*"/],
  ["char", /^'(?:\\.|[^'\\])+'/],
  ["number", /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:[uUlLfF]*)/],
  ["operator", /^(?:==|!=|<=|>=|\+\+|--|&&|\|\||<<|>>|->|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[+\-*/%=<>!&|^~?:])/],
  ["punctuation", /^[{}()[\],.;#]/],
  ["identifier", /^[A-Za-z_][A-Za-z0-9_]*/]
];

export function compileC(code) {
  const tree = parser.parse(code);
  const ast = toReadableTree(tree.rootNode, code);
  const tokens = tokenize(code);
  const semantic = analyzeSemantics(tree.rootNode, code);
  const tacBefore = generateTac(tree.rootNode, code);
  const optimized = optimizeTac(tacBefore);
  const assembly = generateAssembly(optimized.after);

  return {
    sourceLength: code.length,
    lexical: { tokens, count: tokens.length },
    syntax: {
      hasError: Boolean(tree.rootNode.hasError),
      tree: ast,
      json: ast
    },
    semantic,
    icg: { code: tacBefore },
    optimization: optimized,
    target: { code: assembly }
  };
}

function tokenize(code) {
  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  while (index < code.length) {
    const rest = code.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      for (const char of whitespace[0]) {
        if (char === "\n") {
          line += 1;
          column = 1;
        } else {
          column += 1;
        }
      }
      index += whitespace[0].length;
      continue;
    }

    let matched = false;
    for (const [rawType, pattern] of tokenPatterns) {
      const match = rest.match(pattern);
      if (!match) continue;

      const value = match[0];
      const type = rawType === "identifier" && keywords.has(value) ? "keyword" : rawType;
      tokens.push({
        id: tokens.length + 1,
        type,
        value,
        line,
        column
      });

      index += value.length;
      column += value.length;
      matched = true;
      break;
    }

    if (!matched) {
      tokens.push({
        id: tokens.length + 1,
        type: "unknown",
        value: code[index],
        line,
        column
      });
      index += 1;
      column += 1;
    }
  }

  return tokens;
}

function toReadableTree(node, code, depth = 0) {
  const namedChildren = node.namedChildren ?? [];
  const text = nodeText(node, code);
  return {
    id: `${node.type}-${node.startIndex}-${node.endIndex}-${depth}`,
    type: node.type,
    field: fieldName(node),
    text: text.length > 80 ? `${text.slice(0, 77)}...` : text,
    start: node.startPosition,
    end: node.endPosition,
    children: namedChildren.map((child) => toReadableTree(child, code, depth + 1))
  };
}

function fieldName(node) {
  if (!node.parent?.children || typeof node.parent.fieldNameForChild !== "function") return null;
  const index = node.parent.children.findIndex((child) => child.startIndex === node.startIndex && child.endIndex === node.endIndex && child.type === node.type);
  return index >= 0 ? node.parent.fieldNameForChild(index) : null;
}

function analyzeSemantics(root, code) {
  const scopes = [new Map()];
  const allSymbols = [];
  const messages = [];

  const currentScope = () => scopes[scopes.length - 1];
  const findSymbol = (name) => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      if (scopes[i].has(name)) return scopes[i].get(name);
    }
    return null;
  };

  const declare = (name, type, node) => {
    if (currentScope().has(name)) {
      messages.push(message("error", `Duplicate declaration of '${name}'.`, node));
      return;
    }
    const symbol = { name, type, line: node.startPosition.row + 1, column: node.startPosition.column + 1 };
    currentScope().set(name, symbol);
    allSymbols.push(symbol);
    messages.push(message("success", `Declared '${name}' as ${type}.`, node));
  };

  const visit = (node) => {
    if (node.type === "compound_statement") scopes.push(new Map());

    if (node.type === "declaration") {
      const declarationType = extractDeclarationType(node, code);
      for (const declarator of collectDeclarators(node)) {
        const nameNode = findIdentifier(declarator);
        if (!nameNode) continue;
        const name = nodeText(nameNode, code);
        declare(name, declarationType, nameNode);

        const init = childByType(declarator, "initializer_list") ?? declarator.childForFieldName?.("value");
        const assignment = nodeText(declarator, code).split("=").slice(1).join("=");
        if (assignment.trim()) {
          const rhsType = inferExpressionTypeFromText(assignment, findSymbol);
          if (rhsType !== "unknown" && !typesCompatible(declarationType, rhsType)) {
            messages.push(message("error", `Type mismatch: cannot initialize ${declarationType} '${name}' with ${rhsType}.`, declarator));
          }
        } else if (init) {
          messages.push(message("warning", `Initializer for '${name}' may need manual review.`, init));
        }
      }
    }

    if (node.type === "assignment_expression") {
      const left = node.childForFieldName?.("left") ?? node.namedChild(0);
      const right = node.childForFieldName?.("right") ?? node.namedChild(1);
      const name = left ? nodeText(left, code).replace(/\s+/g, "") : "";
      const symbol = findSymbol(name);
      if (!symbol) {
        messages.push(message("error", `Undeclared variable '${name}' assigned.`, left ?? node));
      } else if (right) {
        const rhsType = inferExpressionType(right, code, findSymbol, messages);
        if (rhsType !== "unknown" && !typesCompatible(symbol.type, rhsType)) {
          messages.push(message("error", `Type mismatch: '${name}' is ${symbol.type}, assigned ${rhsType}.`, node));
        }
      }
    }

    if (node.type === "identifier" && isIdentifierUse(node)) {
      const name = nodeText(node, code);
      if (!findSymbol(name) && !isKnownFunctionUse(node, code) && !primitiveTypes.has(name)) {
        messages.push(message("error", `Undeclared identifier '${name}'.`, node));
      }
    }

    for (const child of node.namedChildren) visit(child);
    if (node.type === "compound_statement") scopes.pop();
  };

  visit(root);

  const hasErrors = Boolean(root.hasError);
  if (hasErrors) {
    messages.unshift({
      level: "error",
      text: "Syntax errors were found by Tree-sitter; semantic results may be partial.",
      line: 1,
      column: 1
    });
  }

  if (!messages.some((item) => item.level === "error" || item.level === "warning")) {
    messages.push({ level: "success", text: "No semantic issues detected in the analyzed subset.", line: 1, column: 1 });
  }

  return {
    ok: !messages.some((item) => item.level === "error"),
    messages,
    symbols: allSymbols
  };
}

function generateTac(root, code) {
  const out = [];
  let temp = 0;
  let label = 0;
  const nextTemp = () => `t${++temp}`;
  const nextLabel = (prefix = "L") => `${prefix}${++label}`;

  const emitExpression = (node) => {
    if (!node) return "";
    if (["identifier", "number_literal", "string_literal", "char_literal"].includes(node.type)) return nodeText(node, code);
    if (node.type === "parenthesized_expression") return emitExpression(node.namedChild(0));
    if (node.type === "binary_expression") {
      const left = emitExpression(node.childForFieldName?.("left") ?? node.namedChild(0));
      const right = emitExpression(node.childForFieldName?.("right") ?? node.namedChild(1));
      const op = operatorFromText(nodeText(node, code));
      const target = nextTemp();
      out.push(`${target} = ${left} ${op} ${right}`);
      return target;
    }
    if (node.type === "call_expression") {
      const fn = nodeText(node.childForFieldName?.("function") ?? node.namedChild(0), code);
      const args = childByType(node, "argument_list")?.namedChildren.map((arg) => emitExpression(arg)).join(", ") ?? "";
      const target = nextTemp();
      out.push(`${target} = call ${fn}, ${args}`);
      return target;
    }
    return nodeText(node, code);
  };

  const visit = (node) => {
    if (node.type === "declaration") {
      for (const declarator of collectDeclarators(node)) {
        const nameNode = findIdentifier(declarator);
        if (!nameNode) continue;
        const text = nodeText(declarator, code);
        if (text.includes("=")) {
          const rhs = declarator.namedChildren.find((child) => child !== nameNode && child.startIndex > nameNode.endIndex);
          const value = rhs ? emitExpression(rhs) : text.split("=").slice(1).join("=").trim();
          out.push(`${nodeText(nameNode, code)} = ${value}`);
        }
      }
    }

    if (node.type === "assignment_expression") {
      const left = node.childForFieldName?.("left") ?? node.namedChild(0);
      const right = node.childForFieldName?.("right") ?? node.namedChild(1);
      out.push(`${nodeText(left, code)} = ${emitExpression(right)}`);
    }

    if (node.type === "if_statement") {
      const condition = node.childForFieldName?.("condition") ?? childByType(node, "parenthesized_expression");
      const consequence = node.childForFieldName?.("consequence");
      const alternative = node.childForFieldName?.("alternative");
      const elseLabel = nextLabel("ELSE");
      const endLabel = nextLabel("ENDIF");
      out.push(`ifFalse ${emitExpression(condition?.namedChild(0) ?? condition)} goto ${elseLabel}`);
      if (consequence) visit(consequence);
      out.push(`goto ${endLabel}`);
      out.push(`${elseLabel}:`);
      if (alternative) visit(alternative);
      out.push(`${endLabel}:`);
      return;
    }

    if (node.type === "switch_statement") {
      const condition = node.childForFieldName?.("condition") ?? childByType(node, "parenthesized_expression");
      const switchTemp = emitExpression(condition?.namedChild(0) ?? condition);
      const endLabel = nextLabel("ENDSW");
      const defaultLabel = nextLabel("DEFAULT");
      const cases = [
        ...findDescendants(node, "case_statement").map((caseNode) => {
          const caseValue = caseNode.namedChild(0) ? nodeText(caseNode.namedChild(0), code) : "default";
          return {
            node: caseNode,
            value: caseValue,
            label: nextLabel(`CASE_${caseValue.replace(/\W+/g, "_")}_`),
            bodyStart: 1
          };
        }),
        ...findDescendants(node, "default_statement").map((caseNode) => ({
          node: caseNode,
          value: "default",
          label: defaultLabel,
          bodyStart: 0
        }))
      ];

      for (const item of cases.filter((caseItem) => caseItem.value !== "default")) {
        out.push(`if ${switchTemp} == ${item.value} goto ${item.label}`);
      }
      out.push(`goto ${cases.some((item) => item.value === "default") ? defaultLabel : endLabel}`);

      for (const item of cases) {
        out.push(`${item.label}:`);
        for (let i = item.bodyStart; i < item.node.namedChildCount; i += 1) {
          const child = item.node.namedChild(i);
          if (child?.type !== "break_statement") visit(child);
        }
      }
      out.push(`${endLabel}:`);
      return;
    }

    if (node.type === "return_statement") {
      out.push(`return ${node.namedChild(0) ? emitExpression(node.namedChild(0)) : ""}`.trim());
    }

    for (const child of node.namedChildren) visit(child);
  };

  visit(root);
  return dedupeAdjacent(out.length ? out : ["// No TAC generated for the analyzed subset."]);
}

function optimizeTac(lines) {
  const before = [...lines];
  const folded = before.map((line) => {
    const match = line.match(/^(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return line;
    const [, target, leftRaw, op, rightRaw] = match;
    const left = Number(leftRaw);
    const right = Number(rightRaw);
    const value = op === "+" ? left + right : op === "-" ? left - right : op === "*" ? left * right : right === 0 ? NaN : left / right;
    return Number.isFinite(value) ? `${target} = ${value}` : line;
  });

  const used = new Set();
  for (const line of folded) {
    for (const name of line.match(/\b[a-zA-Z_]\w*\b/g) ?? []) {
      if (!/^(t\d+)$/.test(name)) used.add(name);
    }
    const rhs = line.split("=").slice(1).join("=");
    for (const temp of rhs.match(/\bt\d+\b/g) ?? []) used.add(temp);
  }

  const after = folded.filter((line) => {
    const tempAssign = line.match(/^(t\d+)\s*=/);
    return !tempAssign || used.has(tempAssign[1]);
  });

  return {
    before,
    after,
    changes: before.map((line, index) => ({
      before: line,
      after: after[index] ?? "",
      changed: line !== (after[index] ?? "")
    }))
  };
}

function generateAssembly(lines) {
  const assembly = [];
  for (const line of lines) {
    if (line.endsWith(":")) {
      assembly.push(`LABEL ${line.slice(0, -1)}`);
      continue;
    }
    let match = line.match(/^ifFalse\s+(.+)\s+goto\s+(\w+)$/);
    if (match) {
      assembly.push(`CMP ${match[1]}, 0`);
      assembly.push(`JE ${match[2]}`);
      continue;
    }
    match = line.match(/^if\s+(.+)\s+==\s+(.+)\s+goto\s+(\w+)$/);
    if (match) {
      assembly.push(`CMP ${match[1]}, ${match[2]}`);
      assembly.push(`JE ${match[3]}`);
      continue;
    }
    match = line.match(/^goto\s+(\w+)$/);
    if (match) {
      assembly.push(`JMP ${match[1]}`);
      continue;
    }
    match = line.match(/^return\s*(.*)$/);
    if (match) {
      if (match[1]) assembly.push(`MOV RAX, ${match[1]}`);
      assembly.push("RET");
      continue;
    }
    match = line.match(/^(.+?)\s*=\s*(.+)$/);
    if (match) {
      assembly.push(`MOV ${match[1]}, ${match[2]}`);
      continue;
    }
    assembly.push(`; ${line}`);
  }
  return assembly;
}

function message(level, text, node) {
  return {
    level,
    text,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1
  };
}

function nodeText(node, code) {
  if (!node) return "";
  return code.slice(node.startIndex, node.endIndex);
}

function extractDeclarationType(node, code) {
  const typeNode = node.namedChildren.find((child) => child.type.includes("type") || primitiveTypes.has(nodeText(child, code)));
  return typeNode ? nodeText(typeNode, code).replace(/\s+/g, " ").trim() : "int";
}

function collectDeclarators(node) {
  const direct = node.namedChildren.filter((child) => child.type.includes("declarator"));
  if (direct.length) return direct.flatMap((item) => item.type === "init_declarator" ? [item] : [item]);
  return node.namedChildren.filter((child) => child.type !== "primitive_type" && child.type !== "type_identifier");
}

function findIdentifier(node) {
  if (!node) return null;
  if (node.type === "identifier") return node;
  for (const child of node.namedChildren) {
    const found = findIdentifier(child);
    if (found) return found;
  }
  return null;
}

function childByType(node, type) {
  return node?.namedChildren.find((child) => child.type === type) ?? null;
}

function findDescendants(node, type, results = []) {
  if (node.type === type) results.push(node);
  for (const child of node.namedChildren) findDescendants(child, type, results);
  return results;
}

function isIdentifierUse(node) {
  if (!node.parent) return false;
  if (node.parent.type.includes("declarator")) return false;
  if (node.parent.type === "call_expression" && node.parent.namedChild(0) === node) return false;
  if (node.parent.type === "field_expression") return false;
  return true;
}

function isKnownFunctionUse(node, code) {
  const name = nodeText(node, code);
  return node.parent?.type === "call_expression" || ["printf", "scanf", "main", "puts", "gets", "malloc", "free"].includes(name);
}

function inferExpressionType(node, code, findSymbol, messages = []) {
  if (!node) return "unknown";
  if (node.type === "number_literal") return nodeText(node, code).includes(".") ? "double" : "int";
  if (node.type === "string_literal") return "char*";
  if (node.type === "char_literal") return "char";
  if (node.type === "identifier") {
    const symbol = findSymbol(nodeText(node, code));
    if (!symbol) {
      messages.push(message("error", `Undeclared identifier '${nodeText(node, code)}'.`, node));
      return "unknown";
    }
    return symbol.type;
  }
  const childTypes = node.namedChildren.map((child) => inferExpressionType(child, code, findSymbol, messages));
  if (childTypes.includes("double") || childTypes.includes("float")) return "double";
  if (childTypes.includes("char*")) return "char*";
  if (childTypes.includes("int")) return "int";
  return "unknown";
}

function inferExpressionTypeFromText(text, findSymbol) {
  const trimmed = text.trim();
  if (/^".*"$/.test(trimmed)) return "char*";
  if (/^'.*'$/.test(trimmed)) return "char";
  if (/^-?\d+$/.test(trimmed)) return "int";
  if (/^-?\d+\.\d+/.test(trimmed)) return "double";
  const symbol = findSymbol(trimmed);
  return symbol?.type ?? "unknown";
}

function typesCompatible(left, right) {
  if (left === right) return true;
  if (["int", "float", "double", "long", "short", "char"].includes(left) && ["int", "float", "double", "long", "short", "char"].includes(right)) return true;
  if (left.includes("*") && right.includes("*")) return true;
  return false;
}

function operatorFromText(text) {
  return text.match(/==|!=|<=|>=|&&|\|\||[+\-*/%<>]/)?.[0] ?? "?";
}

function dedupeAdjacent(lines) {
  return lines.filter((line, index) => index === 0 || line !== lines[index - 1]);
}
