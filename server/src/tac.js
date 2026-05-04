const BASIC_TYPE_SIZES = {
  char: 1,
  short: 2,
  int: 4,
  long: 8,
  float: 4,
  double: 8,
  bool: 1,
  _Bool: 1,
  void: 0
};

export class TacEmitter {
  constructor() {
    this.instructions = [];
    this.tempCounter = 0;
    this.labelCounter = 0;
  }

  nextTemp() {
    this.tempCounter += 1;
    return `t${this.tempCounter}`;
  }

  nextLabel(prefix = "L") {
    this.labelCounter += 1;
    return `${prefix}${this.labelCounter}`;
  }

  emit(line) {
    if (line) this.instructions.push(line);
    return line;
  }

  emitLabel(label) {
    return this.emit(`${label}:`);
  }

  toJSON() {
    return { tac: [...this.instructions] };
  }
}

export class SymbolTable {
  constructor() {
    this.scopes = [new Map()];
    this.allSymbols = [];
  }

  enterScope() {
    this.scopes.push(new Map());
  }

  exitScope() {
    if (this.scopes.length > 1) this.scopes.pop();
  }

  declare(symbol) {
    const scope = this.currentScope();
    scope.set(symbol.name, symbol);
    this.allSymbols.push(symbol);
    return symbol;
  }

  lookup(name) {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const symbol = this.scopes[index].get(name);
      if (symbol) return symbol;
    }
    return null;
  }

  currentScope() {
    return this.scopes[this.scopes.length - 1];
  }
}

export class AstTacGenerator {
  constructor(code, helpers = {}) {
    this.code = code;
    this.emitter = new TacEmitter();
    this.symbols = new SymbolTable();
    this.extractDeclarationType = helpers.extractDeclarationType;
    this.findIdentifier = helpers.findIdentifier;
    this.childByType = helpers.childByType;
  }

  generate(root) {
    this.visit(root);
    return {
      tac: this.emitter.instructions.length ? [...this.emitter.instructions] : ["// No TAC generated for the analyzed subset."],
      symbols: this.symbols.allSymbols
    };
  }

  visit(node) {
    if (!node) return;

    switch (node.type) {
      case "translation_unit":
        for (const child of node.namedChildren) this.visit(child);
        return;
      case "function_definition":
        this.emitFunction(node);
        return;
      case "compound_statement":
        this.symbols.enterScope();
        for (const child of node.namedChildren) this.visit(child);
        this.symbols.exitScope();
        return;
      case "declaration":
        this.emitDeclaration(node);
        return;
      case "expression_statement":
        if (node.namedChild(0)?.type === "call_expression") {
          this.emitCall(node.namedChild(0), { discardResult: true });
        } else {
          this.emitExpression(node.namedChild(0));
        }
        return;
      case "if_statement":
        this.emitIf(node);
        return;
      case "for_statement":
        this.emitFor(node);
        return;
      case "return_statement":
        this.emitReturn(node);
        return;
      default:
        for (const child of node.namedChildren) this.visit(child);
    }
  }

  emitFunction(node) {
    const declarator = node.childForFieldName?.("declarator");
    const body = node.childForFieldName?.("body");
    const nameNode = this.findIdentifier(declarator);
    const name = this.text(nameNode);

    this.emitter.emit(`func ${name}`);
    this.symbols.enterScope();
    this.registerParameters(declarator);
    this.visit(body);
    this.symbols.exitScope();
  }

  registerParameters(node) {
    const parameterList = this.childByType(node, "parameter_list");
    for (const parameter of parameterList?.namedChildren ?? []) {
      if (parameter.type !== "parameter_declaration") continue;
      const type = this.extractDeclarationType(parameter, this.code);
      const declarator = parameter.childForFieldName?.("declarator") ?? parameter.namedChildren.find((child) => child.type !== "primitive_type");
      const nameNode = this.findIdentifier(declarator);
      if (!nameNode) continue;
      const symbol = this.createSymbol(nameNode, type, declarator);
      this.symbols.declare(symbol);
      this.emitter.emit(`declare param ${type} ${symbol.name}`);
    }
  }

  emitDeclaration(node) {
    const type = this.extractDeclarationType(node, this.code);
    const declarators = node.namedChildren.filter((child) => child.type !== "primitive_type" && child.type !== "type_identifier");

    for (const declarator of declarators) {
      const target = declarator.type === "init_declarator" ? declarator.childForFieldName?.("declarator") : declarator;
      const initializer = declarator.type === "init_declarator" ? declarator.childForFieldName?.("value") : null;
      const nameNode = this.findIdentifier(target);
      if (!nameNode) continue;

      const symbol = this.createSymbol(nameNode, type, target);
      this.symbols.declare(symbol);
      this.emitter.emit(this.formatDeclaration(symbol));

      if (!initializer) continue;

      if (initializer.type === "initializer_list") {
        this.emitArrayInitialization(symbol, initializer);
      } else {
        const value = this.emitExpression(initializer);
        this.emitter.emit(`${symbol.name} = ${value.place}`);
      }
    }
  }

