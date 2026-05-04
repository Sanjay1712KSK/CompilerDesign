const binaryOps = new Set(["+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "&&", "||"]);
const commutativeOps = new Set(["+", "*", "==", "!=", "&&", "||"]);

export class Instruction {
  constructor({ op, arg1 = null, arg2 = null, result = null, relop = null, target = null, label = null, raw = "" }) {
    this.op = op;
    this.arg1 = arg1;
    this.arg2 = arg2;
    this.result = result;
    this.relop = relop;
    this.target = target;
    this.label = label;
    this.raw = raw;
  }

  clone() {
    const instruction = new Instruction({ ...this });
    instruction.index = this.index;
    return instruction;
  }

  toString() {
    if (this.op === "label") return `${this.label}:`;
    if (this.op === "goto") return `goto ${this.target}`;
    if (this.op === "if") return `if ${this.arg1} ${this.relop} ${this.arg2} goto ${this.target}`;
    if (this.op === "ifFalse") return `ifFalse ${this.arg1} goto ${this.target}`;
    if (this.op === "binary") return `${this.result} = ${this.arg1} ${this.relop} ${this.arg2}`;
    if (this.op === "assign") return `${this.result} = ${this.arg1}`;
    if (this.op === "declare") return `declare ${this.arg1}`;
    if (this.op === "param") return `param ${this.arg1}`;
    if (this.op === "call") return `${this.result} = call ${this.arg1}${this.arg2 ? `, ${this.arg2}` : ""}`;
    if (this.op === "call_void") return `call ${this.arg1}${this.arg2 ? `, ${this.arg2}` : ""}`;
    if (this.op === "func") return `func ${this.arg1}`;
    if (this.op === "return") return this.arg1 ? `return ${this.arg1}` : "return";
    return this.raw;
  }
}

export class BasicBlock {
  constructor(id) {
    this.id = id;
    this.instructions = [];
    this.successors = [];
    this.predecessors = [];
  }
}

export function optimizeTac(lines) {
  let instructions = parseTac(lines);
  const before = instructions.map((instruction) => instruction.toString());
  const events = [];
  let iteration = 0;
  let changed = true;

  while (changed && iteration < 12) {
    iteration += 1;
    const start = serialize(instructions);
    instructions = constantPropagation(instructions, events);
    instructions = constantFolding(instructions, events);
    instructions = commonSubexpressionElimination(instructions, events);
    instructions = controlFlowSimplification(instructions, events);
    instructions = unreachableCodeElimination(instructions, events);
    instructions = deadCodeElimination(instructions, events);
    instructions = controlFlowSimplification(instructions, events);
    changed = serialize(instructions) !== start;
  }

  instructions = renumberAndClone(instructions);
  const finalCfg = buildCFG(instructions);
  const after = instructions.map((instruction) => instruction.toString());

  return {
    before,
    after,
    changes: alignChanges(before, after),
    events,
    cfg: serializeCFG(finalCfg),
    iterations: iteration
  };
}

export function parseTac(lines) {
  return lines.map((line, index) => {
    const trimmed = line.trim();
    let match = trimmed.match(/^([A-Za-z_]\w*):$/);
    if (match) return withIndex(new Instruction({ op: "label", label: match[1], raw: trimmed }), index);

    match = trimmed.match(/^goto\s+([A-Za-z_]\w*)$/);
    if (match) return withIndex(new Instruction({ op: "goto", target: match[1], raw: trimmed }), index);

    match = trimmed.match(/^if\s+(.+?)\s*(==|!=|<=|>=|<|>|&&|\|\|)\s*(.+?)\s+goto\s+([A-Za-z_]\w*)$/);
    if (match) {
      return withIndex(new Instruction({ op: "if", arg1: match[1].trim(), relop: match[2], arg2: match[3].trim(), target: match[4], raw: trimmed }), index);
    }

    match = trimmed.match(/^ifFalse\s+(.+?)\s+goto\s+([A-Za-z_]\w*)$/);
    if (match) return withIndex(new Instruction({ op: "ifFalse", arg1: match[1].trim(), target: match[2], raw: trimmed }), index);

    match = trimmed.match(/^return(?:\s+(.+))?$/);
    if (match) return withIndex(new Instruction({ op: "return", arg1: match[1]?.trim() ?? null, raw: trimmed }), index);

    match = trimmed.match(/^func\s+([A-Za-z_]\w*)$/);
    if (match) return withIndex(new Instruction({ op: "func", arg1: match[1], raw: trimmed }), index);

    match = trimmed.match(/^declare\s+(.+)$/);
    if (match) return withIndex(new Instruction({ op: "declare", arg1: match[1].trim(), raw: trimmed }), index);

    match = trimmed.match(/^param\s+(.+)$/);
    if (match) return withIndex(new Instruction({ op: "param", arg1: match[1].trim(), raw: trimmed }), index);

    match = trimmed.match(/^([A-Za-z_]\w*)\s*=\s*call\s+([A-Za-z_]\w*)(?:,\s*(.*))?$/);
    if (match) return withIndex(new Instruction({ op: "call", result: match[1], arg1: match[2], arg2: match[3]?.trim() ?? "", raw: trimmed }), index);

    match = trimmed.match(/^call\s+([A-Za-z_]\w*)(?:,\s*(.*))?$/);
    if (match) return withIndex(new Instruction({ op: "call_void", arg1: match[1], arg2: match[2]?.trim() ?? "", raw: trimmed }), index);

    match = trimmed.match(/^([A-Za-z_]\w*)\s*=\s*(.+?)\s*(==|!=|<=|>=|&&|\|\||[+\-*/%<>])\s*(.+)$/);
    if (match && binaryOps.has(match[3])) {
      return withIndex(new Instruction({ op: "binary", result: match[1], arg1: match[2].trim(), relop: match[3], arg2: match[4].trim(), raw: trimmed }), index);
    }

    match = trimmed.match(/^(.+?)\s*=\s*(.+)$/);
    if (match) return withIndex(new Instruction({ op: "assign", result: match[1].trim(), arg1: match[2].trim(), raw: trimmed }), index);

    return withIndex(new Instruction({ op: "raw", raw: trimmed }), index);
  });
}

export function buildCFG(instructions) {
  const leaders = new Set([0]);
  const labelToIndex = new Map();

  instructions.forEach((instruction, index) => {
    if (instruction.op === "label") labelToIndex.set(instruction.label, index);
  });

  instructions.forEach((instruction, index) => {
    if (instruction.op === "label") leaders.add(index);
    if (instruction.op === "func") leaders.add(index);
    if (["goto", "if", "ifFalse"].includes(instruction.op)) {
      const targetIndex = labelToIndex.get(instruction.target);
      if (targetIndex !== undefined) leaders.add(targetIndex);
      if (index + 1 < instructions.length) leaders.add(index + 1);
    }
    if (instruction.op === "return" && index + 1 < instructions.length) leaders.add(index + 1);
  });

  const sortedLeaders = [...leaders].filter((index) => index < instructions.length).sort((a, b) => a - b);
  const blocks = sortedLeaders.map((leader, blockIndex) => {
    const block = new BasicBlock(`B${blockIndex}`);
    const nextLeader = sortedLeaders[blockIndex + 1] ?? instructions.length;
    block.start = leader;
    block.end = nextLeader - 1;
    block.instructions = instructions.slice(leader, nextLeader);
    return block;
  });

  const indexToBlock = new Map();
  const labelToBlock = new Map();
  blocks.forEach((block, blockIndex) => {
    for (let i = block.start; i <= block.end; i += 1) indexToBlock.set(i, blockIndex);
    for (const instruction of block.instructions) {
      if (instruction.op === "label") labelToBlock.set(instruction.label, blockIndex);
    }
  });

  blocks.forEach((block, blockIndex) => {
    const last = lastExecutable(block.instructions);
    const successors = new Set();
    if (last?.op === "goto") {
      addTarget(successors, labelToBlock, last.target);
    } else if (last?.op === "if" || last?.op === "ifFalse") {
      addTarget(successors, labelToBlock, last.target);
      if (blockIndex + 1 < blocks.length) successors.add(blockIndex + 1);
    } else if (last?.op !== "return" && blockIndex + 1 < blocks.length) {
      successors.add(blockIndex + 1);
    }
    block.successors = [...successors].map((index) => blocks[index].id);
  });

  const idToBlock = new Map(blocks.map((block) => [block.id, block]));
  blocks.forEach((block) => {
    for (const successor of block.successors) {
      idToBlock.get(successor)?.predecessors.push(block.id);
    }
  });

  return { blocks, labelToBlock, indexToBlock };
}

function constantPropagation(instructions, events) {
  const cfg = buildCFG(instructions);
  const blockIn = new Map();
  const blockOut = new Map();

  for (const block of cfg.blocks) {
    blockIn.set(block.id, new Map());
    blockOut.set(block.id, new Map());
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const block of cfg.blocks) {
      const incoming = mergeConstantMaps(block.predecessors.map((id) => blockOut.get(id) ?? new Map()));
      if (!constantMapEqual(blockIn.get(block.id), incoming)) {
        blockIn.set(block.id, incoming);
        changed = true;
      }

      const output = transferConstants(block.instructions, incoming);
      if (!constantMapEqual(blockOut.get(block.id), output)) {
        blockOut.set(block.id, output);
        changed = true;
      }
    }
  }

  const next = [];
  for (const block of cfg.blocks) {
    const constants = new Map(blockIn.get(block.id));
    for (const instruction of block.instructions) {
      const rewritten = rewriteConstants(instruction, constants, events);
      next.push(rewritten);
      applyConstantTransfer(rewritten, constants);
    }
  }
  return renumberAndClone(next);
}

function constantFolding(instructions, events) {
  const next = [];
  for (const instruction of instructions) {
    const folded = instruction.clone();
    if (folded.op === "binary" && isConstant(folded.arg1) && isConstant(folded.arg2)) {
      const value = evaluateBinary(folded.arg1, folded.relop, folded.arg2);
      if (value !== null) {
        events.push(event("constant-folding", folded, `${folded.result} = ${formatValue(value)}`, `Folded ${folded.arg1} ${folded.relop} ${folded.arg2}.`));
        folded.op = "assign";
        folded.arg1 = formatValue(value);
        folded.arg2 = null;
        folded.relop = null;
      }
    } else if (folded.op === "if" && isConstant(folded.arg1) && isConstant(folded.arg2)) {
      const value = evaluateBinary(folded.arg1, folded.relop, folded.arg2);
      if (value === true) {
        events.push(event("constant-folding", folded, `goto ${folded.target}`, "Condition is always true."));
        folded.op = "goto";
        folded.arg1 = null;
        folded.arg2 = null;
        folded.relop = null;
      } else if (value === false) {
        events.push(event("constant-folding", folded, "<removed>", "Condition is always false."));
        continue;
      }
    } else if (folded.op === "ifFalse" && isConstant(folded.arg1)) {
      if (truthy(folded.arg1)) {
        events.push(event("constant-folding", folded, "<removed>", "ifFalse condition is always false."));
        continue;
      }
      events.push(event("constant-folding", folded, `goto ${folded.target}`, "ifFalse condition is always true."));
      folded.op = "goto";
      folded.arg1 = null;
    }
    next.push(folded);
  }
  return renumberAndClone(next);
}

function deadCodeElimination(instructions, events) {
  const cfg = buildCFG(instructions);
  const blockUseDef = new Map();
  const liveIn = new Map();
  const liveOut = new Map();

  for (const block of cfg.blocks) {
    const use = new Set();
    const def = new Set();
    for (const instruction of block.instructions) {
      for (const variable of uses(instruction)) {
        if (!def.has(variable)) use.add(variable);
      }
      const defined = defines(instruction);
      if (defined) def.add(defined);
    }
    blockUseDef.set(block.id, { use, def });
    liveIn.set(block.id, new Set());
    liveOut.set(block.id, new Set());
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = cfg.blocks.length - 1; i >= 0; i -= 1) {
      const block = cfg.blocks[i];
      const out = unionSets(block.successors.map((id) => liveIn.get(id) ?? new Set()));
      const { use, def } = blockUseDef.get(block.id);
      const input = union(use, difference(out, def));
      if (!setEqual(liveOut.get(block.id), out)) {
        liveOut.set(block.id, out);
        changed = true;
      }
      if (!setEqual(liveIn.get(block.id), input)) {
        liveIn.set(block.id, input);
        changed = true;
      }
    }
  }

  const kept = [];
  for (const block of cfg.blocks) {
    let live = new Set(liveOut.get(block.id));
    const reversed = [];
    for (let i = block.instructions.length - 1; i >= 0; i -= 1) {
      const instruction = block.instructions[i];
      const defined = defines(instruction);
      const removable = defined && !hasSideEffects(instruction) && isPureAssignment(instruction) && !live.has(defined);
      if (removable) {
        events.push(event("dead-code-elimination", instruction, "<removed>", `${defined} is not live after this assignment.`));
        continue;
      }
      if (defined) live.delete(defined);
      for (const variable of uses(instruction)) live.add(variable);
      reversed.push(instruction);
    }
    kept.push(...reversed.reverse());
  }

  return renumberAndClone(kept);
}

