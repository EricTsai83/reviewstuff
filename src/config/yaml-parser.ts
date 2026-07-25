import * as Data from "effect/Data";
import {
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  parseDocument,
} from "yaml";

export type YamlConfigParseFailure =
  | "alias"
  | "anchor"
  | "custom-tag"
  | "duplicate-key"
  | "merge-key"
  | "multiple-documents"
  | "non-string-key"
  | "syntax"
  | "unsupported-version"
  | "unsupported-value"
  | "warning";

export class YamlConfigParseError extends Data.TaggedError(
  "YamlConfigParseError",
)<{
  readonly failure: YamlConfigParseFailure;
  readonly line: number;
  readonly column: number;
  readonly cause: unknown;
}> {}

const locationAt = (
  lineCounter: LineCounter,
  offset: number | undefined,
): Pick<YamlConfigParseError, "line" | "column"> => {
  const location = lineCounter.linePos(offset ?? 0);

  return {
    line: Math.max(1, location.line),
    column: Math.max(1, location.col),
  };
};

const failAt = (
  failure: YamlConfigParseFailure,
  node: Node | null,
  lineCounter: LineCounter,
): never => {
  throw new YamlConfigParseError({
    failure,
    ...locationAt(lineCounter, node?.range?.[0]),
    cause: undefined,
  });
};

const findAlias = (node: Node | null): Node | undefined => {
  if (node === null) {
    return undefined;
  }
  if (isAlias(node)) {
    return node;
  }
  if (isMap(node)) {
    for (const pair of node.items) {
      const keyAlias = isNode(pair.key) ? findAlias(pair.key) : undefined;
      if (keyAlias !== undefined) {
        return keyAlias;
      }
      const valueAlias = isNode(pair.value) ? findAlias(pair.value) : undefined;
      if (valueAlias !== undefined) {
        return valueAlias;
      }
    }
  }
  if (isSeq(node)) {
    for (const item of node.items) {
      if (isPair(item)) {
        const keyAlias = isNode(item.key) ? findAlias(item.key) : undefined;
        if (keyAlias !== undefined) {
          return keyAlias;
        }
        const valueAlias = isNode(item.value)
          ? findAlias(item.value)
          : undefined;
        if (valueAlias !== undefined) {
          return valueAlias;
        }
      } else {
        const alias = isNode(item) ? findAlias(item) : undefined;
        if (alias !== undefined) {
          return alias;
        }
      }
    }
  }

  return undefined;
};

const findAnchor = (node: Node | null): Node | undefined => {
  if (node === null || isAlias(node)) {
    return undefined;
  }
  if (node.anchor !== undefined) {
    return node;
  }
  if (isMap(node)) {
    for (const pair of node.items) {
      const keyAnchor = isNode(pair.key) ? findAnchor(pair.key) : undefined;
      if (keyAnchor !== undefined) {
        return keyAnchor;
      }
      const valueAnchor = isNode(pair.value)
        ? findAnchor(pair.value)
        : undefined;
      if (valueAnchor !== undefined) {
        return valueAnchor;
      }
    }
  }
  if (isSeq(node)) {
    for (const item of node.items) {
      if (isPair(item)) {
        const keyAnchor = isNode(item.key) ? findAnchor(item.key) : undefined;
        if (keyAnchor !== undefined) {
          return keyAnchor;
        }
        const valueAnchor = isNode(item.value)
          ? findAnchor(item.value)
          : undefined;
        if (valueAnchor !== undefined) {
          return valueAnchor;
        }
      } else {
        const anchor = isNode(item) ? findAnchor(item) : undefined;
        if (anchor !== undefined) {
          return anchor;
        }
      }
    }
  }

  return undefined;
};

const scalarValue = (
  node: Node,
  lineCounter: LineCounter,
): string | number | boolean | null => {
  if (!isScalar(node)) {
    return failAt("unsupported-value", node, lineCounter);
  }

  const value: unknown = node.value;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return failAt("unsupported-value", node, lineCounter);
};

const toJsonCompatibleValue = (
  node: Node,
  lineCounter: LineCounter,
): unknown => {
  if (isScalar(node)) {
    return scalarValue(node, lineCounter);
  }
  if (isMap(node)) {
    const output: Record<string, unknown> = Object.create(null);

    for (const pair of node.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
        return failAt(
          "non-string-key",
          isNode(pair.key) ? pair.key : node,
          lineCounter,
        );
      }
      const key = pair.key.value;
      if (key === "<<") {
        return failAt("merge-key", pair.key, lineCounter);
      }
      const value = pair.value === null
        ? null
        : isNode(pair.value)
        ? toJsonCompatibleValue(pair.value, lineCounter)
        : failAt("unsupported-value", pair.key, lineCounter);
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }

    return output;
  }
  if (isSeq(node)) {
    return node.items.map((item) => {
      if (isPair(item)) {
        return failAt(
          "unsupported-value",
          isNode(item.key) ? item.key : null,
          lineCounter,
        );
      }
      return isNode(item)
        ? toJsonCompatibleValue(item, lineCounter)
        : failAt("unsupported-value", node, lineCounter);
    });
  }

  return failAt("alias", node, lineCounter);
};

const parserFailure = (code: string): YamlConfigParseFailure => {
  switch (code) {
    case "DUPLICATE_KEY":
      return "duplicate-key";
    case "MULTIPLE_DOCS":
      return "multiple-documents";
    case "NON_STRING_KEY":
      return "non-string-key";
    case "TAG_RESOLVE_FAILED":
      return "custom-tag";
    default:
      return "syntax";
  }
};

export const parseYamlConfig = (contents: string): unknown => {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, {
    customTags: [],
    lineCounter,
    logLevel: "error",
    prettyErrors: false,
    resolveKnownTags: false,
    schema: "core",
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  });
  const parserIssue = document.errors[0] ?? document.warnings[0];

  if (parserIssue !== undefined) {
    throw new YamlConfigParseError({
      failure: document.errors.length > 0
        ? parserFailure(parserIssue.code)
        : parserIssue.code === "TAG_RESOLVE_FAILED"
        ? "custom-tag"
        : "warning",
      ...locationAt(lineCounter, parserIssue.pos[0]),
      cause: parserIssue,
    });
  }
  if (document.directives?.yaml.version !== "1.2") {
    throw new YamlConfigParseError({
      failure: "unsupported-version",
      line: 1,
      column: 1,
      cause: undefined,
    });
  }

  const alias = findAlias(document.contents);
  if (alias !== undefined) {
    return failAt("alias", alias, lineCounter);
  }
  const anchor = findAnchor(document.contents);
  if (anchor !== undefined) {
    return failAt("anchor", anchor, lineCounter);
  }

  return document.contents === null ||
      (isScalar(document.contents) &&
        document.contents.value === null &&
        document.contents.source === "")
    ? {}
    : toJsonCompatibleValue(document.contents, lineCounter);
};
