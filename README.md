# SP Plast OS

**Factory Production & Material Intelligence — SP Plast Industries, Ahmedabad.**

A working Next.js application with transactional PostgreSQL inventory, role-based authorization, production workflows and encrypted offline queues. Neon replaces Supabase as requested. The optional demo runs the same SQL posting functions inside an isolated browser PostgreSQL database; it does not contact a production database.

## Run locally

Use Node 22+ (validated with Node 24), then:

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. With no credentials, choose **Explore the demo factory**. Records persist in this browser. All demonstration machines, customer names and formula quantities are fictional. The demo is removable from Settings → Demo; never enter real factory records in it.

### Test on a phone over Wi-Fi (Windows)

Keep `npm run dev` running and start `npm run dev:phone` in a second terminal. Open the printed **HTTPS** address on a phone connected to the same Wi-Fi, for example `https://192.168.1.6:3443`. `localhost` on a phone refers to the phone itself. Plain HTTP at a LAN IP cannot provide the encryption, camera and service-worker APIs this app needs.

The helper creates a temporary development certificate without changing system trust. A test browser may show a certificate warning. For trusted HTTPS and PWA testing, transfer only `.local-phone/development-ca.cer` to your own test device and install/trust that development CA in its certificate settings (iOS also requires enabling full trust). The same public certificate is downloadable from `/__development-ca.cer` on the HTTPS preview. Never share `.local-phone/phone.pfx` or its password. All these files are gitignored. Use a publicly trusted HTTPS certificate for deployment, not this local preview. The preview proxies port 3443 to the existing development server on port 3000, including hot reload; it does not publish the application to the internet.

For installation and offline testing, run the production build; the service worker is deliberately disabled in development:

```powershell
npm run build
npm start
```

HTTPS is required outside localhost. Open online once, sign in, unlock local storage, then install using Settings → Install app or the browser menu. iPhone uses Safari → Share → Add to Home Screen.

## Connect Neon

Copy `.env.example` to `.env.local` **only if you have not already created it**. Keep these values out of source control and chat logs. Blank values are safe: the application shows an unconfigured state rather than inventing a successful connection.

| Variable | Purpose |
|---|---|
| `DATABASE_ADMIN_URL` | Schema-owner connection, used only by the migration command |
| `DATABASE_URL` | Separate restricted runtime login; never exposed to the browser |
| `NEON_AUTH_BASE_URL` | Managed Better Auth URL for the same Neon branch |
| `NEON_AUTH_COOKIE_SECRET` | Cryptographically random secret, at least 32 characters |
| `APP_URL` | Exact app origin, including HTTPS and port if applicable |
| `BOOTSTRAP_ADMIN_EMAIL` | Verified email authorized to initialize the first organization |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | Private Neon Object Storage or compatible S3 endpoint |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Server-only storage credentials restricted to the private bucket |
| `NEXT_PUBLIC_ENABLE_DEMO` | Set `false` **before building** the production deployment |
| `BUILD_REVISION` | Optional deployment revision used to invalidate the offline shell |

1. Create a Neon project/branch, enable Managed Better Auth and email sign-in. Add your development and production origins to Auth's trusted domains. Enable verification codes for the shared email provider, or configure an email provider for verification links. The app supports code verification and resend.
2. Put the schema-owner URL in `DATABASE_ADMIN_URL`, set the bootstrap email and run `npm run db:migrate`. Migrations run in transactions and record SHA-256 checksums. Do not edit an applied migration; add a new numbered SQL file.
3. Run `npm run db:provision-runtime` to create a restricted login and save its generated URL directly in ignored `.env.local`, without printing the password. It refuses to replace an existing runtime URL. Alternatively, in the Neon SQL editor create a restricted **SQL role**, replacing the password securely:

```sql
CREATE ROLE spplast_runtime LOGIN PASSWORD '<generate-a-long-random-password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT spplast_app TO spplast_runtime;
```

Do not use a console-created privileged owner role as the application login. Construct the connection string for `spplast_runtime`, with SSL required, and store it in `DATABASE_URL`. The server additionally executes `SET LOCAL ROLE spplast_app` for every transaction. The app role has read policies and explicitly granted command execution; no direct table writes.

