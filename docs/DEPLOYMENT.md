# Deployment and factory acceptance

The application is runnable and persists real operational records through its posting engine. Migrations 001–005 were applied to the supplied Neon database and the restricted runtime/RLS connection check passed on 21/10/2026. **Production certification remains pending real account acceptance, private storage and factory acceptance.** Do not describe local demo testing as a successful hosted deployment.

## Release checklist

- [x] Set database environment and create a separate restricted runtime login. Credentials remain server-only in ignored environment files.
- [x] Apply migrations and run `db:check`; runtime cannot directly insert ledger rows, does not bypass RLS, and sees no lots without an identity. A separate preview branch and restore drill still need deployment setup.
- [ ] Configure trusted Auth origins, verification delivery, recovery delivery and a strong cookie secret. Verify bootstrap, login, password reset, sign-out and account switching using real accounts.
- [ ] Verify owner, manager, operator, accountant and viewer permissions with separate users. Test recipe API and image denial, not just hidden buttons. Test another organization against the same API.
- [ ] Configure a private bucket, scoped storage credentials, HTTPS and an upload body limit at the hosting proxy (at most 10 MB per request). Verify thumbnails and full images require authorization. Check expired signed links stop working.
- [ ] Disable the demo before the production build. Set a release revision. Build, typecheck, lint, run unit/integration tests and production browser tests.
- [ ] Use a Node host supporting Sharp and upload requests. Verify the host's request-size and execution-time limits. The current server upload adapter is not suitable for a host whose body limit is smaller than the configured photo limit without reducing that limit or implementing direct signed uploads.
- [ ] Configure error monitoring without logging formulas, tokens, photo contents or request bodies. Put appropriate authentication and request-rate controls at the hosting edge.
- [ ] Configure Neon backups/recovery, encrypted exports and storage retention. Perform an isolated restore drill and record the recovery result.
- [ ] Verify camera permission, installation, screen readability, touch targets and printing on the factory's actual Android phones and iPhones.
- [ ] Initialize actual materials, grades, storage locations, machines and shifts. Enter measured opening stock and review QC. Do not use the fictional demo formulas or machine names.

## Operational acceptance

1. Receive 1,000 kg company raw stock, pass QC, consume 600 kg into 570 kg grinding plus 30 kg documented loss. Confirm raw 400 kg and grinding 570 kg.
2. Consume 400 kg grinding into measured granules/rejects/loss. Confirm grinding 170 kg. Release finished goods through QC, dispatch part and reconcile remaining lot stock to the ledger.
3. In parallel browsers, attempt to consume the same last available stock. Exactly one conflicting transaction may post; the other must fail without partial movements. Local PGlite tests cover rollback but independent hosted connections still need this acceptance test.
4. Receive 500 kg customer-owned job input, process and partially return it. Confirm ownership at every stage and exclusion from company stock.
5. Approve a real factory-authorized recipe v1, record a batch, create v2, and verify the original batch still references v1. Check forbidden roles cannot retrieve ingredients or recipe photographs.
6. Sign in and unlock a phone, disconnect, create a production draft with photographs, close/reopen, reconnect and synchronize. Verify record and images from another device. Repeat with a lost response, an expired login, a conflicting edit and a failed photo upload.
7. Lock a finalized day and attempt an unauthorized edit. Correct quantities using controlled reversals; check audit history and stock remain reproducible.
8. Compare daily/monthly reports against source batches and the ledger. Load all pages before export. Have the accountant validate tax selections and operational print summaries.

## Current boundaries and remaining scope

This implementation covers core inward, production, weighing, QC, inventory, traceability, recipes, job-work ownership, dispatch, reporting and offline draft/sync paths. The original specification also describes broader ERP capabilities that are **not complete in this release**:

- Stock consumption occurs at posting; advance order reservations and a separate sales-order lifecycle are not implemented.
- Job rates and charging basis are recorded, but a complete job-work invoicing/GST/payment ledger and customer-approved deductions workflow remain to be built.
- The global search uses loaded workspace records; the dedicated genealogy lookup crosses all dates. An indexed cross-history global search is still needed for large installations.
- English is implemented. A translation dictionary foundation exists; full Hindi/Gujarati translations and interface coverage remain unfinished.
- Some operational configuration is available (materials, machines, shifts, QC fields, bags, tax references, role overrides, approvals). Custom document numbering, per-material loss rules, employee assignments and scheduled maintenance reminders need further work.
- Formula versions are immutable and reusable; a dedicated visual version-diff view, pinned recipes and approved machine-parameter ranges per recipe remain to be built.
- Grouped and individual weighing, serial uniqueness and lot QR labels work. Individual-bag photograph attachment and a dedicated bag master/scan history remain incomplete.
- Photos support private capture/upload, captions, category, thumbnails and side-by-side comparison. Retention policy automation, original-file preservation options and full machine/customer/recipe gallery faceting remain incomplete.
- Onboarding initializes the verified owner and editable material examples; the remaining setup steps use Settings rather than a guided multi-step wizard.
- Physical stock counts are recorded through authorized adjustments with reasons; there is no separate stocktake document and month-close reconciliation sign-off workflow yet.
- PDF output uses the browser print-to-PDF path. No statutory invoice, e-way bill, Tally, IoT or government service integration is claimed. CSV/XLSX and typed internal boundaries are available for future adapters.
- Neon Auth's current SDK is a beta release with upstream peer-dependency warnings. Production dependencies currently pass the audit; development-tool advisories must be reviewed during maintenance. Auth is configured but real email/login acceptance remains pending. Private storage has not been configured.

These items should be prioritized with factory staff before a full ERP rollout. Keep a supervised pilot and existing operational records until hosted acceptance and reconciliation are complete.
