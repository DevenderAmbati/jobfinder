# Triggers GitHub Actions "Daily fetch" via workflow_dispatch (same as Run workflow).
# Usage:
#   $env:GITHUB_DISPATCH_PAT = "github_pat_…"
#   .\scripts\dispatch-daily-fetch.ps1
#
# Or: .\scripts\dispatch-daily-fetch.ps1 -Pat "github_pat_…"

param(
  [string]$Pat = $env:GITHUB_DISPATCH_PAT,
  [string]$Owner = "DevenderAmbati",
  [string]$Repo = "jobfinder",
  [string]$Workflow = "daily-fetch.yml",
  [string]$Ref = "main"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Pat)) {
  Write-Error @"
Missing PAT. Create a fine-grained token with Actions: Read and write on $Owner/$Repo, then:

  `$env:GITHUB_DISPATCH_PAT = 'github_pat_…'
  .\scripts\dispatch-daily-fetch.ps1

See docs/CRON_JOB_ORG.md
"@
}

$uri = "https://api.github.com/repos/$Owner/$Repo/actions/workflows/$Workflow/dispatches"
$headers = @{
  Authorization = "Bearer $Pat"
  Accept        = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent"  = "jobfinder-dispatch-script"
}
$body = @{ ref = $Ref } | ConvertTo-Json

Write-Host "POST $uri"
$response = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $body -ContentType "application/json"
Write-Host "Status: $($response.StatusCode) (204 = queued)"
Write-Host "Watch: https://github.com/$Owner/$Repo/actions/workflows/$Workflow"
