---
name: api-design
description: >
  REST and OpenAPI design: resource modeling, versioning, pagination, errors, and contract-first workflows.
  Trigger: When designing or reviewing HTTP APIs, when writing OpenAPI specs, when deciding URL shapes or status codes, when versioning an API, when clients and server disagree on a contract.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

Load this skill when:
- Designing new REST endpoints or reviewing existing ones
- Writing or maintaining an OpenAPI (Swagger) specification
- Choosing resource names, status codes, pagination, or error formats
- Planning API versioning or deprecation
- Generating or validating clients against a contract

---

## Critical Patterns

- **Model resources, not actions**: URLs name nouns (`/orders/{id}/cancel` is an
  action verb in a noun costume; prefer `POST /orders/{id}` with
  `{"status":"cancelled"}` or a sub-resource). `GET` never mutates; `POST` creates or
  triggers; `PUT` replaces; `PATCH` partial-updates; `DELETE` removes.
- **Design the contract first**: write the OpenAPI spec, review it, generate stubs and
  clients from it. Code-first specs drift; contract-first keeps client and server
  honest. The spec is the review artifact — a PR changing the spec is reviewable
  before any implementation.
- **Consistent error body everywhere**: one problem-details format (RFC 9457
  `application/problem+json`) with `type`, `title`, `status`, `detail`, `instance`,
  and a stable machine-readable `code`. Clients branch on `code`, never on prose.
- **Right status codes are part of the contract**: `201 + Location` for creation,
  `204` for successful delete with no body, `400` malformed request, `401`
  unauthenticated, `403` authenticated but not allowed, `404` absent or hidden
  resource, `409` state conflict, `422` semantic validation failure, `429` rate limit
  with `Retry-After`.
- **Paginate every list endpoint by default**: keyset/cursor pagination
  (`?cursor=...&limit=...`); total counts only if cheap. Unbounded lists become an
  outage at scale.
- **Version only when you must**: evolve additively (new optional fields, new
  endpoints) instead of bumping versions; when breaking is unavoidable, URL-path
  versioning (`/v2/`) is the simplest to route and deprecate with `Sunset` headers.
- **Idempotency for retried writes**: `POST` endpoints that charge, publish, or
  create must accept an `Idempotency-Key` header — clients retry safely over flaky
  networks.
- **Auth via standards**: OIDC/JWT with scopes (`orders:write`), not hand-rolled
  tokens; document the required scope per operation in the spec.

## Resource Modeling

```
GET    /orders              # list (paginated, filterable: ?status=&customer_id=)
POST   /orders              # create -> 201 + Location: /orders/{id}
GET    /orders/{id}         # fetch one
PATCH  /orders/{id}         # partial update (JSON Merge Patch)
DELETE /orders/{id}         # delete -> 204
GET    /orders/{id}/items   # sub-resource collection
POST   /orders/{id}/cancel  # genuine state transition that isn't a field update
```

- Nested routes only one level deep (`/orders/{id}/items`); deeper nesting
  (`/customers/{id}/orders/{id}/items/{id}`) couples resource lifecycles for no gain.
- Filter with query params on the collection (`?status=open`), never by inventing
  path segments (`/open/orders`).
- Return the representation, not an envelope with one field — unless pagination or
  metadata forces an envelope, and then be consistent across every list.

## Error Contract (RFC 9457)

```json
{
  "type": "https://api.example.com/errors/order-locked",
  "title": "Order is locked",
  "status": 409,
  "detail": "Order o_123 was shipped at 2026-10-19T12:00Z and can no longer be modified.",
  "instance": "/orders/o_123",
  "code": "order_locked",
  "errors": [{"field": "status", "issue": "must be 'pending' to modify"}]
}
```

- `code` is stable and documented in the spec; `title`/`detail` may change freely.
- Field-level problems go in an array (`errors`), so forms render them inline.
- Never leak stack traces, SQL, or internal hostnames in `detail`.

## OpenAPI Hygiene

- One spec file, versioned with the code, validated in CI ( spectral /Vacuum lint +
  breaking-change diff like `oasdiff` against the last release).
- Reuse schemas via `components/schemas` + `$ref`; duplicated inline schemas are how
  drift starts.
- Document every non-2xx response with its schema — undocumented 4xx/5xx are the
  ones clients never handle.
- Examples in the spec are test fixtures: keep them valid and current.
- Generate clients from the spec in CI to prove the contract is machine-consumable.

## Versioning & Deprecation

- Additive changes are not breaking: new optional fields, new endpoints, new enum
  values (clients must tolerate unknown enum values — document it).
- Breaking changes: new major path (`/v2/`) with both running in parallel; announce
  deprecation with `Deprecation` and `Sunset` headers on v1.
- Never reuse field names with new semantics — that is the silent breaking change.

## Anti-Patterns

- RPC-in-REST: `POST /doOrderAction` — if every endpoint is a verb, the protocol is
  REST in name only; consider RPC-style API openly instead.
- Returning `200` with an error in the body — clients that only check HTTP status
  will report success.
- Arrays as responses without envelope on some endpoints and with on others.
- `GET` with a request body (proxies and caches mangle it).
- Exposing database IDs and schemas directly in responses — use stable public IDs;
  internal surrogates leak volume and enable enumeration.
- Ignoring `Idempotency-Key` on payment/create endpoints — one timeout equals one
  duplicate charge.