function unreachableCodeElimination(instructions, events) {
  const cfg = buildCFG(instructions);
  if (!cfg.blocks.length) return instructions;
  const reachable = new Set();
  const stack = cfg.blocks
    .filter((block, index) => index === 0 || block.instructions[0]?.op === "func")
    .map((block) => block.id);

  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    const block = cfg.blocks.find((candidate) => candidate.id === id);
    for (const successor of block?.successors ?? []) stack.push(successor);
  }

  const next = [];
  for (const block of cfg.blocks) {
    if (reachable.has(block.id)) {
      next.push(...block.instructions);
    } else {
      for (const instruction of block.instructions) {
        events.push(event("unreachable-code-elimination", instruction, "<removed>", `${block.id} is unreachable from entry.`));
      }
    }
  }
  return renumberAndClone(next);
}

function controlFlowSimplification(instructions, events) {
  let next = [...instructions];

  next = next.filter((instruction, index) => {
    if (instruction.op !== "goto") return true;
    const targetIndex = next.findIndex((candidate) => candidate.op === "label" && candidate.label === instruction.target);
    const nextExecutableIndex = next.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.op !== "label");
    const labelsBetween = next.slice(index + 1, nextExecutableIndex < 0 ? next.length : nextExecutableIndex);
    if (targetIndex > index && labelsBetween.some((candidate) => candidate.op === "label" && candidate.label === instruction.target)) {
      events.push(event("control-flow-simplification", instruction, "<removed>", "Removed goto to the immediately following label."));
      return false;
    }
    return true;
  });

  const targetedLabels = new Set();
  for (const instruction of next) {
    if (["goto", "if", "ifFalse"].includes(instruction.op)) targetedLabels.add(instruction.target);
  }

  next = next.filter((instruction, index) => {
    if (instruction.op !== "label") return true;
    if (index === 0) return true;
    if (targetedLabels.has(instruction.label)) return true;
    if (next[index - 1]?.op === "func") return true;
    events.push(event("control-flow-simplification", instruction, "<removed>", "Removed empty unreferenced label."));
    return false;
  });

  return renumberAndClone(next);
}

