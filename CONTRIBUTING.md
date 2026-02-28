# Contributing to mac-use-mcp

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

- macOS 13 Ventura or later
- Node.js 22+
- [pnpm](https://pnpm.io/) (latest)
- Xcode Command Line Tools (`xcode-select --install`)

### Getting Started

```bash
git clone https://github.com/antbotlab/mac-use-mcp.git
cd mac-use-mcp
pnpm install
pnpm build
```

### Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run the MCP server |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format code with Prettier |

## Code Style

- **TypeScript** — strict mode, ES2022 target, ESM modules
- **Linting** — ESLint enforces consistent code quality
- **Formatting** — Prettier handles all formatting; do not override its config
- Run `pnpm lint` and `pnpm format` before submitting a PR

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes in small, focused commits
3. Ensure `pnpm build` and `pnpm lint` pass without errors
4. Update `CHANGELOG.md` under the `[Unreleased]` section
5. Open a pull request against `main`

### PR Checklist

- [ ] Code compiles without errors (`pnpm build`)
- [ ] Linter passes (`pnpm lint`)
- [ ] Changes documented in `CHANGELOG.md`
- [ ] New tools include input validation with Zod schemas
- [ ] Commit messages follow the format below

## Commit Message Format

```
type(scope): subject
```

- **type**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `style`
- **scope**: optional, lowercase (e.g., `screenshot`, `input`, `ci`)
- **subject**: imperative mood, lowercase, no trailing period

Examples:

```
feat(screenshot): add region capture support
fix(input): handle modifier keys on non-US keyboards
docs: add Windsurf configuration example
chore: update typescript to 5.9
```

## Reporting Issues

- Use [GitHub Issues](https://github.com/antbotlab/mac-use-mcp/issues)
- Search existing issues before creating a new one
- Include macOS version, Node.js version, and MCP client details
- Provide steps to reproduce the problem

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