  emitArrayInitialization(symbol, initializer) {
    for (let index = 0; index < initializer.namedChildren.length; index += 1) {
      const value = this.emitExpression(initializer.namedChildren[index]);
      this.emitter.emit(`${symbol.name}[${index}] = ${value.place}`);
    }
  }

  emitIf(node) {
    const conditionNode = this.unwrapCondition(node.childForFieldName?.("condition"));
    const consequence = node.childForFieldName?.("consequence");
    const alternative = node.childForFieldName?.("alternative");
    const elseLabel = this.emitter.nextLabel("L");
    const endLabel = this.emitter.nextLabel("L");
    const condition = this.emitExpression(conditionNode);

    if (condition.constant !== null) {
      if (this.isTruthy(condition.constant)) {
        this.visit(consequence);
      } else if (alternative) {
        this.visit(this.unwrapElse(alternative));
      }
      return;
    }

    this.emitter.emit(`ifFalse ${condition.place} goto ${elseLabel}`);
    this.visit(consequence);
    this.emitter.emit(`goto ${endLabel}`);
    this.emitter.emitLabel(elseLabel);
    if (alternative) this.visit(this.unwrapElse(alternative));
    this.emitter.emitLabel(endLabel);
  }

  emitFor(node) {
    const initializer = node.childForFieldName?.("initializer");
    const conditionNode = this.unwrapCondition(node.childForFieldName?.("condition"));
    const update = node.childForFieldName?.("update");
    const body = node.childForFieldName?.("body");
    const startLabel = this.emitter.nextLabel("L");
    const bodyLabel = this.emitter.nextLabel("L");
    const endLabel = this.emitter.nextLabel("L");

    this.symbols.enterScope();
    if (initializer) {
      if (initializer.type === "declaration") this.emitDeclaration(initializer);
      else this.emitExpression(initializer);
    }

    this.emitter.emitLabel(startLabel);
    if (conditionNode) {
      const condition = this.emitExpression(conditionNode);
      if (condition.constant !== null) {
        if (!this.isTruthy(condition.constant)) {
          this.emitter.emit(`goto ${endLabel}`);
        } else {
          this.emitter.emit(`goto ${bodyLabel}`);
        }
      } else {
        this.emitter.emit(`ifFalse ${condition.place} goto ${endLabel}`);
      }
    }
    this.emitter.emitLabel(bodyLabel);
    this.visit(body);
    if (update) this.emitExpression(update);
    this.emitter.emit(`goto ${startLabel}`);
    this.emitter.emitLabel(endLabel);
    this.symbols.exitScope();
  }

  emitReturn(node) {
    const expression = node.namedChild(0);
    if (!expression) {
      this.emitter.emit("return");
      return;
    }

    const value = this.emitExpression(expression);
    this.emitter.emit(`return ${value.place}`);
  }

  emitExpression(node) {
    if (!node) return this.valueResult("0", 0, "int");

    switch (node.type) {
      case "number_literal":
        return this.literalResult(this.text(node));
      case "char_literal":
      case "string_literal":
        return this.valueResult(this.text(node), null, node.type === "string_literal" ? "char*" : "char");
      case "identifier":
        return this.identifierResult(node);
      case "parenthesized_expression":
        return this.emitExpression(node.namedChild(0));
      case "binary_expression":
        return this.emitBinary(node);
      case "assignment_expression":
        return this.emitAssignment(node);
      case "call_expression":
        return this.emitCall(node);
      case "subscript_expression":
        return this.emitArrayAccess(node);
      case "initializer_list":
        return this.valueResult(this.text(node), null, "aggregate");
      case "sizeof_expression":
        return this.emitSizeof(node);
      case "update_expression":
        return this.emitUpdate(node);
      case "unary_expression":
        return this.emitUnary(node);
      default:
        if (node.namedChildCount === 1) return this.emitExpression(node.namedChild(0));
        return this.valueResult(this.text(node), null, "unknown");
    }
  }

