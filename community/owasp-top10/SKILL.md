---
name: owasp-top10
description: >
  Application security basics mapped to the OWASP Top 10: injection, auth, secrets, and dependency hygiene.
  Trigger: When handling user input, auth, sessions, or secrets; when reviewing code for vulnerabilities; when npm audit or a CVE alert fires; when building forms, APIs, or file uploads.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

Load this skill when:
- Writing code that handles untrusted input (forms, uploads, headers, URLs, APIs)
- Implementing authentication, sessions, password storage, or access control
- Storing or transmitting credentials, API keys, or tokens
- Responding to `npm audit` / dependency CVE alerts
- Doing a security pass over a feature before release

---

## Critical Patterns (one per OWASP Top 10 category)

- **A01 Broken access control — check every request server-side**: the UI hiding a
  button is not authorization. Every handler verifies the authenticated subject owns
  / may access the object (`403` vs `404`: return `404` for resources whose existence
  itself is secret). Deny by default; allow only explicit rules.
- **A02 Cryptographic failures — never roll your own crypto**: passwords via
  `argon2id` (or `bcrypt` cost ≥ 12) with per-user salt; TLS everywhere, HSTS on;
  sensitive data encrypted at rest with managed keys. No MD5/SHA-1 for passwords or
  signatures; no ECB mode.
- **A03 Injection — parameterize or escape, never interpolate**: SQL via bound
  parameters (ORM query builders count only if they never string-concat user data);
  shell: avoid `sh -c` with user input at all, use exec arrays; HTML: framework
  escaping by default, `innerHTML` with user data is XSS; NoSQL: reject operator
  objects (`$gt` etc.) from JSON bodies. Blocklists fail — allowlist input shape.
- **A04 Insecure design — threats before code**: for each new feature ask: what can
  a malicious authenticated user do? rate limits on auth and expensive endpoints,
  resource quotas per user, business-logic abuse cases (coupon reuse, negative
  quantities). Design-level flaws are not fixed by parameterized queries.
- **A05 Security misconfiguration — harden defaults**: deny-by-default CORS (never
  `Access-Control-Allow-Origin: *` with credentials), security headers (CSP,
  `X-Content-Type-Options: nosniff`, frame denial), disable framework debug/error
  details in production, remove default accounts and sample endpoints.
- **A06 Vulnerable components — triage, don't ignore**: `npm audit`/`pip-audit` in
  CI; fix `high`+ reachable vulnerabilities promptly; when a fix doesn't exist,
  check reachability — an unreachable vulnerable transitive dep is a documented
  accepted risk, not an emergency.
- **A07 Auth failures — fail closed**: MFA for privileged users, generic login
  errors ("invalid credentials", never "no such user"), exponential lockout or
  rate limiting, session invalidation on password change, `Secure; HttpOnly;
  SameSite=Lax` cookies, short-lived tokens with rotation.
- **A08 Data integrity failures — verify what you consume**: never `eval` or
  `deserialize` untrusted data (Python `pickle`, Java serialization, JS `vm` on user
  code); CI/CD pipelines pinned and protected; signed webhooks verified against the
  raw body before parsing.
- **A09 Logging failures — log security events, protect logs**: log logins, authz
  denies, and input validation failures with subject, IP, and trace id — and NEVER
  log secrets, tokens, passwords, or full PII. Logs are a honeypot; access and
  retention controlled.
- **A10 SSRF — never fetch user-supplied URLs blindly**: validate against an
  allowlist of hosts; block link-local/metadata ranges (`169.254.169.254`,
  `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `::1`); resolve DNS and check
  the IP, not just the hostname (DNS rebinding).

## Quick Reference: Input Handling

```
User input → validate shape (allowlist) → bind parameters / escape for context
            ↘ reject early with 400, never "sanitize then concat"
```

| Context | Safe sink | Unsafe |
|---|---|---|
| SQL | bound params / ORM | `query("... " + input)` |
| Shell | exec array, no shell | `` sh -c "cmd $input" `` |
| HTML | template escaping | `element.innerHTML = input` |
| Path | resolve + prefix check (`path.resolve(base, name).startsWith(base)`) | `open(base + input)` |
| URL fetch | scheme/host allowlist + IP blocklist | `fetch(userUrl)` |
| JSON body | schema validation (Zod), strip unknown | trusting body shape |

## Secrets

- Never in code, config committed to git, or client bundles; env vars or a secret
  manager (1Password CI, Vault, cloud KMS) only.
- Pre-commit scanning (gitleaks/trufflehog) + rotate on leak — rotation beats
  prevention; assume anything in git history is public.
- Frontend: anything shipped to the browser is public, including "hidden" API keys.
- Check `.env` in `.gitignore` before the first commit; the most common leak is the
  very first one.

## Dependency Triage (A06)

1. `npm audit --omit=dev` — production-affecting first.
2. Is the vulnerable code path reachable from your usage? (transitive deps used
   only by an unused feature = documented risk, schedule fix).
3. Fix available → upgrade; none → patch overrides or isolate; emergency → WAF rule
   or feature flag off.
4. Record the decision (issue/ADR) — silent ignores become invisible debt.

## Review Checklist (pre-release pass)

- [ ] Every new endpoint: authenticated? authorized per-object? rate-limited if
      expensive or public-facing?
- [ ] New user input: validated by schema? reaching only safe sinks (table above)?
- [ ] New secrets: env/manager only, absent from git history and client bundles?
- [ ] New dependencies: justified, pinned, audit clean for production?
- [ ] Errors in production: generic to users, detailed in logs with no secrets?
- [ ] File uploads: type/size validated, stored outside web root, served with
      `Content-Disposition` and `Content-Type` sniffing disabled.

## Anti-Patterns

- "We sanitize with a regex" — regexes are blocklists; allowlist the shape instead.
- "It's just an internal tool" — internal tools hold the same credentials.
- Hiding existence via `403` on every private resource — use `404` where existence
  is sensitive; consistent `403` confirms targets to attackers.
- Catch-all `try { } catch { }` around auth checks — a thrown error must fail the
  request closed, not continue the handler.
- Fixing the CVE of the day while skipping the access-control review — misconfiguration
  and broken access control out-rank dependency CVEs in real incidents.
