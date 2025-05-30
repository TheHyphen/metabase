import type { Operator } from "semver";
import { t } from "ttag";

import { parseNumber } from "metabase/lib/number";
import type { Expression } from "metabase-types/api";

import { getMBQLName as defaultGetMBQLName } from "../config";
import { CompileError } from "../errors";

import {
  ADD,
  ARG_LIST,
  BOOLEAN,
  CALL,
  COMPARISON,
  EQUALITY,
  FIELD,
  GROUP,
  IDENTIFIER,
  LOGICAL_AND,
  LOGICAL_NOT,
  LOGICAL_OR,
  MULDIV_OP,
  NEGATIVE,
  NUMBER,
  ROOT,
  STRING,
  SUB,
} from "./syntax";
import { type Node, type NodeType, assert } from "./types";

export type CompileOptions = {
  getMBQLName?: (expressionName: string) => string | undefined;
};

type Options = Required<CompileOptions>;
type CompileFn = (node: Node, opts: Options) => Expression;

export function compile(
  node: Node,
  { getMBQLName = defaultGetMBQLName }: CompileOptions = {},
): Expression {
  assert(node.type === ROOT, "Must be root node");
  if (node.children.length > 1) {
    throw new CompileError(t`Unexpected expression`, {
      node: node.children[1],
      token: node.children[1].token,
    });
  }
  const func = compileUnaryOp(node);
  return func(node.children[0], { getMBQLName });
}

// ----------------------------------------------------------------

function compileField(node: Node): Expression {
  assert(node.type === FIELD, "Invalid Node Type");
  assert(node.token?.text, "Empty field name");
  assert(node.token?.value, "Empty field value");
  const name = node.token.value;
  return withNode(["dimension", name], node);
}