  emitBinary(node) {
    const leftNode = node.childForFieldName?.("left") ?? node.namedChild(0);
    const rightNode = node.childForFieldName?.("right") ?? node.namedChild(1);
    const left = this.emitExpression(leftNode);
    const right = this.emitExpression(rightNode);
    const op = this.extractOperator(node);
    const folded = this.foldBinary(left.constant, op, right.constant);

    if (folded !== null) {
      return this.valueResult(String(folded), folded, this.resolveNumericType(left.type, right.type));
    }

    const temp = this.emitter.nextTemp();
    this.emitter.emit(`${temp} = ${left.place} ${op} ${right.place}`);
    return this.valueResult(temp, null, this.resolveBinaryType(op, left.type, right.type));
  }

  emitUnary(node) {
    const operandNode = node.namedChild(0);
    const operand = this.emitExpression(operandNode);
    const operator = this.text(node).slice(0, this.text(operandNode).length ? this.text(node).indexOf(this.text(operandNode)) : 1).trim() || this.text(node).replace(this.text(operandNode), "").trim();
    const folded = this.foldUnary(operator, operand.constant);

    if (folded !== null) {
      return this.valueResult(String(folded), folded, operand.type);
    }

    const temp = this.emitter.nextTemp();
    this.emitter.emit(`${temp} = ${operator}${operand.place}`);
    return this.valueResult(temp, null, operand.type);
  }

  emitUpdate(node) {
    const targetNode = node.namedChild(0);
    const target = this.emitExpression(targetNode);
    const operator = this.text(node).startsWith("++") || this.text(node).endsWith("++") ? "+" : "-";
    const step = this.valueResult("1", 1, "int");
    const folded = this.foldBinary(target.constant, operator, step.constant);
    const nextValue = folded !== null ? this.valueResult(String(folded), folded, target.type) : this.emitSyntheticBinary(target.place, operator, step.place, target.type);

    this.assignTarget(targetNode, nextValue.place);
    return nextValue;
  }

  emitSyntheticBinary(left, op, right, type) {
    const temp = this.emitter.nextTemp();
    this.emitter.emit(`${temp} = ${left} ${op} ${right}`);
    return this.valueResult(temp, null, type);
  }

  emitAssignment(node) {
    const leftNode = node.childForFieldName?.("left") ?? node.namedChild(0);
    const rightNode = node.childForFieldName?.("right") ?? node.namedChild(1);
    const value = this.emitExpression(rightNode);

    this.assignTarget(leftNode, value.place);
    return this.emitExpression(leftNode);
  }

  assignTarget(targetNode, sourcePlace) {
    if (targetNode.type === "identifier") {
      this.emitter.emit(`${this.text(targetNode)} = ${sourcePlace}`);
      return;
    }

    if (targetNode.type === "subscript_expression") {
      const arrayName = this.text(targetNode.childForFieldName?.("argument"));
      const index = this.emitExpression(targetNode.childForFieldName?.("index"));
      this.emitter.emit(`${arrayName}[${index.place}] = ${sourcePlace}`);
      return;
    }

    this.emitter.emit(`${this.text(targetNode)} = ${sourcePlace}`);
  }

  emitArrayAccess(node) {
    const baseNode = node.childForFieldName?.("argument");
    const indexNode = node.childForFieldName?.("index");
    const base = this.emitExpression(baseNode);
    const index = this.emitExpression(indexNode);
    const temp = this.emitter.nextTemp();

    this.emitter.emit(`${temp} = ${base.place}[${index.place}]`);
    return this.valueResult(temp, null, this.lookupArrayElementType(base.place));
  }

  emitCall(node, options = {}) {
    const fnNode = node.childForFieldName?.("function") ?? node.namedChild(0);
    const argsNode = this.childByType(node, "argument_list");
    const args = argsNode?.namedChildren.map((child) => this.emitExpression(child)) ?? [];
    const fnName = this.text(fnNode);

    for (const arg of args) this.emitter.emit(`param ${arg.place}`);

    if (options.discardResult) {
      this.emitter.emit(`call ${fnName}, ${args.length}`);
      return this.valueResult("", null, "void");
    }

    const temp = this.emitter.nextTemp();
    this.emitter.emit(`${temp} = call ${fnName}, ${args.length}`);
    return this.valueResult(temp, null, "unknown");
  }

  emitSizeof(node) {
    const valueNode = node.childForFieldName?.("value") ?? node.namedChild(0);
    const unwrapped = valueNode?.type === "parenthesized_expression" ? valueNode.namedChild(0) : valueNode;

    if (unwrapped?.type === "identifier") {
      const symbol = this.symbols.lookup(this.text(unwrapped));
      if (symbol?.arraySize !== null && symbol?.arraySize !== undefined) {
        const size = symbol.arraySize * symbol.elementSize;
        return this.valueResult(String(size), size, "int");
      }
      if (symbol) {
        return this.valueResult(String(symbol.elementSize), symbol.elementSize, "int");
      }
    }

    if (unwrapped?.type === "primitive_type") {
      const type = this.text(unwrapped);
      const size = BASIC_TYPE_SIZES[type] ?? 4;
      return this.valueResult(String(size), size, "int");
    }

    return this.valueResult(this.text(node), null, "int");
  }

