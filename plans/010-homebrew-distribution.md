# 010 - Homebrew Distribution

## Goal

提供 macOS 使用者穩定安裝方式：

```bash
brew install reviewstuff
```

Homebrew 是安裝管道，不是另一套 build system。Formula 必須下載 008 定義的 GitHub Release tarball，驗 sha256，然後安裝其中的 standalone binary。

## Depends On

- 008 - Release Artifact Layout
- 009 - Codesign And Notarization

## Scope

包含：

- Homebrew formula。
- tarball URL/checksum。
- basic test block。

不包含：

- private tap hosting 決策。
- auto-update。
- 從 source build ReviewStuff。
- Node/Bun runtime dependency。

## Formula Shape

```rb
class Reviewstuff < Formula
  desc "Local-first AI code review CLI"
  homepage "https://github.com/<org>/reviewstuff"
  url "https://github.com/<org>/reviewstuff/releases/download/vX.Y.Z/reviewstuff-vX.Y.Z-darwin-arm64.tar.gz"
  sha256 "<sha256>"
  version "X.Y.Z"

  def install
    bin.install "reviewstuff"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/reviewstuff --version")
  end
end
```

## Acceptance Criteria

- Formula installs binary.
- `reviewstuff --version` works after install.
- `brew test reviewstuff` passes.
- Formula checksum matches release tarball.
- Formula does not install Node, Bun, or npm packages.
