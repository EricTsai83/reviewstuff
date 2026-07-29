import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import {
  ConfigService,
  resolveReviewConfig,
} from "../../src/config/config-service";
import {
  make as fakeReviewEngine,
  ReviewEngine,
  type ReviewEngineExecution,
  ReviewEngineFailure,
} from "../../src/engines/review-engine";
import {
  make as makeReviewEngineRegistry,
  ReviewEngineRegistry,
  ReviewSelectionUnsupportedError,
} from "../../src/engines/review-engine-registry";
import { GitService } from "../../src/git/git-service";
import type { ReviewRequestV1 } from "../../src/review/review-request";
import { fallbackReviewRequestEstimator } from "../../src/review/review-budget";
import {
  decideReviewPrivacy,
  previewReviewRequest,
  ReviewCloudPrivacyError,
  ReviewTimeoutError,
  runReview,
} from "../../src/use-cases/run-review";

const repository = { root: "/repo" };
const config = Layer.succeed(ConfigService, {
  load: (_repository, overrides) =>
    Effect.succeed(resolveReviewConfig(undefined, overrides)),
});
const registryWithEngine = (
  engine: ReviewEngine["Service"],
): Layer.Layer<ReviewEngineRegistry> =>
  Layer.succeed(ReviewEngineRegistry, {
    resolve: (selection) =>
      Effect.succeed({
        acquire: Effect.succeed(engine),
        engineId: selection.engine ?? "fake",
        model: selection.model ?? "fake-reviewer-v1",
        provider: selection.provider ?? "fake",
        transport: engine.transport,
      }),
  });
const fakeReviewEngineRegistry = registryWithEngine(fakeReviewEngine);
const services = Layer.merge(config, fakeReviewEngineRegistry);
const makeGit = (
  service: Pick<GitService["Service"], "readDiff">,
) =>
  Layer.succeed(GitService, {
    resolveRepository: () => Effect.succeed(repository),
    ...service,
  });
const gitTextFile = (
  path: string,
  source: "staged" | "working-tree" | "untracked",
  patch: string,
) => {
  const header = patch.split("\n", 1)[0] ?? "";

  return {
    kind: "text" as const,
    path,
    source,
    status: source === "untracked" ? "A" as const : "M" as const,
    patch,
    fileHeader: "",
    hunks: patch.length === 0 ? [] : [{
      header,
      oldStartLine: 0,
      oldLineCount: 0,
      newStartLine: 1,
      newLineCount: 1,
      patch,
    }],
  };
};

test("runReview resolves the repository once and shares its context", async () => {
  const selectedRepository = { root: "/selected/repo" };
  let resolvedPath: string | undefined;
  let configRepository: typeof selectedRepository | undefined;
  let diffRepository: typeof selectedRepository | undefined;
  const git = Layer.succeed(GitService, {
    resolveRepository: (candidatePath) =>
      Effect.sync(() => {
        resolvedPath = candidatePath;
        return selectedRepository;
      }),
    readDiff: (receivedRepository) =>
      Effect.sync(() => {
        diffRepository = receivedRepository;
        return { files: [] };
      }),
  });
  const selectedConfig = Layer.succeed(ConfigService, {
    load: (receivedRepository, overrides) =>
      Effect.sync(() => {
        configRepository = receivedRepository;
        return resolveReviewConfig(undefined, overrides);
      }),
  });

  await runReview({
    scope: "working-tree",
    repositoryPath: "../selected",
  }).pipe(
    Effect.provide(git),
    Effect.provide(Layer.merge(selectedConfig, fakeReviewEngineRegistry)),
    Effect.runPromise,
  );

  expect(resolvedPath).toBe("../selected");
  expect(configRepository).toBe(selectedRepository);
  expect(diffRepository).toBe(selectedRepository);
});

