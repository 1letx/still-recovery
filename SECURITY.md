# Security policy

Still is a static, client-only app. There is no server code, no database and no account system. All user data stays in the visitor's browser.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's **Security → Report a vulnerability** (private advisory) on this repository instead. Include the steps to reproduce and the browser you used.

## How the app is hardened

See [docs/PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md): strict CSP with Trusted Types, auto-escaping templates, a strict data sanitizer, and security headers. Every change runs lint and the security tests (`npm run check`).
