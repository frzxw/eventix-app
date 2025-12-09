# copilot-instructions.md

> **Never generate any documents after writing code.**
> This repository enforces a code-first workflow. No documentation artifacts may be created automatically after code is generated.
> No MVP, "TODO" or "ideally", only provide production-ready code.
> Implement clean and maintainable code, best practices only.
---

## 1. Document Purpose

This file defines **mandatory rules and constraints** for GitHub Copilot, AI coding tools, and all human developers working on the **Eventix** codebase.

This is **not guidance** and **not best-practice advice**.
These rules are **mandatory** and **must be strictly enforced**.

If any generated implementation violates these rules, it **must not be committed**.

Primary mandatory goals:

* Prevent ticket overselling (“ticket war” conditions)
* Guarantee strict correctness under extreme concurrency
* Enforce a microservices, Azure-native architecture
* Enforce deterministic and auditable data behavior
* Prevent fragile or unsafe shortcuts

---

## 2. Architecture Model (Mandatory)

### 2.1 Architecture Style

The system **must** be implemented as **microservices**.

Rules:

* Each service owns its own data and storage.
* Services may not share internal database schemas.
* Services may not write into other services’ tables or containers.
* All cross-service communication **must** be asynchronous.

Microservices are required to communicate **only through Azure Service Bus**.

Direct synchronous HTTP calls between services **must not** be generated.

---

### 2.2 Frontend

The frontend **must** be:

* React 18+ with TypeScript
* SSR-ready SPA architecture
* No PWA features
* No service workers
* No offline caching
* No IndexedDB
* No manifest files

The frontend must never contain secrets, private keys, or direct database access.

---

### 2.3 Backend Runtime

All backend services **must** be implemented using:

* Azure Functions
* Node.js 18 LTS
* TypeScript with `strict` enabled

Only these triggers are allowed:

* HTTP Trigger
* Service Bus Trigger
* Timer Trigger

---

## 3. Data Platform Responsibilities

### 3.1 Azure SQL (Authoritative Store)

Azure SQL is the **only authoritative store** for:

* Inventory
* Reservations
* Orders
* Tickets
* Financial state transitions

Rules:

* All oversell-critical logic must occur inside Azure SQL.
* All inventory mutations must be transactional.
* All inventory decrements must be protected by database locks or isolation.
* No eventual consistency is allowed for inventory correctness.

Azure SQL is used for **strong consistency and correctness**.

---

### 3.2 Azure Cosmos DB (Read & Distribution Store)

Cosmos DB is strictly a **secondary store** and **never authoritative**.

Cosmos DB may only store:

* Denormalized read models
* Cached projections for frontend queries
* Analytics-friendly documents

Rules:

* Cosmos DB must never be used to decide inventory.
* Cosmos DB must never be used to create or validate reservations.
* Cosmos DB must never be the system of record for payments or tickets.

Cosmos DB exists to improve **read scalability and global latency**, not correctness.

---

## 4. Mandatory Microservices and Ownership

The system must be split by responsibility.

Minimum required services:

* **Auth Service**
  Owns authentication, sessions, token lifecycle, password hashing.

* **Catalog Service**
  Owns events, categories, and public metadata.

* **Inventory Service**
  Owns inventory counts and reservation state. Owns Azure SQL tables for inventory and reservations.

* **Order Service**
  Owns order records and purchase state transitions.

* **Payment Service**
  Owns inbound payment validation and idempotency.

* **Ticket Service**
  Owns ticket creation, persistence, and ticket status.

* **Notification Service**
  Owns emails, SMS, and external notifications.

* **Read Model Service**
  Owns Cosmos DB projections and denormalized documents.

Each service:

* Owns its own schema
* Controls its own tables or containers
* Can only modify its own data

---

## 5. Mandatory Event-Driven Flow

All business flows **must** follow this pattern:

1. Frontend calls an HTTP Azure Function.
2. Input is validated using **Zod**.
3. The function performs minimal work.
4. A database-safe change occurs (transactional if stateful).
5. An event is published to Service Bus.
6. Downstream services react asynchronously.

No synchronous service-to-service calls are allowed.

