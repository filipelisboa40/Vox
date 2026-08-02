# Vox

Vox is a Discord music bot written in TypeScript.

## Requirements

- Node.js 24 or newer
- pnpm 11

## Development

Install dependencies:

```shell
pnpm install
```

Run the development entry point with automatic restarts:

```shell
pnpm dev
```

## Quality checks

```shell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The compiled application is written to `dist/` and can be run with `pnpm start`.