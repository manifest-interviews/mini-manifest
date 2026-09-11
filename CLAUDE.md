# mini-manifest

Client-only SPA: React 19, Vite, TanStack Router (file-based) + Query, Base UI, Tailwind v4.

## After every task

Run all three. Fix what they report; do not hand back work that fails any of them.

```sh
pnpm typecheck   # tsc -b
pnpm lint        # oxlint
pnpm format      # oxfmt, writes in place
```

`typecheck` needs `src/routeTree.gen.ts`, which the router plugin writes during
`pnpm dev` or `pnpm build`. On a fresh clone, run `pnpm build` once first.

## Conventions

- Routes live in `src/routes/`; the route tree is generated, never edit it.
- `pnpm` only — the version is pinned via `packageManager`.
