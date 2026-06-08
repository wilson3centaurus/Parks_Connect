# Incident Report: Storage Outage — May 7, 2026

**Severity:** Critical  
**Duration:** ~2 weeks (files inaccessible from ~late April 2026 until May 7, 2026)  
**Affected Systems:** Supabase self-hosted storage (all buckets), app gallery, profile images, school logos, lesson plan documents  
**Resolution Time:** ~3 hours of active diagnosis and repair  

---

## Summary

After a server maintenance window, all files stored in Supabase Storage began returning HTTP 500 `InternalError` on every download/view request. Files appeared intact in the Supabase dashboard (correct names, sizes, metadata) but were completely inaccessible. The root cause was a two-stage failure: (1) the Docker storage volume was wiped during maintenance, and (2) a subsequent restore from backup correctly copied file bytes but omitted required Linux extended attributes (xattrs) that the Supabase Storage service requires to serve files.

---

## Timeline

| Date | Event |
|------|-------|
| ~Apr 23, 2026 | Server maintenance window — `docker compose down -v` was run, destroying the Docker named volume for storage |
| ~Apr 23, 2026 | All containers stopped. Server hard-rebooted. Containers failed to auto-restart (`ShouldRestart failed` in Docker logs) — required manual `docker compose up -d` |
| ~Apr 23, 2026 | Storage volume rebuilt from scratch by Docker — **all 1.2GB of files gone**, only 33MB of empty scaffolding left |
| Apr 23–May 6 | Files showing "broken image" in app. Mistakenly attributed to server being down |
| May 6, 2026 | Session 1: Diagnosed volume wipe. Ran `restore_storage.sh` — restored 1.2GB of file bytes from `/root/migrations/storage_export/` backup. Files returned to correct paths. |
| May 6, 2026 | Images still broken. Diagnosed separate issue: DB URLs still pointed to old Supabase cloud (`rrmlbuolcfrpnfvbhagb.supabase.co`). Fixed 18 user profiles, 14 schools, 229 gallery items, 75 lesson plan signed URLs. |
| May 7, 2026 | Files still returning 500. Deeper diagnosis reveals missing xattrs. Fixed all 549 files. **Storage fully operational.** |

---

## Root Cause Analysis

### Stage 1 — Volume Destruction

The command `docker compose down -v` was run during maintenance. The `-v` flag instructs Docker to **delete all named volumes** associated with the compose stack. The Supabase storage volume (`supabase_storage_data` or equivalent) was one of these named volumes.

This is a **non-recoverable operation** without a backup. Docker does not prompt for confirmation. It is a one-liner that silently destroys all stored data.

**What `-v` does:**
```bash
docker compose down        # stops containers only — data safe
docker compose down -v     # stops containers AND deletes volumes — DATA GONE
```

### Stage 2 — Incomplete Restore (Missing xattrs)

The backup at `/root/migrations/storage_export/` contained the raw file bytes. The restore script (`restore_storage.sh`) used `cp` to copy them to the correct volume path. This recovered file content but not **Linux extended attributes (xattrs)**.

Supabase Storage's file backend (`supabase-storage` service) is built on the `fs-xattr` Node.js library. Every time a file is uploaded through Supabase, three xattrs are written to the physical file:

| xattr key | example value | purpose |
|-----------|---------------|---------|
| `user.supabase.content-type` | `image/jpeg` | MIME type for HTTP response header |
| `user.supabase.cache-control` | `max-age=3600` | Cache-Control response header |
| `user.supabase.etag` | `a5917c7719750abbef4a5439f3a8adfe` | ETag for conditional requests |

The relevant code in `/app/dist/storage/backend/file.js` inside the container:

```js
async getFileMetadata(file) {
  const [cacheControl, contentType] = await Promise.all([
    this.getMetadataAttr(file, 'user.supabase.cache-control'),
    this.getMetadataAttr(file, 'user.supabase.content-type'),
  ])
  return { cacheControl, contentType }
}

getMetadataAttr(file, attribute) {
  return xattr.get(file, attribute).then((value) => value?.toString() ?? undefined)
}
```

`xattr.get()` throws `ENODATA` (errno 61) when the attribute does not exist. There is **no try/catch** around this call, so the error propagates all the way up and becomes a 500 `InternalError`.

This is why every file looked fine in the dashboard (dashboard reads from the PostgreSQL `storage.objects` table), but every download/view failed at the filesystem level.

### Stage 3 — Why It Took So Long to Diagnose

The dashboard reads metadata from the database, not from disk. So when browsing buckets in the Supabase UI, you see correct filenames, sizes, types, and creation dates — all from the DB. Only when you actually try to **serve** a file does the storage backend touch the filesystem and discover the missing xattrs.

---

## What Was Lost Permanently

The `storage_export` backup was taken approximately 2 weeks before the outage. Any files uploaded after that snapshot was taken were **not in the backup** and could not be recovered.

**43 files permanently lost**, primarily:
- Lesson plan documents uploaded in late April 2026 (by ~10 instructors)
- 2–3 recent profile photos
- 3 recent school logo/signature/stamp uploads  
- 7 Robokorda website images

These files must be **re-uploaded manually** by affected users.

---

## How It Was Fixed

