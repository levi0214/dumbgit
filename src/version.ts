declare const DUMBGIT_BUILD_VERSION: string

export const VERSION =
  typeof DUMBGIT_BUILD_VERSION === 'string'
    ? DUMBGIT_BUILD_VERSION
    : 'dev'