test("runReview rejects unsupported selections before Git work", async () => {
  const git = makeGit({
    readDiff: () => Effect.die("unsupported selections must fail before Git"),
  });

  const error = await runReview({
    scope: "working-tree",
    configOverrides: {
      engine: "unsupported",
    },
  }).pipe(
    Effect.provide(git),
    Effect.provide(
      Layer.merge(
        config,
        Layer.succeed(ReviewEngineRegistry, makeReviewEngineRegistry()),
      ),
    ),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(
    new ReviewSelectionUnsupportedError({
      engine: "unsupported",
      supportedSelections: [
        "engine=fake, provider=fake, model=fake-reviewer-v1",
        "engine=openai, provider=openai, model=<required>",
      ],
    }),
  );
});

test("privacy decisions are pure and conservative", () => {
  expect(decideReviewPrivacy("local-only", "local")).toEqual({
    mode: "local-only",
    transport: "local",
    decision: "allowed",
  });
  expect(decideReviewPrivacy("cloud-allowed", "local")).toEqual({
    mode: "cloud-allowed",
    transport: "local",
    decision: "allowed",
  });
  expect(decideReviewPrivacy("cloud-allowed", "cloud")).toEqual({
    mode: "cloud-allowed",
    transport: "cloud",
    decision: "allowed",
  });
  expect(decideReviewPrivacy("local-only", "cloud")).toEqual({
    mode: "local-only",
    transport: "cloud",
    decision: "refused",
  });
});

test("local-only refuses a cloud transport before diff or engine work", async () => {
  let diffCalls = 0;
  let engineCalls = 0;
  const git = makeGit({
    readDiff: () =>
      Effect.sync(() => {
        diffCalls += 1;
        return { files: [] };
      }),
  });
  const engine = registryWithEngine({
    transport: "cloud",
    review: () =>
      Effect.sync(() => {
        engineCalls += 1;
        return [];
      }),
  });

  const error = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(
    new ReviewCloudPrivacyError({
      mode: "local-only",
      transport: "cloud",
    }),
  );
  expect(diffCalls).toBe(0);
  expect(engineCalls).toBe(0);
});

test("cloud-allowed invokes a cloud transport and records the decision", async () => {
  let engineCalls = 0;
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/cloud.ts",
            "working-tree",
            "@@ -0,0 +1 @@\n+export const cloud = true;\n",
          ),
        ],
      }),
  });
  const engine = registryWithEngine({
    transport: "cloud",
    review: () =>
      Effect.sync(() => {
        engineCalls += 1;
        return [];
      }),
  });

  const report = await runReview({
    scope: "working-tree",
    configOverrides: { privacy: "cloud-allowed" },
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.runPromise,
  );

  expect(engineCalls).toBe(1);
  expect(report.privacy).toEqual({
    mode: "cloud-allowed",
    transport: "cloud",
    decision: "allowed",
  });
});

test("runReview selects OpenAI through the registry and uses a fake transport", async () => {
  let outboundBody: string | undefined;
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/example.ts",
            "working-tree",
            "@@ -0,0 +1 @@\n+changed();\n",
          ),
        ],
      }),
  });
  const registry = Layer.succeed(
    ReviewEngineRegistry,
    makeReviewEngineRegistry({
      openAIApiKey: Redacted.make("test-api-key"),
      openAITransport: async (request) => {
        outboundBody = request.body;

        return {
          status: 200,
          body: await Bun.file(
            `${import.meta.dir}/../fixtures/openai-responses/completed.json`,
          ).text(),
        };
      },
    }),
  );

  const report = await runReview({
    scope: "working-tree",
    configOverrides: {
      engine: "openai",
      model: "gpt-example",
      privacy: "cloud-allowed",
    },
  }).pipe(
    Effect.provide(Layer.mergeAll(git, config, registry)),
    Effect.runPromise,
  );

  expect(JSON.parse(outboundBody ?? "{}")).toMatchObject({
    model: "gpt-example",
    store: false,
  });
  expect(report.privacy).toEqual({
    mode: "cloud-allowed",
    transport: "cloud",
    decision: "allowed",
  });
  expect(report.findings).toHaveLength(1);
});

