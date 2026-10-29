# Optional GCP backup for cron-job.org: Cloud Scheduler → GitHub workflow_dispatch.
# Free-tier friendly (Scheduler has a free job allowance); scrape still runs on Actions.
#
# Usage:
#   $env:GITHUB_DISPATCH_PAT = "github_pat_…"
#   .\scripts\setup-gcp-github-dispatch-cron.ps1
#
# Schedule: 07:00 Asia/Kolkata daily.

param(
  [string]$Pat = $env:GITHUB_DISPATCH_PAT,
  [string]$Project = "job-finder-cb11a",
  [string]$Location = "asia-south1",
  [string]$SecretId = "github-dispatch-pat",
  [string]$JobName = "jobfinder-github-daily-fetch",
  [string]$Owner = "DevenderAmbati",
  [string]$Repo = "jobfinder",
  [string]$Workflow = "daily-fetch.yml"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Pat)) {
  Write-Error "Set GITHUB_DISPATCH_PAT first. See docs/CRON_JOB_ORG.md"
}

gcloud config set project $Project | Out-Null
gcloud services enable secretmanager.googleapis.com cloudscheduler.googleapis.com --quiet

$secretExists = $false
try {
  gcloud secrets describe $SecretId --project=$Project 2>$null | Out-Null
  $secretExists = $true
} catch {
  $secretExists = $false
}

if (-not $secretExists) {
  $Pat | gcloud secrets create $SecretId --project=$Project --data-file=-
} else {
  $Pat | gcloud secrets versions add $SecretId --project=$Project --data-file=-
}

$token = (gcloud secrets versions access latest --secret=$SecretId --project=$Project).Trim()
$uri = "https://api.github.com/repos/$Owner/$Repo/actions/workflows/$Workflow/dispatches"

# Recreate job so headers/body stay in sync
gcloud scheduler jobs delete $JobName --location=$Location --project=$Project --quiet 2>$null

gcloud scheduler jobs create http $JobName `
  --project=$Project `
  --location=$Location `
  --schedule="0 7 * * *" `
  --time-zone="Asia/Kolkata" `
  --uri=$uri `
  --http-method=POST `
  --headers="Authorization=Bearer $token,Accept=application/vnd.github+json,X-GitHub-Api-Version=2022-11-28,Content-Type=application/json,User-Agent=jobfinder-gcp-scheduler" `
  --message-body="{\"ref\":\"main\"}" `
  --attempt-deadline=30s

Write-Host "Created Scheduler job '$JobName' at 07:00 Asia/Kolkata."
Write-Host "Test: gcloud scheduler jobs run $JobName --location=$Location --project=$Project"
Write-Host "Note: PAT is stored in Secret Manager and copied into the job headers; rotate by re-running this script."
