import * as Effect from "effect/Effect";
import type {
  CommandExecutionError,
  CommandRequest,
  CommandResult,
  Service,
} from "../../src/platform/command-runner";

const literalPathspecPrefix = "--literal-pathspecs";

export type GitArgumentsMatcher =
  | ReadonlyArray<string>
  | ((args: ReadonlyArray<string>) => boolean);

export type GitCommandOutcome =
  | CommandResult
  | CommandExecutionError
  | ((request: CommandRequest) =>
    | Effect.Effect<CommandResult, CommandExecutionError>
    | CommandResult);

interface GitCommandExpectation {
  readonly matcher: GitArgumentsMatcher;
  readonly description: string;
  readonly outcome: GitCommandOutcome;
  consumed: boolean;
}

const formatArguments = (args: ReadonlyArray<string>): string =>
  JSON.stringify(args);

const matches = (
  matcher: GitArgumentsMatcher,
  args: ReadonlyArray<string>,
): boolean => {
  if (typeof matcher === "function") {
    return matcher(args);
  }

  return matcher.length === args.length &&
    matcher.every((argument, index) => argument === args[index]);
};

const isCommandExecutionError = (
  outcome: CommandResult | CommandExecutionError,
): outcome is CommandExecutionError => "_tag" in outcome;

export const gitResult = (
  stdout: string,
  exitCode = 0,
  stderr = "",
): CommandResult => ({ stdout, stderr, exitCode });

export const makeGitRunnerFixture = () => {
  const expectations: Array<GitCommandExpectation> = [];
  const requests: Array<CommandRequest> = [];

  const expectGit = (
    matcher: GitArgumentsMatcher,
    outcome: GitCommandOutcome,
    description = typeof matcher === "function"
      ? "dynamic Git command"
      : formatArguments(matcher),
  ): void => {
    expectations.push({ matcher, outcome, description, consumed: false });
  };

  const runner: Service = {
    run: (request) => {
      requests.push(request);
      const fullArguments = request.args ?? [];
      const args = fullArguments[0] === literalPathspecPrefix
        ? fullArguments.slice(1)
        : fullArguments;
      const expectation = expectations.find((candidate) =>
        !candidate.consumed && matches(candidate.matcher, args)
      );

      if (request.program !== "git" || expectation === undefined) {
        return Effect.die(
          new Error(
            `Unexpected command: ${request.program} ${formatArguments(fullArguments)}`,
          ),
        );
      }

      expectation.consumed = true;
      const outcome = expectation.outcome;
      if (typeof outcome === "function") {
        const dynamicOutcome = outcome(request);
        return Effect.isEffect(dynamicOutcome)
          ? dynamicOutcome
          : Effect.succeed(dynamicOutcome);
      }

      return isCommandExecutionError(outcome)
        ? Effect.fail(outcome)
        : Effect.succeed(outcome);
    },
  };

  const verify = (): void => {
    const pending = expectations
      .filter((expectation) => !expectation.consumed)
      .map((expectation) => expectation.description);

    if (pending.length > 0) {
      throw new Error(`Expected Git command(s) were not run:\n${pending.join("\n")}`);
    }
  };

  return { runner, expectGit, requests, verify };
};