test("real registry refuses local-only OpenAI before credential or transport work", async () => {
  let transportCalls = 0;
  const registry = Layer.succeed(
    ReviewEngineRegistry,
    makeReviewEngineRegistry({
      openAIApiKey: Redacted.make("test-api-key"),
      openAITransport: async () => {
        transportCalls += 1;
        return { status: 200, body: "" };
      },
    }),
  );
  const git = makeGit({
    readDiff: () => Effect.die("privacy must fail before Git"),
  });

  const error = await runReview({
    scope: "working-tree",
    configOverrides: {
      engine: "openai",
      model: "gpt-example",
    },
  }).pipe(
    Effect.provide(Layer.mergeAll(git, config, registry)),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(
    new ReviewCloudPrivacyError({
      mode: "local-only",
      transport: "cloud",
    }),
  );
  expect(transportCalls).toBe(0);
});

test("preview resolves an OpenAI request without credentials or cloud authorization", async () => {
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/preview.ts",
            "working-tree",
            "@@ -0,0 +1 @@\n+preview();\n",
          ),
        ],
      }),
  });
  const registry = Layer.succeed(
    ReviewEngineRegistry,
    makeReviewEngineRegistry(),
  );

  const request = await previewReviewRequest({
    scope: "working-tree",
    configOverrides: {
      engine: "openai",
      model: "gpt-example",
    },
  }).pipe(
    Effect.provide(Layer.mergeAll(git, config, registry)),
    Effect.runPromise,
  );

  expect(request.options.model).toBe("gpt-example");
  expect(request.context.files).toHaveLength(1);
});

test("runReview applies the resolved timeout to Git diff work", async () => {
  const git = makeGit({
    readDiff: () => Effect.never,
  });

  const error = await runReview({
    scope: "working-tree",
    configOverrides: { timeoutMs: 1 },
  }).pipe(
    Effect.provide(git),
    Effect.provide(services),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(new ReviewTimeoutError({ timeoutMilliseconds: 1 }));
});

test("runReview applies the same resolved timeout to engine work", async () => {
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/example.ts",
            "working-tree",
            "@@ -0,0 +1 @@\n+export const example = true;\n",
          ),
        ],
      }),
  });
  const engine = registryWithEngine({
    transport: "local",
    review: () => Effect.never,
  });

  const error = await runReview({
    scope: "working-tree",
    configOverrides: { timeoutMs: 1 },
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(new ReviewTimeoutError({ timeoutMilliseconds: 1 }));
});

