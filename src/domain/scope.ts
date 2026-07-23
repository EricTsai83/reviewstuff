import * as Schema from "effect/Schema";

export const ReviewScopeSchema = Schema.Literals(["working-tree", "staged"]);

export type ReviewScope = typeof ReviewScopeSchema.Type;

export const workingTreeScope: ReviewScope = "working-tree";
export const stagedScope: ReviewScope = "staged";
