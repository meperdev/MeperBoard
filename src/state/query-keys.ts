/** Canonical TanStack Query keys for the state layer. */
export const queryKeys = {
  board: ["board"] as const,
  backlog: ["backlog"] as const,
  issueDetail: ["issue-detail"] as const,
  issueComments: ["issue-comments"] as const,
  localCards: ["local-cards"] as const,
  userRepos: ["user", "repos"] as const,
};
