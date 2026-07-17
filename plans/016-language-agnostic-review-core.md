# 016 - Language Agnostic Review Core

## Goal

讓 review core 不綁 TypeScript，先為 TypeScript 與 Python 建立 language-neutral extension points。

## Working State

完成後 TypeScript、Python、unknown files 都能用同一套 schema 表示。

## Scope

包含：

- `src/languages/detect.ts`
- `src/languages/adapter.ts`
- `LanguageId`
- language-neutral context/finding schema
- generic fallback adapter
- TypeScript/Python basic fixtures

不包含：

- Go/Rust adapters
- 實作所有 analyzer
- Tree-sitter deep parsing
- LSP integration

## Implementation Steps

1. 用 extension/config/shebang 偵測語言。
2. 定義 `ReviewFileContextV1`。
3. finding 加上 `language`。這是 persisted/public schema 的 additive version bump；補前一版
   fixture 的 decode/migration test。
4. prompt context 由 adapter 貢獻，不硬寫 TypeScript。
5. unknown language 仍可用 diff/context review。

## Verification

```bash
bun run test
./dist/reviewstuff review --engine fake --json
```

fixture:

```text
typescript-basic
python-basic
unknown-basic
```

## Acceptance Criteria

- TypeScript review 不回歸。
- non-TypeScript file 不 crash。
- stored findings 有 language metadata。
- 010 保存的前一版 finding/session fixture 仍可讀取或得到明確 migration error。

## Learning Focus

- 把 domain schema 從單一語言假設中解耦。
- 先做 extension point，不急著接所有語言工具。
