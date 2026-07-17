import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

export class FileInspectionError extends Data.TaggedError(
  "FileInspectionError",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class FileInspector extends Context.Service<
  FileInspector,
  {
    readonly size: (
      path: string,
      workingDirectory?: string,
    ) => Effect.Effect<bigint | undefined, FileInspectionError>;
  }
>()("reviewstuff/FileInspector") {}

export type Service = FileInspector["Service"];

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
