$ErrorActionPreference = 'Stop'
& .\.tools\deno.exe run --allow-read scripts/build-master-picker.ts --check
if ($LASTEXITCODE -ne 0) { throw 'MCP UI artifacts are stale' }
& .\.tools\deno.exe run --allow-read --allow-write=.tools tests/account-mcp-ui.ts
if ($LASTEXITCODE -ne 0) { throw 'Could not build Account harness' }
$taskDir = Join-Path (Get-Location) '.tools'
$chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$process = Start-Process $chrome -ArgumentList @('--headless','--disable-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=15000','--dump-dom',('--user-data-dir='+(Join-Path $taskDir 'account-mcp-test-profile')),('file:///'+(Join-Path $taskDir 'account-mcp-browser.html').Replace('\','/'))) -RedirectStandardOutput (Join-Path $taskDir 'account-mcp-result.txt') -RedirectStandardError (Join-Path $taskDir 'account-mcp-errors.txt') -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(30000)) { Stop-Process -Id $process.Id; throw 'Account UI test timed out' }
$output = Get-Content (Join-Path $taskDir 'account-mcp-result.txt') -Raw
if ($output -notmatch '<body[^>]*>PASS:') { throw ($output -replace '<script>[\s\S]*?</script>', '') }
Write-Output ($output -replace '<[^>]+>', '').Trim()
$preview = Start-Process $chrome -ArgumentList @('--headless','--disable-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=3000','--window-size=450,1500',('--screenshot='+(Join-Path $taskDir 'account-mcp-preview.png')),('--user-data-dir='+(Join-Path $taskDir 'account-mcp-preview-profile')),('file:///'+(Join-Path $taskDir 'account-mcp-preview.html').Replace('\','/'))) -WindowStyle Hidden -PassThru
if (-not $preview.WaitForExit(20000)) { Stop-Process -Id $preview.Id; throw 'Account preview timed out' }
