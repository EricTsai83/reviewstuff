interface GitCommandFailure {
  readonly operation: string;
  readonly exitCode: number;
  readonly failure:
    | "index-locked"
    | "permission-denied"
    | "repository-corrupt"
    | "unsafe-repository"
    | "unknown";
}

export const renderGitCommandError = (error: GitCommandFailure): string => {
  const summary =
    `Git ${error.operation} failed with exit code ${error.exitCode}.`;
  const guidance = (() => {
    switch (error.failure) {
      case "index-locked":
        return "The Git index is locked. Make sure no other Git process is running, then remove a stale .git/index.lock file.";
      case "permission-denied":
        return "Git could not access a repository file because permission was denied.";
      case "repository-corrupt":
        return "Git reported corrupt repository data. Run `git fsck` for details.";
      case "unsafe-repository":
        return "Git refused the repository because its ownership is considered unsafe. Verify the directory owner, then configure `safe.directory` only if you trust it.";
      case "unknown":
        return "Run `git status` in the repository for more details.";
    }
  })();

  return `${summary} ${guidance}`;
};