function commonSubexpressionElimination(instructions, events) {
  const cfg = buildCFG(instructions);
  const result = [];
  for (const block of cfg.blocks) {
    const available = new Map();
    for (const instruction of block.instructions) {
      const rewritten = instruction.clone();
      if (hasSideEffects(rewritten)) {
        available.clear();
      }
      const defined = defines(rewritten);
      if (defined) {
        for (const [key, value] of [...available.entries()]) {
          if (value === defined || key.split("|").includes(defined)) available.delete(key);
        }
      }
      if (rewritten.op === "binary" && isPureBinary(rewritten)) {
        const key = expressionKey(rewritten);
        if (available.has(key)) {
          const replacement = available.get(key);
          events.push(event("common-subexpression-elimination", rewritten, `${rewritten.result} = ${replacement}`, `Reused ${replacement} for ${rewritten.arg1} ${rewritten.relop} ${rewritten.arg2}.`));
          rewritten.op = "assign";
          rewritten.arg1 = replacement;
          rewritten.arg2 = null;
          rewritten.relop = null;
        } else {
          available.set(key, rewritten.result);
        }
      }
      result.push(rewritten);
    }
  }
  return renumberAndClone(result);
}

function rewriteConstants(instruction, constants, events) {
  const next = instruction.clone();
  for (const field of ["arg1", "arg2"]) {
    const value = next[field];
    if (isVariable(value) && constants.has(value)) {
      const constant = constants.get(value);
      if (constant.kind === "const") {
        next[field] = constant.value;
        events.push(event("constant-propagation", instruction, next.toString(), `Replaced ${value} with ${constant.value}.`));
      }
    }
  }
  return next;
}

