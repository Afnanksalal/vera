# Production operations

## Monitoring

Run one Vera application container per persistent SQLite volume. The in-process operations worker updates `worker_heartbeats` every 15 seconds and independently drains Razorpay webhook and notification outboxes and due RazorpayX feeds even when no user opens the console. Alert when `/api/health` is unavailable, `vera_up` or `vera_worker_healthy` is zero, failed queue gauges are non-zero, or `vera_backup_verified` remains zero. Scrape authenticated `/api/v1/metrics` with a dedicated organization API key over HTTPS.

Structured JSON logs go to stdout. Collect container stdout in the host logging system and alert on `level=error`. Secret-shaped fields are redacted by the logger. Settings shows failed deliveries, integration audit entries, worker freshness, database integrity, and backup history.

## Backup and restore

Create an encrypted recovery backup in Settings, download it to storage outside the VPS, then immediately verify that same file in Settings. Keep its passphrase in a separate password manager. A usable recovery point contains both the SQLite database and the exact master-key keyring. Monitor the last verified time and test an offline restore on a disposable host regularly.

Restore is intentionally offline: stop only the Vera container, copy the current `/app/data` volume to a dated recovery location, decrypt the recovery package on a trusted operator machine, restore `vera.db` and `.master_key` together, enforce owner-only filesystem permissions, and start Vera. Never restore one file without the other.

## Master-key rotation

1. Confirm the current installation is healthy and export a fresh encrypted backup.
2. Verify that exact backup in Settings; rotation remains unlocked for 24 hours.
3. Notify users that all sessions and API keys will be revoked. Pending organization invitations will also be invalidated.
4. In Advanced installation settings, enter the owner password, type `ROTATE`, and rotate.
5. Sign in again, recreate integration API keys, reissue pending invitations, and verify Razorpay, AI, signing, chat, and bank-feed settings still report configured.
6. Create and verify a new post-rotation backup, then retain the pre-rotation backup according to the recovery policy.

If a process crash occurs after key staging, the keyring retains the prior key so old ciphertext stays decryptable. Restart Vera and repeat the rotation after confirming health. Do not hand-edit `.master_key`.