### Fix 1 — File Byte Restore (Session 1, May 6)

Script: `/root/restore_storage.sh`

Queried `storage.objects` for `(bucket_id, name, version)` tuples, located matching files in `/root/migrations/storage_export/`, and copied them to the correct volume path:

```
/root/supabase/docker/volumes/storage/stub/stub/{bucket_id}/{name}/{version_uuid}
```

Result: **1.2GB restored** (from 33MB). But files still errored because xattrs were missing.

### Fix 2 — Database URL Migration (Session 1, May 6)

The database still had hardcoded URLs pointing to the old Supabase cloud project (`rrmlbuolcfrpnfvbhagb.supabase.co`, now inactive). Fixed with `REPLACE()` SQL:

```sql
UPDATE robocore.users SET
  profile_image_url = REPLACE(profile_image_url, 'https://rrmlbuolcfrpnfvbhagb.supabase.co', 'https://api.robokorda.duckdns.org'),
  avatar_url = REPLACE(avatar_url, 'https://rrmlbuolcfrpnfvbhagb.supabase.co', 'https://api.robokorda.duckdns.org')
WHERE profile_image_url LIKE '%rrmlbuolcfrpnfvbhagb%'
   OR avatar_url LIKE '%rrmlbuolcfrpnfvbhagb%';
-- 18 rows
```

Same pattern applied to `robocore.schools` (14 rows), `robocore.gallery_items` (229 rows).

Lesson plan signed URLs were re-generated using the self-hosted JWT key:  
Script: `/root/migrations/resign_lesson_plans.js` → **75/75 fixed**

### Fix 3 — xattr Restore (Session 2, May 7)

Script: `/root/fix_xattrs.sh`

Read `mimetype`, `cacheControl`, and `eTag` from `storage.objects.metadata` (JSON column in PostgreSQL), then used `setfattr` to write all three xattrs onto each physical file:

```bash
# Core logic inside fix_xattrs.sh
setfattr -n "user.supabase.content-type" -v "$mimetype" "$filepath"
setfattr -n "user.supabase.cache-control" -v "$cache_control" "$filepath"
setfattr -n "user.supabase.etag" -v "$etag" "$filepath"
```

Result: **549 files fixed**, 0 errors. All buckets returned HTTP 200 immediately.

---

## Verification

After `fix_xattrs.sh`:

```bash
# Check xattrs are set
getfattr -d /root/supabase/docker/volumes/storage/stub/stub/gallery/gallery/0054b292-.../1774546062129-qn3y9898hb.jpeg/bd71e9ab-...
# user.supabase.cache-control="max-age=3600"
# user.supabase.content-type="image/jpeg"
# user.supabase.etag="a5917c7719750abbef4a5439f3a8adfe"

# HTTP test
curl -s -o /dev/null -w "%{http_code}" https://api.robokorda.duckdns.org/storage/v1/object/public/gallery/...
# 200
```

---

## Prevention

### Immediate Actions Taken
- RLS enabled on all 20 previously unprotected `robocore` tables
- All DB URLs corrected from old cloud to self-hosted

### Recommended Actions (Not Yet Done)

1. **Set up automated storage backups with xattrs preserved:**
   ```bash
   # Use tar with xattr support, not rsync or cp
   # Add to crontab (run weekly):
   tar --xattrs -czf /root/backups/storage_$(date +%Y%m%d).tar.gz \
     /root/supabase/docker/volumes/storage/
   ```
   `rsync` and `cp` do NOT preserve xattrs by default. Use `tar --xattrs` or `rsync -X`.

2. **Never run `docker compose down -v` on production.** Alias it away:
   ```bash
   alias "docker compose down -v"="echo 'BLOCKED: this destroys volumes. Use docker compose down without -v.'"
   ```

3. **Store the `fix_xattrs.sh` script** — if restore ever needs to be done again, run this immediately after copying files.

4. **Set backup retention** — the `storage_export` was weeks old. A weekly automated backup with a 4-week rotation would have recovered the 43 lost files.

---

## Infrastructure Reference

| Item | Value |
|------|-------|
| Server | `root@vmi3263043` — IP `178.238.227.229` |
| Self-hosted API | `https://api.robokorda.duckdns.org` |
| Old cloud (inactive) | `https://rrmlbuolcfrpnfvbhagb.supabase.co` |
| Storage volume path | `/root/supabase/docker/volumes/storage/stub/stub/` |
| File path format | `{volume}/{bucket_id}/{name}/{version_uuid}` |
| Backup export | `/root/migrations/storage_export/` |
| DB schema | `robocore` (not `public`) |
| Storage container | `supabase-storage` |
| DB container | `supabase-db` |
| Compose directory | `~/supabase/docker/` |

---

## Scripts Created During Recovery

| Script | Location on Server | Purpose |
|--------|-------------------|---------|
| `restore_storage.sh` | `/root/restore_storage.sh` | Restores file bytes from backup export to volume |
| `fix_xattrs.sh` | `/root/fix_xattrs.sh` | Reads metadata from DB, sets xattrs on all files |
| `resign_lesson_plans.js` | `/root/migrations/resign_lesson_plans.js` | Re-signs all lesson plan signed URLs with self-hosted JWT |
