# Changelog

All notable changes to JPSQL Runner will be documented in this file.

The format is based on Keep a Changelog, and this project follows semantic versioning.

## [0.0.1] - 2026-06-14

### Added

- Initial JPSQL parameter editor in the VS Code panel.
- `.jpsql` language registration.
- `$P{name}` and `$P!{name}` SQL compilation.
- `$X{IN, column, name}`, `$X{NOTIN, column, name}`, `$X{EQUAL, column, name}`, and `$X{NOTEQUAL, column, name}` support.
- Configurable SQL runner command through `jpsql.runnerCommand`.
- Preview command for compiled SQL and bound values.
