/** Review 的 git 範圍。 */
export type ReviewScope =
  | { readonly _tag: "Staged" }
  | { readonly _tag: "Since"; readonly ref: string }
  | { readonly _tag: "WorkingTree" }

export const Staged: ReviewScope = { _tag: "Staged" }
export const WorkingTree: ReviewScope = { _tag: "WorkingTree" }
export const Since = (ref: string): ReviewScope => ({ _tag: "Since", ref })

export const describeScope = (scope: ReviewScope): string => {
  switch (scope._tag) {
    case "Staged":
      return "staged"
    case "Since":
      return `since ${scope.ref}`
    case "WorkingTree":
      return "working-tree"
  }
}