test("runReview builds the normalized request before invoking the engine", async () => {
  const requestFile = {
    path: "src/example.ts",
    source: "working-tree" as const,
    patch: "@@ -0,0 +1 @@\n+export const example = true;\n",
  };
  const file = gitTextFile(
    requestFile.path,
    requestFile.source,
    requestFile.patch,
  );
  const git = makeGit({
    readDiff: () => Effect.succeed({ files: [file] }),
  });
  let received: ReviewRequestV1 | undefined;
  let receivedExecution: ReviewEngineExecution | undefined;
  const engine = registryWithEngine({
    transport: "local",
    review: (request, execution) =>
      Effect.sync(() => {
        received = request;
        receivedExecution = execution;
        return [];
      }),
  });

  await runReview({
    scope: "working-tree",
    configOverrides: {
      workload: "light",
      model: "fake-reviewer-v1",
      concurrency: 1,
    },
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.runPromise,
  );

  expect(received).toMatchObject({
    schemaVersion: 1,
    context: {
      contentType: "untrusted-repository-data",
      repository: { scope: "working-tree" },
      files: [requestFile],
    },
    options: {
      model: "fake-reviewer-v1",
    },
  });
  expect(receivedExecution).toEqual({
    concurrency: 1,
    timeoutMilliseconds: 120_000,
    maxOutputTokens: 8_192,
  });
});

test("light reduces selected context without changing selection ordering", async () => {
  // Ordinary code lines, not one long opaque token: redaction now runs before
  // the budget, and an oversized token would be replaced before it is measured.
  const patch = (name: string) =>
    [
      "@@ -0,0 +1,250 @@",
      ...Array.from(
        { length: 250 },
        (_unused, index) =>
          `+export const ${name}${index} = "review budget sample line ${index}";`,
      ),
      "",
    ].join("\n");
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile("src/b.ts", "working-tree", patch("b")),
          gitTextFile("src/a.ts", "working-tree", patch("a")),
        ],
      }),
  });
  const received: Array<ReviewRequestV1> = [];
  const executions: Array<ReviewEngineExecution> = [];
  const engine = registryWithEngine({
    transport: "local",
    review: (request, execution) =>
      Effect.sync(() => {
        received.push(request);
        executions.push(execution);
        return [];
      }),
  });
  const provided = Layer.mergeAll(git, config, engine);

  const standard = await runReview({
    scope: "working-tree",
    configOverrides: { workload: "standard" },
  }).pipe(Effect.provide(provided), Effect.runPromise);
  const light = await runReview({
    scope: "working-tree",
    configOverrides: { workload: "light" },
  }).pipe(Effect.provide(provided), Effect.runPromise);

  expect(standard.workload).toBe("standard");
  expect(light.workload).toBe("light");
  expect(standard.budget.maxTokens).toBe(128_000);
  expect(light.budget.maxTokens).toBe(32_000);
  expect(received[0]?.context.files.map((file) => file.path)).toEqual([
    "src/a.ts",
    "src/b.ts",
  ]);
  expect(received[1]?.context.files.map((file) => file.path)).toEqual([
    "src/a.ts",
  ]);
  expect(executions).toEqual([
    {
      concurrency: 2,
      timeoutMilliseconds: 120_000,
      maxOutputTokens: 16_384,
    },
    {
      concurrency: 2,
      timeoutMilliseconds: 120_000,
      maxOutputTokens: 8_192,
    },
  ]);
});

test("preview returns the exact redacted request without invoking the engine", async () => {
  const apiKey = "sk-proj-P1r2E3v4I5e6W7k8E9y0A1b2";
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            `src/${apiKey}.ts`,
            "working-tree",
            `@@ -0,0 +1 @@\n+const token = "${apiKey}";\n`,
          ),
        ],
      }),
  });
  let engineCalls = 0;
  const received: Array<ReviewRequestV1> = [];
  const engine = registryWithEngine({
    transport: "local",
    review: (request) =>
      Effect.sync(() => {
        engineCalls += 1;
        received.push(request);
        return [];
      }),
  });
  const provided = Layer.mergeAll(git, config, engine);

  const preview = await previewReviewRequest({
    scope: "working-tree",
  }).pipe(
    Effect.provide(provided),
    Effect.runPromise,
  );

  expect(engineCalls).toBe(0);
  expect(JSON.stringify(preview)).not.toContain(apiKey);
  expect(JSON.stringify(preview)).toContain("[REDACTED:api-key]");

  await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(provided),
    Effect.runPromise,
  );

  expect(engineCalls).toBe(1);
  expect(received).toEqual([preview]);
});

test("preview applies the resolved timeout to request preparation", async () => {
  const git = makeGit({
    readDiff: () => Effect.never,
  });

  const error = await previewReviewRequest({
    scope: "working-tree",
    configOverrides: { timeoutMs: 1 },
  }).pipe(
    Effect.provide(git),
    Effect.provide(services),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toEqual(new ReviewTimeoutError({ timeoutMilliseconds: 1 }));
});

test("runReview gives the engine only redacted repository data", async () => {
  const apiKey = "sk-proj-A1b2C3d4E5f6G7h8I9j0K1l2";
  const privateKey = [
    "-----BEGIN ENCRYPTED PRIVATE KEY-----",
    "bUY7a1F2S3d4G5h6J7k8L9m0N1p2Q3r4",
    "-----END ENCRYPTED PRIVATE KEY-----",
  ].join("\n");
  const privateKeyPatch = privateKey.split("\n").map((line) => `+${line}`)
    .join("\n");
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            `src/${apiKey}.ts`,
            "working-tree",
            `@@ -0,0 +1,4 @@\n+${apiKey}\n${privateKeyPatch}\n`,
          ),
        ],
      }),
  });
  let received: ReviewRequestV1 | undefined;
  const engine = registryWithEngine({
    transport: "local",
    review: (request) =>
      Effect.sync(() => {
        received = request;
        return [];
      }),
  });

  await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.runPromise,
  );

  const serialized = JSON.stringify(received);
  expect(serialized).not.toContain(apiKey);
  expect(serialized).not.toContain(privateKey);
  expect(serialized).toContain("[REDACTED:api-key]");
  expect(serialized).toContain("[REDACTED:private-key]");
  expect(received?.context.files[0]?.patch).toContain(
    "+[REDACTED:private-key]\n+\n+",
  );
});

