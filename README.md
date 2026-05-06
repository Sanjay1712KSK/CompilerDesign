# Visualization of Six Phases of Compiler Design 
## C Compiler Visualizer 🚀

A modern, interactive **Compiler Design Visualization Tool** that demonstrates all **6 phases of a compiler** using dynamic analysis of C programs.

Built for Compiler Design laboratory and academic demonstration purposes, this project provides a clean UI and real-time visualization of how a compiler processes C source code internally.

---

# ✨ Features

## ✅ Dynamic Compiler Pipeline

Supports analysis of user-provided C code through all compiler phases:

1. **Lexical Analysis**
2. **Syntax Analysis**
3. **Semantic Analysis**
4. **Intermediate Code Generation (ICG)**
5. **Code Optimization**
6. **Target Code Generation**

---

# 🖥️ Modern Interactive UI

* Monaco Editor (VS Code-like experience)
* Dark themed glassmorphism UI
* Smooth animated transitions
* Phase-wise visualization
* Real-time compilation flow
* Responsive design

---

# ⚙️ Compiler Phases

## 1️⃣ Lexical Analysis

Tokenizes C source code into:

* Keywords
* Identifiers
* Operators
* Literals
* Symbols

### Example

```c
int a = 5;
```

Output:

```text
int     → KEYWORD
a       → IDENTIFIER
=       → OPERATOR
5       → NUMBER
;       → SYMBOL
```

---

## 2️⃣ Syntax Analysis

Generates an Abstract Syntax Tree (AST) using Tree-sitter.

### Example

```text
Program
 └── FunctionDefinition
      └── CompoundStatement
```

---

## 3️⃣ Semantic Analysis

Performs:

* Variable declaration checks
* Type validation
* Duplicate declaration detection
* Basic semantic validation

---

## 4️⃣ Intermediate Code Generation (ICG)

Generates proper **Three Address Code (TAC)** dynamically from AST.

### Example

```text
i = 0

L1:
t1 = i < n
if t1 == 0 goto L2

t2 = arr[i]
param t2
call printf

t3 = i + 1
i = t3

goto L1

L2:
return 0
```

---

## 5️⃣ Code Optimization

Implements:

* Constant Folding
* Dead Code Elimination
* Simplification passes

---

## 6️⃣ Target Code Generation

Generates pseudo assembly instructions.

### Example

```asm
MOV R1, 0
CMP R1, n
JGE L2
LOAD R2, arr[i]
CALL printf
```

---

# 🛠️ Tech Stack

## Frontend

* React
* Vite
* Tailwind CSS
* Framer Motion
* Monaco Editor

## Backend

* Node.js
* Express.js

## Parsing Engine

* Tree-sitter
* tree-sitter-c

---

# 📂 Project Structure

```bash
compiler-visualizer/
│
├── client/
│   ├── src/
│   ├── components/
│   ├── pages/
│   └── styles/
│
├── server/
│   ├── parser/
│   ├── compiler/
│   ├── routes/
│   └── utils/
│
├── README.md
└── package.json
```

---

# 🚀 Installation

## Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/compiler-visualizer.git
cd compiler-visualizer
```

---

# 📦 Install Dependencies

## Frontend

```bash
cd client
npm install
```

## Backend

```bash
cd ../server
npm install
```

---

# ▶️ Run Project

## Start Backend

```bash
cd server
npm run dev
```

## Start Frontend

```bash
cd client
npm run dev
```

---

# 🌐 Open in Browser

```text
http://localhost:5173
```

---

# 📸 Screenshots

## Source Editor

* Monaco-based code editor
* Syntax highlighting
* Live code input

## Compiler Pipeline

* Animated phase navigation
* Interactive outputs

## TAC Generation

* Dynamic control flow generation
* Labels and temporary variables

---

# 🧠 Supported Concepts

## Current Support

* Variables
* Arrays
* Arithmetic expressions
* for loops
* if / else
* switch statements
* Function calls
* Return statements

---

# 📚 Educational Purpose

This project was developed as part of:

* Compiler Design Laboratory
* Academic Demonstration
* Visualization of Compiler Phases

It helps students understand how source code is transformed internally by a compiler.

---

# 🔥 Future Improvements

* LLVM IR generation
* Control Flow Graph (CFG)
* SSA Form generation
* Data Flow Analysis
* Live execution tracing
* Assembly simulation
* Syntax error recovery

---

# 🤝 Contributors

* Sanjay Kumar
* Team Members

---

# 📄 License

This project is developed for educational purposes.

---

# ⭐ If you like this project

Give it a star on GitHub ⭐

