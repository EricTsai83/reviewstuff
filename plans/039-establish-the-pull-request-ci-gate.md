# 039 — Establish the pull-request CI gate

[← Plan index](./README.md)

**Depends on:** 038。 **Learning:** reproducible verification in an untrusted PR context。

**Working state:** PR/main workflow以 frozen Bun lockfile執行 typecheck、tests、authorized build與 binary e2e，完全使用
fake providers/fixtures。

**In:** least-permission GitHub Actions workflow、pinned toolchain/actions policy、job separation、safe failed-test artifacts。
**Out:** tag releases、signing secrets、provider live smoke、publish permissions。

**Steps:** 將 local commands拆成可定位 jobs；避免 `pull_request_target` 執行 untrusted code；cache只放 dependencies；
artifact allowlist；document required checks。

**Accept:** fork PR無 secrets/write token；failure能定位 typecheck/unit/build/e2e；CI不需 credentials；uploaded diagnostics不含
source/provider/session payload。