test("engine failures cannot echo the original secret through their cause", async () => {
  const apiKey = "sk-proj-Z9y8X7w6V5u4T3s2R1q0P9o8";
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/secret.ts",
            "working-tree",
            `@@ -0,0 +1 @@\n+const apiKey = "${apiKey}";\n`,
          ),
        ],
      }),
  });
  const engine = registryWithEngine({
    transport: "local",
    review: (request) =>
      Effect.fail(
        new ReviewEngineFailure({
          message: "Provider rejected the redacted request.",
          cause: request,
        }),
      ),
  });

  const error = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.flip,
    Effect.runPromise,
  );

  expect(JSON.stringify(error)).not.toContain(apiKey);
  expect(JSON.stringify(error)).toContain("[REDACTED:api-key]");
});

test("runReview produces deterministic findings from added marker lines", async () => {
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/example.ts",
            "working-tree",
            [
              "@@ -2,2 +2,3 @@",
              " context",
              "+const marker = 'REVIEWSTUFF_FAKE_FINDING';",
              " context",
            ].join("\n"),
          ),
        ],
      }),
  });
  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(git),
    Effect.provide(services),
    Effect.runPromise,
  );

  expect(report).toMatchObject({
    schemaVersion: 7,
    scope: "working-tree",
    privacy: {
      mode: "local-only",
      transport: "local",
      decision: "allowed",
    },
    workload: "standard",
    summary: {
      changedFiles: 1,
      reviewedFiles: 1,
      truncatedFiles: 0,
      skippedFiles: 0,
      findings: 1,
    },
    coverage: {
      schemaVersion: 2,
      complete: true,
      files: [
        {
          path: "src/example.ts",
          source: "working-tree",
          status: "reviewed",
          selectedHunks: 1,
          totalHunks: 1,
        },
      ],
    },
    findings: [
      {
        id: "fake-marker:src/example.ts:3:2c4700fe",
        ruleId: "fake-marker",
        severity: "medium",
        category: "correctness",
        confidence: 1,
        message: "Deterministic fake finding marker detected.",
        file: "src/example.ts",
        line: 3,
      },
    ],
  });
  expect(report.budget).toMatchObject({
    schemaVersion: 1,
    unit: "tokens",
    maxTokens: 128_000,
    outputReserveTokens: 16_384,
    fitsBudget: true,
  });
});

test("finding IDs do not change when the same patch is staged", async () => {
  const review = (source: "staged" | "working-tree") =>
    runReview({ scope: "working-tree" }).pipe(
      Effect.provide(
        makeGit({
          readDiff: () =>
            Effect.succeed({
              files: [
                gitTextFile(
                  "src/example.ts",
                  source,
                  "@@ -0,0 +1 @@\n+// REVIEWSTUFF_FAKE_FINDING stable\n",
                ),
              ],
            }),
        }),
      ),
      Effect.provide(services),
      Effect.map((report) => report.findings[0]?.id),
      Effect.runPromise,
    );

  expect(await review("working-tree")).toBe(await review("staged"));
});

