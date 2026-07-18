import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  createScanner,
  LanguageVariant,
  SyntaxKind,
} from "typescript/unstable/ast";

const fs = FileSystem.FileSystem.pipe(
  Effect.provide(BunServices.layer),
  Effect.runSync,
);
const path = Path.Path.pipe(Effect.provide(BunServices.layer), Effect.runSync);
const repoRoot = path.resolve(import.meta.dir, "../..");
const sourceRoot = path.join(repoRoot, "src");

const allowedInternalDependencies: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  commands: new Set(["commands", "domain", "output", "shared", "use-cases"]),
  config: new Set(["config", "domain", "platform", "shared"]),
  domain: new Set(["domain", "shared"]),
  engines: new Set([
    "config",
    "domain",
    "engines",
    "platform",
    "review",
    "shared",
  ]),
  git: new Set(["domain", "git", "platform", "shared"]),
  output: new Set(["domain", "output", "shared"]),
  platform: new Set(["platform", "shared"]),
  review: new Set(["domain", "review", "shared"]),
  shared: new Set(["shared"]),
  storage: new Set(["domain", "platform", "shared", "storage"]),
  "use-cases": new Set([
    "agent",
    "analyzers",
    "config",
    "domain",
    "engines",
    "fix",
    "git",
    "languages",
    "release",
    "review",
    "shared",
    "storage",
    "use-cases",
  ]),
};

function sourceArea(file: string): string {
  const relativePath = path.relative(sourceRoot, file).replaceAll("\\", "/");
  const [firstSegment] = relativePath.split("/");

  return relativePath.includes("/") ? (firstSegment ?? "") : "root";
}

function moduleSpecifiers(sourceText: string): ReadonlyArray<string> {
  const specifiers: Array<string> = [];
  const scanner = createScanner(
    true,
    LanguageVariant.Standard,
    sourceText,
    0,
    sourceText.length,
  );
  let importDeclaration = false;
  let exportDeclaration = false;
  let exportCanReExport = false;

  for (
    let token = scanner.scan();
    token !== SyntaxKind.EndOfFile;
    token = scanner.scan()
  ) {
    if (token === SyntaxKind.ImportKeyword) {
      importDeclaration = true;
      exportDeclaration = false;
      continue;
    }

    if (token === SyntaxKind.ExportKeyword) {
      exportDeclaration = true;
      exportCanReExport = false;
      importDeclaration = false;
      continue;
    }

    if (
      exportDeclaration &&
      (token === SyntaxKind.AsteriskToken ||
        token === SyntaxKind.OpenBraceToken ||
        token === SyntaxKind.TypeKeyword)
    ) {
      exportCanReExport = true;
    }

    if (
      exportDeclaration &&
      (token === SyntaxKind.ConstKeyword ||
        token === SyntaxKind.LetKeyword ||
        token === SyntaxKind.VarKeyword ||
        token === SyntaxKind.ClassKeyword ||
        token === SyntaxKind.FunctionKeyword ||
        token === SyntaxKind.DefaultKeyword)
    ) {
      exportDeclaration = false;
    }

    if (
      exportDeclaration &&
      exportCanReExport &&
      token === SyntaxKind.FromKeyword
    ) {
      importDeclaration = true;
      continue;
    }

    if (importDeclaration && token === SyntaxKind.StringLiteral) {
      specifiers.push(scanner.getTokenValue());
      importDeclaration = false;
      exportDeclaration = false;
      continue;
    }

    if (
      token === SyntaxKind.SemicolonToken ||
      token === SyntaxKind.CloseParenToken
    ) {
      importDeclaration = false;
      exportDeclaration = false;
      exportCanReExport = false;
    }
  }

  return specifiers;
}

function forbiddenRuntimeUsages(sourceText: string): ReadonlyArray<string> {
  const scanner = createScanner(
    true,
    LanguageVariant.Standard,
    sourceText,
    0,
    sourceText.length,
  );
  const usages = new Set<string>();
  const recentTokens: Array<readonly [kind: SyntaxKind, text: string]> = [];

  for (
    let token = scanner.scan();
    token !== SyntaxKind.EndOfFile;
    token = scanner.scan()
  ) {
    recentTokens.push([token, scanner.getTokenText()]);

    if (recentTokens.length > 3) {
      recentTokens.shift();
    }

    if (recentTokens.length !== 3) {
      continue;
    }

    const first = recentTokens[0];
    const second = recentTokens[1];
    const third = recentTokens[2];

    if (first === undefined || second === undefined || third === undefined) {
      continue;
    }

    const [firstKind, firstText] = first;
    const [secondKind] = second;
    const [thirdKind, thirdText] = third;
    const isPropertyAccess =
      firstKind === SyntaxKind.Identifier &&
      secondKind === SyntaxKind.DotToken &&
      thirdKind === SyntaxKind.Identifier;

    if (isPropertyAccess && firstText === "Bun" && thirdText === "spawn") {
      usages.add("Bun.spawn");
    }

    if (
      isPropertyAccess &&
      firstText === "process" &&
      (thirdText === "argv" || thirdText === "env")
    ) {
      usages.add("process.argv/process.env");
    }
  }

  return [...usages];
}