function transferConstants(instructions, incoming) {
  const constants = new Map(incoming);
  for (const instruction of instructions) applyConstantTransfer(instruction, constants);
  return constants;
}

function applyConstantTransfer(instruction, constants) {
  const defined = defines(instruction);
  if (hasSideEffects(instruction)) {
    for (const [name, value] of [...constants.entries()]) {
      if (value.kind !== "const" || isTemp(name)) continue;
      constants.set(name, { kind: "nac" });
    }
  }
  if (!defined) return;
  if (instruction.op === "assign" && isConstant(instruction.arg1)) {
    constants.set(defined, { kind: "const", value: instruction.arg1 });
  } else {
    constants.set(defined, { kind: "nac" });
  }
}

function mergeConstantMaps(maps) {
  if (!maps.length) return new Map();
  const keys = new Set(maps.flatMap((map) => [...map.keys()]));
  const result = new Map();
  for (const key of keys) {
    const values = maps.map((map) => map.get(key) ?? { kind: "undef" });
    const firstConst = values.find((value) => value.kind === "const");
    if (values.some((value) => value.kind === "nac")) {
      result.set(key, { kind: "nac" });
    } else if (firstConst && values.every((value) => value.kind === "const" && value.value === firstConst.value)) {
      result.set(key, firstConst);
    } else if (values.every((value) => value.kind === "undef")) {
      result.set(key, { kind: "undef" });
    } else {
      result.set(key, { kind: "nac" });
    }
  }
  return result;
}