test("runReview reports deterministic incomplete coverage", async () => {
  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(
      makeGit({
        readDiff: () =>
          Effect.succeed({
            files: [
              gitTextFile(
                "src/reviewed.ts",
                "working-tree",
                "@@ -0,0 +1 @@\n+export const reviewed = true;\n",
              ),
              {
                kind: "binary" as const,
                path: "assets/image.dat",
                source: "untracked" as const,
                status: "A" as const,
              },
            ],
          }),
      }),
    ),
    Effect.provide(services),
    Effect.runPromise,
  );

  expect(report.summary).toEqual({
    changedFiles: 2,
    reviewedFiles: 1,
    truncatedFiles: 0,
    skippedFiles: 1,
    findings: 0,
  });
  expect(report.coverage).toEqual({
    schemaVersion: 2,
    complete: false,
    files: [
      {
        path: "assets/image.dat",
        source: "untracked",
        reason: "binary",
        status: "skipped",
      },
      {
        path: "src/reviewed.ts",
        source: "working-tree",
        status: "reviewed",
        selectedHunks: 1,
        totalHunks: 1,
      },
    ],
  });
});

test("runReview sends only budget-selected hunks and reports the same coverage", async () => {
  const smallHunk = "@@ -0,0 +1 @@\n+small\n";
  const secondSmallHunk = "@@ -2,0 +3 @@\n+second\n";
  const hugeHunk = `@@ -0,0 +1 @@\n+${"x".repeat(2_000)}\n`;
  const partial = gitTextFile(
    "b-partial.ts",
    "working-tree",
    `${smallHunk}${hugeHunk}`,
  );
  partial.hunks = [
    { ...partial.hunks[0]!, patch: smallHunk },
    { ...partial.hunks[0]!, header: hugeHunk.split("\n", 1)[0]!, patch: hugeHunk },
  ];
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile("a-oversized.ts", "working-tree", hugeHunk),
          partial,
          gitTextFile("c-reviewed.ts", "working-tree", secondSmallHunk),
          {
            kind: "binary" as const,
            path: "image.dat",
            source: "untracked" as const,
            status: "A" as const,
          },
        ],
      }),
  });
  let received: ReviewRequestV1 | undefined;
  const engine = registryWithEngine({
    transport: "local",
    review: (request) =>
      Effect.sync(() => {
        received = request;
        return [];
      }),
  });

  const report = await runReview({
    scope: "working-tree",
    configOverrides: {
      requestBudget: {
        maxTokens: 1_800,
        fixedRequestOverheadTokens: 0,
        outputReserveTokens: 100,
      },
    },
  }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.runPromise,
  );

  expect(received?.context.files).toEqual([
    {
      path: "b-partial.ts",
      source: "working-tree",
      patch: smallHunk,
    },
    {
      path: "c-reviewed.ts",
      source: "working-tree",
      patch: secondSmallHunk,
    },
  ]);
  expect(report.summary).toEqual({
    changedFiles: 4,
    reviewedFiles: 1,
    truncatedFiles: 1,
    skippedFiles: 2,
    findings: 0,
  });
  expect(
    report.coverage.files.map(({ path, status }) => ({ path, status })),
  ).toEqual([
    { path: "a-oversized.ts", status: "skipped" },
    { path: "b-partial.ts", status: "truncated" },
    { path: "c-reviewed.ts", status: "reviewed" },
    { path: "image.dat", status: "skipped" },
  ]);
  expect(new Set(report.coverage.files.map(({ path, source }) =>
    `${source}\0${path}`
  )).size).toBe(4);
  expect(received).toBeDefined();
  const requestTokens = fallbackReviewRequestEstimator.estimate(
    JSON.stringify(received),
  );
  expect(requestTokens + report.budget.outputReserveTokens).toBeLessThanOrEqual(
    report.budget.maxTokens,
  );
  expect(report.budget.selectedRequestTokens).toBe(
    fallbackReviewRequestEstimator.estimate(
      JSON.stringify(received?.context.files),
    ),
  );
  expect(report.budget.totalReservedTokens).toBe(
    report.budget.fixedRequestOverheadTokens +
      report.budget.outputReserveTokens +
      report.budget.selectedRequestTokens,
  );
});

