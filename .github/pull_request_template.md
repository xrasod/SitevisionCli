## Summary

<!--
What changes for someone using svc, in a few sentences. If this is an internal
refactor with no user-facing change, say so. Link the issue: "Closes #123".
-->

## How it was tested

<!--
What you ran and against what. For deploy, auth or signing changes, name the
Sitevision version and auth method you tested against. Attach a screenshot or
recording for shell (UI) changes.
-->

## Checklist

See [CONTRIBUTING.md](https://github.com/xrasod/SitevisionCli/blob/main/CONTRIBUTING.md) for details.

- [ ] `npm test` passes and the change has test coverage
- [ ] Works on Windows, or the change does not touch paths, processes, the keychain or the terminal
- [ ] Readme and `docs/` updated if a command, flag, config key or workflow changed
- [ ] No changelog entry (written at release time)
- [ ] No secrets, site URLs or usernames in the diff
- [ ] Breaking change? Describe what breaks and how to migrate in the summary
