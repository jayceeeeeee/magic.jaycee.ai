$ErrorActionPreference = 'Stop'
& .\.tools\deno.exe run --allow-read scripts/build-master-picker.ts --check
if ($LASTEXITCODE -ne 0) { throw 'MCP UI artifact is stale' }
& .\.tools\deno.exe run --allow-read --allow-write=.tools tests/mcp-ui.ts
if ($LASTEXITCODE -ne 0) { throw 'Could not build UI harness' }
$taskDir = Join-Path (Get-Location) '.tools'
$process = Start-Process 'C:/Program Files/Google/Chrome/Application/chrome.exe' -ArgumentList @('--headless','--disable-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=10000','--dump-dom',('--user-data-dir='+(Join-Path $taskDir 'master-picker-test-profile')),('file:///'+(Join-Path $taskDir 'master-picker-browser.html').Replace('\','/'))) -RedirectStandardOutput (Join-Path $taskDir 'master-picker-browser-result.txt') -RedirectStandardError (Join-Path $taskDir 'master-picker-browser-errors.txt') -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(20000)) { Stop-Process -Id $process.Id; throw 'UI test timed out' }
$output = Get-Content (Join-Path $taskDir 'master-picker-browser-result.txt') -Raw
if ($output -notmatch '<body[^>]*>PASS:') { throw ($output -replace '<script>[\s\S]*?</script>', '') }
Write-Output ($output -replace '<[^>]+>', '').Trim()
$preview = Start-Process 'C:/Program Files/Google/Chrome/Application/chrome.exe' -ArgumentList @('--headless','--disable-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=2000','--window-size=430,820',('--screenshot='+(Join-Path $taskDir 'master-picker-preview.png')),('--user-data-dir='+(Join-Path $taskDir 'master-picker-preview-profile')),('file:///'+(Join-Path $taskDir 'master-picker-preview.html').Replace('\','/'))) -WindowStyle Hidden -PassThru
if (-not $preview.WaitForExit(20000)) { Stop-Process -Id $preview.Id; throw 'UI preview timed out' }