test("runReview skips the engine when no hunk fits the request budget", async () => {
  const hugeHunk = `@@ -0,0 +1 @@\n+${"x".repeat(4_000)}\n`;
  let engineCalls = 0;
  const report = await runReview({
    scope: "staged",
    configOverrides: {
      requestBudget: {
        maxTokens: 1_000,
        fixedRequestOverheadTokens: 0,
        outputReserveTokens: 100,
      },
    },
  }).pipe(
    Effect.provide(
      makeGit({
        readDiff: () =>
          Effect.succeed({
            files: [gitTextFile("oversized.ts", "staged", hugeHunk)],
          }),
      }),
    ),
    Effect.provide(config),
    Effect.provide(
      registryWithEngine({
        transport: "local",
        review: () =>
          Effect.sync(() => {
            engineCalls += 1;
            return [];
          }),
      }),
    ),
    Effect.runPromise,
  );

  expect(engineCalls).toBe(0);
  expect(report.coverage.files).toEqual([{
    path: "oversized.ts",
    source: "staged",
    status: "skipped",
    reason: "request-budget",
    selectedHunks: 0,
    totalHunks: 1,
  }]);
  expect(report.budget.fitsBudget).toBe(true);
  expect(report.budget.totalReservedTokens).toBe(
    report.budget.fixedRequestOverheadTokens +
      report.budget.outputReserveTokens +
      report.budget.selectedRequestTokens,
  );
  expect(report.findings).toEqual([]);
});

test("runReview sends metadata-only files to the engine", async () => {
  let engineCalls = 0;
  let received: ReviewRequestV1 | undefined;
  const metadataOnly = gitTextFile("empty.ts", "untracked", "");

  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(
      makeGit({
        readDiff: () => Effect.succeed({ files: [metadataOnly] }),
      }),
    ),
    Effect.provide(config),
    Effect.provide(
      registryWithEngine({
        transport: "local",
        review: (request) =>
          Effect.sync(() => {
            engineCalls += 1;
            received = request;
            return [];
          }),
      }),
    ),
    Effect.runPromise,
  );

  expect(engineCalls).toBe(1);
  expect(received?.context.files).toEqual([{
    path: "empty.ts",
    source: "untracked",
    patch: "",
  }]);
  expect(report.coverage.files).toEqual([{
    path: "empty.ts",
    source: "untracked",
    status: "reviewed",
    selectedHunks: 0,
    totalHunks: 0,
  }]);
  expect(report.findings).toEqual([]);
});

test("runReview propagates typed engine failures", async () => {
  const failure = new ReviewEngineFailure({
    message: "Injected engine failure.",
    cause: undefined,
  });
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFile(
            "src/example.ts",
            "working-tree",
            "@@ -0,0 +1 @@\n+export const example = true;\n",
          ),
        ],
      }),
  });
  const engine = registryWithEngine({
    transport: "local",
    review: () => Effect.fail(failure),
  });

  const error = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(git),
    Effect.provide(config),
    Effect.provide(engine),
    Effect.flip,
    Effect.runPromise,
  );

  expect(error).toBe(failure);
});

const gitTextFileWithHunks = (
  path: string,
  hunkPatches: ReadonlyArray<string>,
) => ({
  kind: "text" as const,
  path,
  source: "working-tree" as const,
  status: "M" as const,
  patch: hunkPatches.join(""),
  fileHeader: `diff --git a/${path} b/${path}\n`,
  hunks: hunkPatches.map((patch, index) => ({
    header: patch.split("\n", 1)[0] ?? "",
    oldStartLine: index + 1,
    oldLineCount: 1,
    newStartLine: index + 1,
    newLineCount: 1,
    patch,
  })),
});

const privateKeyBodyLine =
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDb7Yq8Kk1pQwR3";

