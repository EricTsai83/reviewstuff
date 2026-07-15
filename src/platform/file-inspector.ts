import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { Context, Data, Effect, Layer } from "effect";

export class FileInspectionError extends Data.TaggedError(
  "FileInspectionError",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class FileInspector extends Context.Tag("reviewstuff/FileInspector")<
  FileInspector,
  {
    readonly size: (
      path: string,
      workingDirectory?: string,
    ) => Effect.Effect<bigint | undefined, FileInspectionError>;
  }
>() {}

export type Service = Context.Tag.Service<typeof FileInspector>;

export const layer: Layer.Layer<
  FileInspector,
  never,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  FileInspector,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;

    return {
      size: (path, workingDirectory) => {
        const resolvedPath =
          workingDirectory === undefined
            ? path
            : pathService.resolve(workingDirectory, path);

        return fileSystem.exists(resolvedPath).pipe(
          Effect.flatMap((exists) =>
            exists
              ? fileSystem.stat(resolvedPath).pipe(
                  Effect.map((info) => BigInt(info.size)),
                )
              : Effect.succeed<undefined>(undefined),
          ),
          Effect.mapError(
            (cause) => new FileInspectionError({ path, cause }),
          ),
        );
      },
    };
  }),
);