async function sourceFiles(): Promise<ReadonlyArray<string>> {
  const files: Array<string> = [];
  const glob = new Bun.Glob("src/**/*.ts");

  for await (const file of glob.scan({ absolute: true, cwd: repoRoot })) {
    files.push(file);
  }

  return files.sort();
}

test("source layout uses capability names instead of DI roles", async () => {
  const violations: Array<string> = [];

  for (const file of await sourceFiles()) {
    const relativeFile = path
      .relative(sourceRoot, file)
      .replaceAll("\\", "/");
    const segments = relativeFile.split("/");
    const fileName = segments.at(-1) ?? "";
    const roleDirectory = segments.find((segment) => {
      const normalized = segment.toLowerCase();

      return normalized === "services" || normalized === "layers";
    });

    if (roleDirectory !== undefined) {
      violations.push(
        `${relativeFile}: use a capability directory instead of ${roleDirectory}/`,
      );
    }

    const genericRoleFile =
      fileName === "service.ts" ||
      fileName === "adapter.ts" ||
      fileName === "layer.ts" ||
      fileName === "live.ts";

    if (genericRoleFile || fileName.endsWith("-live.ts")) {
      violations.push(
        `${relativeFile}: name the concrete capability instead of its DI role`,
      );
    }
  }

  expect(violations).toEqual([]);
});

test("source modules preserve the documented dependency direction", async () => {
  const violations: Array<string> = [];

  for (const file of await sourceFiles()) {
    const area = sourceArea(file);
    const relativeFile = path.relative(repoRoot, file);
    const sourceText = await fs.readFileString(file).pipe(Effect.runPromise);

    if (area !== "root" && allowedInternalDependencies[area] === undefined) {
      violations.push(
        `${relativeFile}: top-level source area "${area}" is not registered`,
      );
      continue;
    }

    if (area !== "root") {
      for (const usage of forbiddenRuntimeUsages(sourceText)) {
        violations.push(`${relativeFile}: feature code uses ${usage}`);
      }
    }

    for (const moduleName of moduleSpecifiers(sourceText)) {
      if (moduleName.startsWith(".")) {
        const target = path.resolve(path.dirname(file), moduleName);
        const targetArea = sourceArea(target);
        const allowed =
          area === "root"
            ? true
            : (allowedInternalDependencies[area]?.has(targetArea) ?? false);

        if (!allowed) {
          violations.push(
            `${relativeFile}: ${area} must not import ${targetArea} (${moduleName})`,
          );
        }

        continue;
      }

      if (moduleName === "child_process" || moduleName.startsWith("node:")) {
        violations.push(`${relativeFile}: imports forbidden runtime module ${moduleName}`);
      }

      const importsEffectPlatform =
        moduleName === "effect/FileSystem" ||
        moduleName === "effect/Path" ||
        moduleName === "effect/PlatformError" ||
        moduleName.startsWith("effect/unstable/process");
      const importsBunPlatform = moduleName.startsWith("@effect/platform-bun");

      if (
        area !== "root" &&
        area !== "platform" &&
        area !== "config" &&
        importsEffectPlatform
      ) {
        violations.push(
          `${relativeFile}: ${area} must use semantic services instead of ${moduleName}`,
        );
      }

      if (area !== "root" && importsBunPlatform) {
        violations.push(
          `${relativeFile}: only the composition root may import ${moduleName}`,
        );
      }
    }
  }

  expect(violations).toEqual([]);
});

test("request budget ownership stays outside Git and engine adapters", async () => {
  const files = await sourceFiles();
  const forbiddenOwners = files.filter((file) => {
    const area = sourceArea(file);

    return area === "git" || area === "engines";
  });
  const violations: Array<string> = [];

  for (const file of forbiddenOwners) {
    const imports = moduleSpecifiers(
      await fs.readFileString(file).pipe(Effect.runPromise),
    );
    if (imports.some((moduleName) => moduleName.includes("review-budget"))) {
      violations.push(path.relative(repoRoot, file));
    }
  }

  const runReviewImports = moduleSpecifiers(
    await fs.readFileString(
      path.join(sourceRoot, "use-cases", "run-review.ts"),
    ).pipe(Effect.runPromise),
  );

  expect(violations).toEqual([]);
  expect(runReviewImports).toContain("../review/review-budget");
});
