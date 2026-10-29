# Reliable daily trigger (cron-job.org → workflow_dispatch)

GitHub’s built-in `schedule:` cron is **best-effort** and can skip days.  
**cron-job.org** (free) pings GitHub every morning so **Daily fetch** runs like a manual **Run workflow**.

Cost: **₹0** on cron-job.org for one daily job. Scrape still uses free GitHub Actions minutes on this public repo.

## 1. Create a GitHub token (once)

1. Open: https://github.com/settings/personal-access-tokens/new  
   (Fine-grained PAT preferred)
2. Settings:
   - **Token name:** `jobfinder-daily-dispatch`
   - **Expiration:** 90 days (or custom; rotate before expiry)
   - **Repository access:** Only select repositories → `DevenderAmbati/jobfinder`
   - **Permissions → Repository:**
     - **Actions:** Read and write
     - **Contents:** Read-only (sometimes required)
3. Generate and **copy the token** (`github_pat_…`). Store it only in cron-job.org (not in the repo).

Classic PAT alternative: https://github.com/settings/tokens/new  
Scopes: `repo` (private) or `public_repo` + `workflow`.

## 2. Create the cron-job.org job

1. Sign up / log in at https://cron-job.org (free plan is enough).
2. **Create cronjob** with:

| Field | Value |
|--------|--------|
| Title | `Jobfinder daily fetch` |
| URL | `https://api.github.com/repos/DevenderAmbati/jobfinder/actions/workflows/daily-fetch.yml/dispatches` |
| Schedule | Every day at **07:00** Asia/Kolkata (or `30 1 * * *` UTC) |
| Request method | **POST** |
| Enable | Yes |

3. **Request headers** (custom):

```http
Authorization: Bearer YOUR_GITHUB_PAT_HERE
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

4. **Request body** (raw JSON):

```json
{"ref":"main"}
```

5. Save. Use **“Run now”** once to verify → a new run should appear under  
   https://github.com/DevenderAmbati/jobfinder/actions/workflows/daily-fetch.yml

## 3. Optional: keep GitHub `schedule` as backup

The workflow still has `schedule: '30 1 * * *'`. That is fine as a second chance if cron-job.org fails; at worst you get two runs (concurrency group `daily-fetch` will not cancel an in-progress run).

To avoid doubles, disable the GitHub schedule later by removing `schedule:` from [`.github/workflows/daily-fetch.yml`](../.github/workflows/daily-fetch.yml).

## 4. Test from your PC

```powershell
$env:GITHUB_DISPATCH_PAT = "github_pat_…"   # or ghp_…
.\scripts\dispatch-daily-fetch.ps1
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| HTTP 401/403 | Token expired or missing Actions write on this repo |
| HTTP 404 | Wrong repo/workflow path; must be default branch workflow |
| Job “success” but no Actions run | Check Authorization header is `Bearer …` (not token alone) |
| Two scrapes same day | Normal if both GitHub cron and cron-job.org fire; remove one |

## Security

- Do **not** commit the PAT.
- Prefer fine-grained, repo-scoped, short expiry.
- If the token leaks, revoke it on GitHub immediately.