  unwrapCondition(node) {
    if (!node) return null;
    return node.type === "parenthesized_expression" ? node.namedChild(0) : node;
  }

  unwrapElse(node) {
    return node.type === "else_clause" ? node.namedChild(0) : node;
  }

  identifierResult(node) {
    const name = this.text(node);
    const symbol = this.symbols.lookup(name);
    return this.valueResult(name, null, symbol?.type ?? "unknown");
  }

  literalResult(text) {
    const numeric = Number(text);
    if (Number.isNaN(numeric)) return this.valueResult(text, null, "unknown");
    return this.valueResult(text, numeric, text.includes(".") ? "double" : "int");
  }

  valueResult(place, constant = null, type = "unknown") {
    return { place, constant, type };
  }

  createSymbol(nameNode, type, declarator) {
    const arrayMeta = this.extractArrayMetadata(declarator, type);
    return {
      name: this.text(nameNode),
      type,
      arraySize: arrayMeta.arraySize,
      elementType: arrayMeta.elementType,
      elementSize: arrayMeta.elementSize,
      line: nameNode.startPosition.row + 1,
      column: nameNode.startPosition.column + 1
    };
  }

  extractArrayMetadata(declarator, type) {
    if (declarator.type !== "array_declarator") {
      return {
        arraySize: null,
        elementType: type,
        elementSize: this.resolveTypeSize(type)
      };
    }

    const sizeNode = declarator.childForFieldName?.("size");
    const sizeValue = sizeNode ? this.emitExpression(sizeNode) : this.valueResult("0", 0, "int");
    const arraySize = typeof sizeValue.constant === "number" ? sizeValue.constant : Number(sizeValue.place);
    return {
      arraySize: Number.isFinite(arraySize) ? arraySize : null,
      elementType: type,
      elementSize: this.resolveTypeSize(type)
    };
  }

  lookupArrayElementType(name) {
    const symbol = this.symbols.lookup(name);
    return symbol?.elementType ?? symbol?.type ?? "unknown";
  }

  formatDeclaration(symbol) {
    if (symbol.arraySize !== null && symbol.arraySize !== undefined) {
      return `declare ${symbol.type} ${symbol.name}[${symbol.arraySize}]`;
    }
    return `declare ${symbol.type} ${symbol.name}`;
  }

  resolveTypeSize(type) {
    const normalized = String(type).trim().split(/\s+/).pop();
    return BASIC_TYPE_SIZES[normalized] ?? 4;
  }

  resolveBinaryType(op, leftType, rightType) {
    if (["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(op)) return "int";
    return this.resolveNumericType(leftType, rightType);
  }

  resolveNumericType(leftType, rightType) {
    if ([leftType, rightType].includes("double")) return "double";
    if ([leftType, rightType].includes("float")) return "float";
    return leftType !== "unknown" ? leftType : rightType;
  }

  foldBinary(left, op, right) {
    if (typeof left !== "number" || typeof right !== "number") return null;
    if (op === "+" ) return left + right;
    if (op === "-") return left - right;
    if (op === "*") return left * right;
    if (op === "/" && right !== 0) return left / right;
    if (op === "%" && right !== 0) return left % right;
    if (op === "==") return left === right ? 1 : 0;
    if (op === "!=") return left !== right ? 1 : 0;
    if (op === "<") return left < right ? 1 : 0;
    if (op === "<=") return left <= right ? 1 : 0;
    if (op === ">") return left > right ? 1 : 0;
    if (op === ">=") return left >= right ? 1 : 0;
    if (op === "&&") return left && right ? 1 : 0;
    if (op === "||") return left || right ? 1 : 0;
    return null;
  }

  foldUnary(op, value) {
    if (typeof value !== "number") return null;
    if (op === "-") return -value;
    if (op === "+") return value;
    if (op === "!") return value ? 0 : 1;
    return null;
  }

  extractOperator(node) {
    const left = this.text(node.childForFieldName?.("left") ?? node.namedChild(0));
    const right = this.text(node.childForFieldName?.("right") ?? node.namedChild(1));
    const full = this.text(node);
    return full.slice(left.length, full.length - right.length).trim();
  }

  isTruthy(value) {
    return value !== 0;
  }

  text(node) {
    if (!node) return "";
    return this.code.slice(node.startIndex, node.endIndex);
  }
}

export function generateTacFromAst(root, code, helpers) {
  const generator = new AstTacGenerator(code, helpers);
  return generator.generate(root);
}