function compileIdentifier(node: Node): Expression {
  assert(node.type === IDENTIFIER, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const name = node.token.text;
  return withNode(["dimension", name], node);
}

function compileGroup(node: Node, opts: Options): Expression {
  assert(node.type === GROUP, "Invalid Node Type");
  const func = compileUnaryOp(node);
  return func(node.children[0], opts);
}

function compileString(node: Node): Expression {
  assert(node.type === STRING, "Invalid Node Type");
  assert(typeof node.token?.value === "string", "No token text");
  return node.token.value;
}

// ----------------------------------------------------------------

function compileLogicalNot(node: Node, opts: Options): Expression {
  assert(node.type === LOGICAL_NOT, "Invalid Node Type");
  const func = compileUnaryOp(node);
  assert(node.token?.text, "Empty token text");
  const child = node.children[0];
  return withNode(["not", func(child, opts)], node);
}

function compileLogicalAnd(node: Node, opts: Options): Expression {
  assert(node.type === LOGICAL_AND, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode([node.token?.text.toLowerCase(), ...left, ...right], node);
}

function compileLogicalOr(node: Node, opts: Options): Expression {
  assert(node.type === LOGICAL_OR, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode([node.token?.text.toLowerCase(), ...left, ...right], node);
}

function compileComparisonOp(node: Node, opts: Options): Expression {
  assert(node.type === COMPARISON, "Invalid Node Type");
  const text = node.token?.text;
  assert(text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode([text, ...left, ...right], node);
}

function compileEqualityOp(node: Node, opts: Options): Expression {
  assert(node.type === EQUALITY, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode([node.token?.text, ...left, ...right], node);
}

// ----------------------------------------------------------------

function compileFunctionCall(node: Node, opts: Options): Expression {
  assert(node.type === CALL, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  assert(
    node.children[0].type === ARG_LIST,
    "First argument must be an arglist",
  );
  const text = node.token?.text;
  const fn = opts.getMBQLName(text.trim().toLowerCase());
  return withNode(
    [(fn ? fn : text) as Operator, ...compileArgList(node.children[0], opts)],
    node,
  );
}

function compileArgList(node: Node, opts: Options): Expression[] {
  assert(node.type === ARG_LIST, "Invalid Node Type");
  return node.children.map((child) => {
    const func = getCompileFunction(child);
    if (!func) {
      throw new CompileError(t`Invalid node type`, { node: child });
    }
    const expr = func(child, opts);
    return (expr as any).node ? expr : withNode(expr, child);
  });
}

// ----------------------------------------------------------------

function compileNumber(node: Node): Expression {
  assert(node.type === NUMBER, "Invalid Node Type");
  assert(typeof node.token?.text === "string", "No token text");
  const number = parseNumber(node.token.text);
  if (number != null) {
    return number;
  } else {
    throw new CompileError(t`Invalid number format`, {
      node,
      token: node.token,
    });
  }
}

function compileNegative(node: Node, opts: Options): Expression {
  assert(node.type === NEGATIVE, "Invalid Node Type");
  const func = compileUnaryOp(node);
  assert(node.token?.text, "Empty token text");
  const child = node.children[0];
  if (child.type === NUMBER) {
    return -func(child, opts);
  }
  return withNode(["-", func(child, opts)], node);
}

function compileAdditionOp(node: Node, opts: Options): Expression {
  assert(node.type === ADD, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode([node.token?.text, ...left, ...right], node);
}

function compileMulDivOp(node: Node, opts: Options): Expression {
  assert(node.type === MULDIV_OP, "Invalid Node Type");
  const text = node.token?.text;
  assert(text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode([text, ...left, ...right], node);
}

function compileSubtractionOp(node: Node, opts: Options): Expression {
  assert(node.type === SUB, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const [left, right] = compileInfixOp(node, opts);
  return withNode([node.token?.text, ...left, ...right], node);
}

// ----------------------------------------------------------------

function compileBoolean(node: Node, _opts: Options): Expression {
  assert(node.type === BOOLEAN, "Invalid Node Type");
  assert(node.token?.text, "Empty token text");
  const text = node.token.text.toLowerCase();
  return text === "true" ? true : false;
}

// ----------------------------------------------------------------

function compileUnaryOp(node: Node) {
  if (node.children.length > 1) {
    throw new CompileError(t`Unexpected expression`, {
      node: node.children[1],
      token: node.children[1].token,
    });
  } else if (node.children.length === 0) {
    throw new CompileError(t`Expected expression`, { node, token: node.token });
  }
  const func = getCompileFunction(node.children[0]);
  if (!func) {
    throw new CompileError(t`Invalid node type`, {
      node: node.children[0],
      token: node.children[0].token,
    });
  }
  return func;
}

function compileInfixOp(
  node: Node,
  opts: Options,
): [Expression[], Expression[]] {
  if (node.children.length > 2) {
    throw new CompileError(t`Unexpected expression`, {
      node: node.children[2],
      token: node.children[2].token,
    });
  } else if (node.children.length === 0) {
    throw new CompileError(t`Expected expression`, { node, token: node.token });
  }
  const leftFn = getCompileFunction(node.children[0]);
  if (!leftFn) {
    throw new CompileError(t`Invalid node type`, {
      node: node.children[0],
      token: node.children[0].token,
    });
  }
  const rightFn = getCompileFunction(node.children[1]);
  if (!rightFn) {
    throw new CompileError(t`Invalid node type`, {
      node: node.children[1],
      token: node.children[1].token,
    });
  }

  const text = node.token?.text;
  let left: any = leftFn(node.children[0], opts);
  if (Array.isArray(left) && left[0]?.toUpperCase() === text?.toUpperCase()) {
    const [_first, ...args] = left;
    left = args;
  } else {
    left = [left];
  }

  let right: any = rightFn(node.children[1], opts);
  right = [right];
  return [left, right];
}

function withNode<T>(expr: T, node: Node): T {
  if (typeof expr === "object") {
    Object.defineProperty(expr, "node", {
      writable: false,
      enumerable: false,
      value: node,
    });
  }
  return expr;
}

// ----------------------------------------------------------------

const COMPILE = new Map<NodeType, CompileFn>([
  [FIELD, compileField],
  [ADD, compileAdditionOp],
  [LOGICAL_AND, compileLogicalAnd],
  [CALL, compileFunctionCall],
  [EQUALITY, compileEqualityOp],
  [NUMBER, compileNumber],
  [BOOLEAN, compileBoolean],
  [LOGICAL_NOT, compileLogicalNot],
  [NEGATIVE, compileNegative],
  [LOGICAL_OR, compileLogicalOr],
  [COMPARISON, compileComparisonOp],
  [GROUP, compileGroup],
  [MULDIV_OP, compileMulDivOp],
  [STRING, compileString],
  [SUB, compileSubtractionOp],
  [IDENTIFIER, compileIdentifier],
]);

function getCompileFunction(
  node: Node,
): (node: Node, opts: Options) => Expression {
  const func = COMPILE.get(node.type);
  if (!func) {
    throw new CompileError(t`Invalid node type`, { node, token: node.token });
  }
  return func;
}
