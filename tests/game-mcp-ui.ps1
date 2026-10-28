$ErrorActionPreference = 'Stop'
& .\.tools\deno.exe run --allow-read scripts/build-master-picker.ts --check
if ($LASTEXITCODE -ne 0) { throw 'MCP UI artifacts are stale' }
& .\.tools\deno.exe run --allow-read --allow-write=.tools tests/game-mcp-ui.ts
if ($LASTEXITCODE -ne 0) { throw 'Could not build game harness' }
$taskDir = Join-Path (Get-Location) '.tools'
$chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$process = Start-Process $chrome -ArgumentList @('--headless','--disable-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=22000','--dump-dom',('--user-data-dir='+(Join-Path $taskDir 'game-mcp-test-profile')),('file:///'+(Join-Path $taskDir 'game-mcp-browser.html').Replace('\','/'))) -RedirectStandardOutput (Join-Path $taskDir 'game-mcp-result.txt') -RedirectStandardError (Join-Path $taskDir 'game-mcp-errors.txt') -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(45000)) { Stop-Process -Id $process.Id; throw 'Game UI test timed out' }
$output = Get-Content (Join-Path $taskDir 'game-mcp-result.txt') -Raw
if ($output -notmatch '<body[^>]*>PASS:') { throw ($output -replace '<script>[\s\S]*?</script>', '') }
Write-Output ($output -replace '<[^>]+>', '').Trim()
$preview = Start-Process $chrome -ArgumentList @('--headless','--disable-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=4000','--window-size=430,1050',('--screenshot='+(Join-Path $taskDir 'game-mcp-preview.png')),('--user-data-dir='+(Join-Path $taskDir 'game-mcp-preview-profile')),('file:///'+(Join-Path $taskDir 'game-mcp-preview.html').Replace('\','/'))) -WindowStyle Hidden -PassThru
if (-not $preview.WaitForExit(20000)) { Stop-Process -Id $preview.Id; throw 'Game preview timed out' }