4. Set Auth URL, cookie secret and exact `APP_URL`. Restart the server and run `npm run db:check`. This verifies connectivity, restricted posting privileges and zero lot visibility without an identity. It does not pretend to validate email delivery or object uploads.
5. Create the bootstrap administrator account in the app, verify its email, sign in and initialize the factory. Add actual machines, shifts, storage locations, material grades and parties in Settings. No real machine configuration or temperatures are assumed.
6. Additional workers create Auth accounts first. The owner adds their Auth user ID, email, role and overrides in Settings → Team. User IDs are available to the administrator in Neon Auth. Self-registration alone never grants organization access.
7. Create a **private** bucket and fill the storage environment variables. Upload a sample photo and confirm its queue clears, it survives refresh, and an unauthenticated URL cannot retrieve it. Database configuration alone does not configure photo storage.
8. Remove `DATABASE_ADMIN_URL` from the web deployment after running migrations in a separate deployment job. Deploy the Node runtime near the database region.

The implementation follows the current [Neon Next.js Auth guide](https://neon.com/docs/auth/quick-start/nextjs-api-only), [serverless driver documentation](https://neon.com/docs/serverless/serverless-driver), and [Object Storage documentation](https://neon.com/docs/storage/overview). The installed Neon Auth SDK is `0.6.0-beta`, the provider's current SDK used by these guides. Pin upgrades through the lockfile and validate the hosted Auth flows before rollout. Password recovery uses the native SDK; it does not use the unsupported Supabase-compatibility password-reset adapter.

## Factory workflows

- **Inward → QC → production:** record measured gross/tare/net quantities and ownership. New lots start on QC hold. Pass QC before consumption. Choose input lots, enter output/bags, losses and optional actual machine readings. Save a draft, submit, then approve. Only approval posts inventory.
- **Grinding → granules:** consume the grinding lot as an input to the next batch. Stage output appears separately on the dashboard; current stock is the signed ledger balance. Document losses explicitly. The server requires exact mass reconciliation before submission/approval.
- **Bags:** grouped or individual net/gross/tare weighing with decimal arithmetic, undo, serial checks, presets, QR and printing. Saving a calculator draft creates no stock. Attach measured groups in a production form.
- **Color lab:** explicitly labeled formula bases, scaling, approved immutable versions, cloning/new versions and usage history. Approved versions stay attached to their original batches. Record planned mixture mass and actual ingredient weights; actual weights must reconcile with consumed inputs. Ingredient quantities and recipe images require recipe permission.
- **Job work:** receive against a customer-owned order; use that order on production and return dispatch. The server preserves customer ownership. Company inventory excludes these lots. Rate basis is visible.
- **Dispatch:** consume eligible QC-passed lots atomically. Partial dispatches, controlled returns and authorized reversal retain the audit history. GST selection is explicit; summaries are operational documents, not statutory invoices or e-way bills.
- **Traceability:** click a stock lot for all-history genealogy, upstream inputs, downstream transformations, transfers and dispatch. Click linked lots to explore splits and combinations. The graph never allocates each input mass to every output as if those were separate consumptions.
- **Reports:** 18 operational views, date/search filters, CSV, lazy-loaded XLSX and branded browser print / Save as PDF. Pagination warnings disable exports until all relevant pages are loaded. Book stock is distinguished from a physical count.

## Offline behavior

`Saved locally` means a successful IndexedDB write, not a server backup. Commands use stable UUIDs and encrypted payloads. The UI reads a cached workspace promptly while refreshing in the background. Transient failures retry with exponential backoff; reconnect, app focus and manual Sync now also trigger retries. Each command is checked again for current permissions, stock, record version and approval rules on the server. Idempotency prevents duplicate posting after a lost response.

A device passphrase derives an AES-GCM key using PBKDF2. Keys remain in memory; another account cannot decrypt the previous account's records. Offline access expires after 12 hours and requires an earlier online initialization. Permission changes discard cached workspace snapshots at the next verified sign-in. A revoked user cannot post after reconnect; offline devices cannot learn a revocation until connectivity returns.

Photographs are compressed locally, queued separately and retained on failure. Private uploads produce thumbnails and content-addressed object keys; retrying a different image cannot replace a committed photo. Metadata is committed only after both objects upload. Failed partial uploads may leave unreferenced objects; use the storage housekeeping procedure below.

Background Sync only wakes unlocked clients: browsers do not universally allow reliable closed-app work, and the service worker cannot decrypt a locked vault. **Keep the app open until pending records/photos are zero.** Conflicts stop dependent queued work and are held for review. Preserve/export the local version, inspect the server record, and create a corrected entry. Approved history is corrected through reversal, never overwritten.

Browser storage can be evicted. Losing the device passphrase makes its unsynced encrypted drafts unrecoverable. Sync daily and export important pending work from Device & sync before clearing storage. Unsynced exports contain private plaintext and must be stored securely. Demo media remains local by design.

## Architecture

```text
src/app/                  App Router shell, manifest, service worker, authenticated API routes
src/components/           Responsive operations screens and customized Radix UI primitives
src/lib/domain/           Typed records, Zod validation, Decimal calculations and report builders
src/lib/db/               Server-only Neon adapter; isolated lazy-loaded PGlite demo
src/lib/offline/          Dexie encrypted vault and ordered retry/conflict queue
src/lib/auth/             Neon Managed Better Auth server/client boundary
db/migrations/            Normalized relational schema, RLS, transactional commands and trace queries
scripts/                  Migration, connection check, SQL bundle and icon generation
tests/                    Domain, PostgreSQL, offline queue and browser acceptance tests
docs/                     Deployment and operational readiness checklist
```

`app.command` serializes posting per organization using an advisory transaction lock. This conservative design prevents concurrent overselling and keeps multi-lot changes atomic. Idempotency records bind the key to its actor and exact request. Approvals, locked days, recipe immutability and ownership checks execute inside PostgreSQL. Weights use `numeric(15,3)` and recipe ratios use six decimal places. Currency rounds taxable amount and tax independently to two decimals, then adds charges/discounts. Fractional rounding is displayed rather than hidden.

The 500-record page limit controls payload size; explicit load-more and partial-result warnings prevent apparently complete exports. Charts, spreadsheets, form sections and the 17 MB local demo database engine load on demand. The demo engine is not part of the live operational startup path and is cached after use rather than precached for every worker.

## Validation

```powershell
npm run check
npx playwright install chromium
npm run test:e2e
npm run build
$env:TEST_PRODUCTION='1'
npm run test:e2e
```

Unit/integration tests execute the real PostgreSQL posting functions in PGlite, including the 1,000 → 600 → 570 → 400 → 380 → partial dispatch chain, job ownership, recipe immutability, RLS, exact decimals, rollback, returns and retry behavior. Browser tests cover desktop/mobile workflows and production-service-worker offline reopening. Hosted Neon connection pooling, two independent server connections, real email delivery, actual camera hardware, iOS storage behavior and private storage require the deployment acceptance checks; local tests are not a substitute for those checks.

## Backups and recovery

Configure the Neon recovery window for the business requirement and test branch recovery. Make periodic encrypted PostgreSQL custom-format backups with `pg_dump --format=custom`; obtain credentials from your deployment secret store, not a checked-in script. Back up both `app` and `private` schemas, roles/grants and the provider-managed identity data according to the provider's backup support. Preserve matching object storage snapshots; database rows alone cannot restore photos.

Restore into an isolated branch with `pg_restore`, recreate runtime grants, configure that branch's Auth/storage endpoints, then run `db:check` and reconcile lot balances before routing production traffic. Never test restore over the running factory database. Operational CSV/XLSX exports are useful for accounting but are not complete relational backups.

For orphaned uploads, compare bucket keys to `app.media.path` and `thumbnail_path`, retain unreferenced files for at least seven days to allow queued retries, then review before removal. No automatic destructive bucket cleanup is shipped.

See [the deployment checklist and remaining scope](docs/DEPLOYMENT.md) before treating this build as a live factory system.
