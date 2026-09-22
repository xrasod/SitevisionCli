# Security

`svc` handles credentials for Sitevision sites: passwords, OAuth2 tokens and
captured browser sessions. Problems in how they are stored, transmitted or
logged are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/xrasod/SitevisionCli/security/advisories/new)
on this repository. Include:

- What the problem is and what an attacker could do with it.
- Steps to reproduce, or a proof of concept.
- The `svc` version (`svc --version`), your OS and Node version.
- Whether it depends on a particular auth method (basic, OAuth2, cookie).

You should get an acknowledgement within a few days. Fixes are published as a
normal release with a note in the changelog, and you will be credited unless
you ask not to be.

## Scope

In scope:

- Credentials or tokens written to disk, logs, crash reports or the terminal
  in clear text.
- Credentials sent anywhere other than the configured Sitevision site or
  `developer.sitevision.se`.
- The keychain integration and the `SVC_NO_KEYCHAIN` fallbacks.
- Anything in the signing and deploy flows that could let a tampered app
  through.

Out of scope:

- Vulnerabilities in Sitevision itself. Report those to Sitevision.
- Vulnerabilities in dependencies with no reachable path from `svc`. Reports
  are still welcome, but they are usually fixed by a routine dependency update.
- Issues that require an already compromised machine or user account.

## Supported versions

Only the latest published version on npm receives security fixes.