test("redaction runs before the budget so the sent payload stays inside it", async () => {
  const secret = "sk-proj-A1b2C3d4E5f6G7h8I9j0K1l2";
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFileWithHunks("src/secrets.ts", [
            `@@ -1 +1,2 @@\n+const key = "${secret}";\n`,
            `@@ -10 +10,2 @@\n+const other = "${secret}";\n`,
          ]),
        ],
      }),
  });
  let received: ReviewRequestV1 | undefined;
  const engine = registryWithEngine({
    transport: "local",
    review: (request) =>
      Effect.sync(() => {
        received = request;
        return [];
      }),
  });

  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(Layer.mergeAll(git, config, engine)),
    Effect.runPromise,
  );

  if (received === undefined) {
    throw new Error("Expected the engine to receive a request");
  }
  // The budget measured the redacted payload, so its selected estimate still
  // covers what was actually sent.
  const sentFileTokens = fallbackReviewRequestEstimator.estimate(
    JSON.stringify(received.context.files),
  );
  expect(sentFileTokens).toBeLessThanOrEqual(
    report.budget.selectedRequestTokens,
  );
  expect(report.budget.totalReservedTokens).toBeLessThanOrEqual(
    report.budget.maxTokens,
  );
  expect(report.budget.fitsBudget).toBe(true);
  expect(report.redaction).toEqual({
    schemaVersion: 1,
    totalRedactions: 2,
    reasons: [{ reason: "api-key", count: 2 }],
  });
});

test.each([1_500, 3_000, 6_000, 12_000, 128_000])(
  "a secret never reaches the engine at a %d token budget",
  async (maxTokens) => {
    const secret = "sk-proj-A1b2C3d4E5f6G7h8I9j0K1l2";
    const filler = (index: number) =>
      `@@ -${index} +${index},2 @@\n+export const filler${index} = "review budget sample line ${index}";\n`;
    const git = makeGit({
      readDiff: () =>
        Effect.succeed({
          files: [
            gitTextFileWithHunks("src/mixed.ts", [
              ...Array.from({ length: 20 }, (_unused, index) => filler(index)),
              `@@ -99 +99,2 @@\n+const key = "${secret}";\n`,
            ]),
          ],
        }),
    });
    const received: Array<ReviewRequestV1> = [];
    const engine = registryWithEngine({
      transport: "local",
      review: (request) =>
        Effect.sync(() => {
          received.push(request);
          return [];
        }),
    });

    const report = await runReview({
      scope: "working-tree",
      configOverrides: {
        requestBudget: {
          maxTokens,
          fixedRequestOverheadTokens: 0,
          outputReserveTokens: 512,
        },
      },
    }).pipe(
      Effect.provide(Layer.mergeAll(git, config, engine)),
      Effect.runPromise,
    );

    // Whether the budget keeps or drops the hunk holding the secret, the secret
    // itself is never part of the request, and the summary only counts what the
    // payload still contains.
    for (const request of received) {
      expect(JSON.stringify(request)).not.toContain(secret);
    }
    expect(report.budget.totalReservedTokens).toBeLessThanOrEqual(maxTokens);
    expect(report.redaction.totalRedactions).toBe(
      JSON.stringify(received[0] ?? {}).includes("[REDACTED:api-key]") ? 1 : 0,
    );
  },
);

test("redacts a private key that spans two hunks of one file", async () => {
  const git = makeGit({
    readDiff: () =>
      Effect.succeed({
        files: [
          gitTextFileWithHunks("src/key.pem", [
            `@@ -1 +1,3 @@\n+-----BEGIN PRIVATE KEY-----\n+${privateKeyBodyLine}\n`,
            `@@ -10 +10,3 @@\n+${privateKeyBodyLine}\n+-----END PRIVATE KEY-----\n`,
          ]),
        ],
      }),
  });
  let received: ReviewRequestV1 | undefined;
  const engine = registryWithEngine({
    transport: "local",
    review: (request) =>
      Effect.sync(() => {
        received = request;
        return [];
      }),
  });

  const report = await runReview({ scope: "working-tree" }).pipe(
    Effect.provide(Layer.mergeAll(git, config, engine)),
    Effect.runPromise,
  );

  // The first hunk has no end marker and the second has no begin marker, so
  // both halves must be redacted for the key to stay out of the payload.
  expect(JSON.stringify(received)).not.toContain(privateKeyBodyLine);
  expect(report.redaction.totalRedactions).toBeGreaterThanOrEqual(2);
});