function uses(instruction) {
  const used = [];
  if (["assign", "ifFalse", "return", "param"].includes(instruction.op)) used.push(...variablesIn(instruction.arg1));
  if (["binary", "if"].includes(instruction.op)) {
    used.push(...variablesIn(instruction.arg1));
    used.push(...variablesIn(instruction.arg2));
  }
  if (["call", "call_void"].includes(instruction.op)) used.push(...variablesIn(instruction.arg2));
  return [...new Set(used)];
}

function defines(instruction) {
  return ["assign", "binary", "call"].includes(instruction.op) ? instruction.result : null;
}

function isPureAssignment(instruction) {
  return instruction.op === "assign" || instruction.op === "binary";
}

function hasSideEffects(instruction) {
  if (["call", "call_void", "param", "declare", "func"].includes(instruction.op)) return true;
  if (instruction.op === "raw") return true;
  if (["assign", "binary"].includes(instruction.op) && !isVariable(instruction.result)) return true;
  return false;
}

function isPureBinary(instruction) {
  return instruction.op === "binary" && !variablesIn(instruction.arg1).some(isMemoryLike) && !variablesIn(instruction.arg2).some(isMemoryLike);
}

function variablesIn(value) {
  if (!value) return [];
  return [...stripLiterals(String(value)).matchAll(/\b[A-Za-z_]\w*\b/g)]
    .map((match) => match[0])
    .filter((name) => !["call", "return", "goto", "if", "ifFalse"].includes(name) && !isConstant(name));
}