Heavy computation inside HTTP triggers is strictly forbidden.

---

## 6. Ticket War / Overselling Protection (Critical Rules)

### 6.1 Reservation-First Rule

Tickets must **never** be sold directly.

Rules:

* A reservation must always be created before payment.
* Payment must never occur without a valid reservation.
* Tickets must never be created without a confirmed payment event.

### 6.2 Transactional Inventory Enforcement

Inventory must be protected by:

* Database-level transactions.
* Row-level locking or equivalent isolation.
* Single atomic operations where stock decrement and reservation creation occur together.

Rules:

* Inventory decrement and reservation creation must either both succeed or both fail.
* Partial updates are forbidden.

### 6.3 Reservation Expiry

Each reservation **must**:

* Have an `expiresAt` timestamp.
* Be reversible if payment does not occur.

There must be a background process that:

* Detects expired reservations.
* Atomically restores inventory stock.

---

## 7. Azure Service Bus – Mandatory Messaging Architecture

### 7.1 Required Queues

The following queues must exist:

* `order-created`
* `payment-confirmed`
* `ticket-issued`
* `email-dispatch`

### 7.2 Required Topics

The following topics must exist:

* `event-status-updates`
* `capacity-sync`

### 7.3 Message Contract Rules

Every message **must** include:

* `correlationId`
* `idempotencyKey`
* `eventId` as the Service Bus session ID

Messages that do not conform must be rejected.

### 7.4 Consumer Rules

Every Service Bus consumer **must**:

* Be idempotent
* Be retry-safe
* Implement exponential backoff
* Use dead-letter queues
* Emit structured logs

Message handlers must tolerate duplicates.

---

## 8. Idempotency Rules

All externally triggered flows must be idempotent.

Rules:

* Every payment message must include an `idempotencyKey`.
* Every key must be persisted.
* Duplicate keys must result in **no side effects**.

This rule is mandatory across all services.

---

## 9. Redis Rules

Redis is strictly a **cache**.

Rules:

* Redis must never be authoritative.
* All cached entries must include TTL.
* Cache invalidation must exist for critical state changes.

---

## 10. Observability

The system **must** expose:

* Structured application logs
* Distributed tracing
* Custom metrics

Mandatory monitored signals:

* Failed reservations
* Dead-letter queue growth
* Inventory mismatches
* Idempotency conflicts
* Reservation expiry rate

Azure Application Insights is mandatory.

---

## 11. Security Rules

All generated code **must**:

* Use bcrypt with 12 salt rounds
* Enforce HTTPS
* Enforce strict CORS allow-lists
* Enforce CSRF protection
* Enforce CSP headers
* Retrieve secrets only from Azure Key Vault

Forbidden:

* Hardcoded secrets
* Client-side secrets
* Embedded private keys

---

## 12. Testing Rules

Allowed tools:

Frontend:

* Vitest
* @testing-library/react
* msw

Backend:

* Vitest
* Supertest

E2E:

* Playwright

Load:

* k6

Mandatory requirements:

* Minimum 80% test coverage.
* Concurrency tests simulating at least 100 parallel purchase attempts.
* Dedicated “no oversell” tests.

---

## 13. Biome Rules

Biome is mandatory.

Rules:

* All code must pass Biome checks.
* No ESLint or Prettier configurations that conflict with Biome may be added.
* Imports and formatting must follow repository Biome configuration.

---

## 14. Husky Rules

Husky is mandatory.

Rules:

* `pre-commit` must run:

  * Biome checks
  * TypeScript type checks
  * Fast unit tests

* `pre-push` must run:

  * Full test suite
  * Build validation

Commits must fail if checks fail.

---

## 15. Forbidden Patterns

Copilot must not generate:

* PWA files
* Service workers
* IndexedDB logic
* Use of `any` in TypeScript
* Direct cross-service database writes
* Synchronous blocking computation in HTTP triggers

---

## 16. Mental Model for Copilot

All generated code must prioritize:

* Correctness over speed
* Atomicity over convenience
* Messaging over chaining HTTP
* Safety over premature optimization

If a solution cannot be made safe under these rules, **Copilot must not generate it**.