function stripLiterals(value) {
  return value
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ");
}

function isVariable(value) {
  return typeof value === "string" && /^[A-Za-z_]\w*$/.test(value) && !isConstant(value);
}

function isTemp(value) {
  return /^t\d+$/.test(String(value));
}

function isConstant(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) || /^".*"$/.test(text) || /^'.*'$/.test(text);
}

function isMemoryLike(name) {
  return name.includes("[") || name.includes("*");
}

function evaluateBinary(leftRaw, op, rightRaw) {
  const left = numericValue(leftRaw);
  const right = numericValue(rightRaw);
  if (left === null || right === null) return null;
  if (op === "/" && right === 0) return null;
  if (op === "%" && right === 0) return null;
  if (op === "+") return left + right;
  if (op === "-") return left - right;
  if (op === "*") return left * right;
  if (op === "/") return left / right;
  if (op === "%") return left % right;
  if (op === "==") return left === right;
  if (op === "!=") return left !== right;
  if (op === "<") return left < right;
  if (op === "<=") return left <= right;
  if (op === ">") return left > right;
  if (op === ">=") return left >= right;
  if (op === "&&") return Boolean(left) && Boolean(right);
  if (op === "||") return Boolean(left) || Boolean(right);
  return null;
}

function numericValue(value) {
  if (!isConstant(value)) return null;
  const text = String(value).trim();
  if (/^['"]/.test(text)) return null;
  return Number(text);
}

function truthy(value) {
  const numeric = numericValue(value);
  return numeric !== null ? numeric !== 0 : Boolean(value);
}

function formatValue(value) {
  if (typeof value === "boolean") return value ? "1" : "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function expressionKey(instruction) {
  const operands = [instruction.arg1, instruction.arg2];
  if (commutativeOps.has(instruction.relop)) operands.sort();
  return `${operands[0]}|${instruction.relop}|${operands[1]}`;
}

function lastExecutable(instructions) {
  for (let i = instructions.length - 1; i >= 0; i -= 1) {
    if (instructions[i].op !== "label") return instructions[i];
  }
  return instructions[instructions.length - 1] ?? null;
}

function addTarget(successors, labelToBlock, target) {
  const blockIndex = labelToBlock.get(target);
  if (blockIndex !== undefined) successors.add(blockIndex);
}

function serialize(instructions) {
  return instructions.map((instruction) => instruction.toString()).join("\n");
}

function renumberAndClone(instructions) {
  return instructions.map((instruction, index) => withIndex(instruction.clone(), index));
}

function withIndex(instruction, index) {
  instruction.index = index;
  return instruction;
}

function event(pass, beforeInstruction, after, detail) {
  return {
    pass,
    before: beforeInstruction.toString(),
    after,
    detail,
    line: beforeInstruction.index + 1
  };
}

function alignChanges(before, after) {
  const afterSet = new Set(after);
  return before.map((line, index) => ({
    before: line,
    after: after[index] ?? "",
    changed: line !== (after[index] ?? "") || !afterSet.has(line)
  }));
}

function serializeCFG(cfg) {
  return cfg.blocks.map((block) => ({
    id: block.id,
    successors: block.successors,
    predecessors: block.predecessors,
    instructions: block.instructions.map((instruction) => instruction.toString())
  }));
}

function constantMapEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (!other || other.kind !== value.kind || other.value !== value.value) return false;
  }
  return true;
}

function unionSets(sets) {
  return sets.reduce((acc, set) => union(acc, set), new Set());
}

function union(left, right) {
  return new Set([...left, ...right]);
}

function difference(left, right) {
  return new Set([...left].filter((item) => !right.has(item)));
}

function setEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}
