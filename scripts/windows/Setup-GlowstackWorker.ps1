[CmdletBinding()]
param(
    [ValidateSet('Install', 'Start', 'Stop', 'Status', 'Uninstall')][string]$Action = 'Install',
    [switch]$SkipConfiguration
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskName = 'Glowstack AI Worker'
$launcher = Join-Path $PSScriptRoot 'Run-GlowstackWorker.ps1'
$stateDir = Join-Path $projectRoot '.local\worker'
$stopFile = Join-Path $stateDir 'STOP'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Get-OwnTask {
    # Let permissions/service errors surface instead of treating them as missing tasks.
    $task = Get-ScheduledTask | Where-Object { $_.TaskName -eq $taskName -and $_.TaskPath -eq '\' } | Select-Object -First 1
    if ($task -and -not ($task.Actions.Arguments -like "*$launcher*")) { throw 'A different Glowstack task already exists. Inspect it in Task Scheduler before replacing it.' }
    return $task
}
function Save-EnvValue([string]$Name, [string]$Value) {
    $path = Join-Path $projectRoot '.env'
    $lines = if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllLines($path) } else { @() }
    $lines = @($lines | Where-Object { $_ -notmatch "^\s*$Name\s*=" })
    $lines += "$Name=$Value"
    [IO.File]::WriteAllLines($path, $lines, (New-Object Text.UTF8Encoding($false)))
}
function Has-Configuration {
    $path = Join-Path $projectRoot '.env'
    if (-not (Test-Path -LiteralPath $path)) { return $false }
    $text = [IO.File]::ReadAllText($path)
    return ($text -match '(?m)^\s*GLOWSTACK_WORKER_TOKEN\s*=\s*["'']?[\w-]+\.[\w-]{43}' -and $text -match '(?m)^\s*GLOWSTACK_URL\s*=\s*["'']?https?://')
}
function Stop-OwnWorker {
    $task = Get-OwnTask
    if ($task) { Disable-ScheduledTask -TaskName $taskName | Out-Null }
    Set-Content -LiteralPath $stopFile -Value 'Stopped by the user.'
    if ($task -and $task.State -eq 'Running') {
        for ($index = 0; $index -lt 10; $index++) {
            Start-Sleep -Seconds 1
            if ((Get-OwnTask).State -ne 'Running') { break }
        }
        Stop-ScheduledTask -TaskName $taskName
    }
}

if ($Action -eq 'Status') {
    $task = Get-OwnTask
    if ($task) {
        $info = Get-ScheduledTaskInfo -TaskName $taskName
        Write-Host "Task: $taskName ($($task.State))"
        Write-Host "Last run: $($info.LastRunTime); result: $($info.LastTaskResult); next check: $($info.NextRunTime)"
    }
    else { Write-Host 'Automatic startup is not installed.' }
    $status = Join-Path $stateDir 'status.json'
    if (Test-Path -LiteralPath $status) { Get-Content -LiteralPath $status }
    Write-Host "Logs: $stateDir"
    Write-Host 'The launcher running does not guarantee an online connection. Check Integrations in Glowstack.'
    exit
}
if ($Action -eq 'Stop' -or $Action -eq 'Uninstall') {
    Stop-OwnWorker
    if ($Action -eq 'Uninstall' -and (Get-OwnTask)) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    Write-Host 'Worker stopped. Automatic startup is disabled. Credentials and logs are retained.'
    exit
}
if ($Action -eq 'Start') {
    if (-not (Get-OwnTask)) { throw 'Run this script with -Action Install first.' }
    if (-not (Has-Configuration)) { throw 'Run this script with -Action Install to enter the URL and pairing credential.' }
    Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Host 'Worker startup requested. Check Glowstack Integrations after about 15 seconds.'
    exit
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\dotenv'))) { throw 'Run npm ci in the Glowstack project first.' }
if (-not $SkipConfiguration -and -not (Has-Configuration)) {
    Write-Host 'Open the live Glowstack site > Integrations > MCP worker > Create pairing credential.'
    $siteText = ''
    $envPath = Join-Path $projectRoot '.env'
    if (Test-Path -LiteralPath $envPath) {
        $existingEnv = [IO.File]::ReadAllText($envPath)
        if ($existingEnv -match '(?m)^\s*GLOWSTACK_URL\s*=\s*([^\r\n]+)') { $siteText = $Matches[1].Trim().Trim('"', "'").TrimEnd('/') }
        $existingEnv = $null
    }
    if (-not $siteText) { $siteText = (Read-Host 'Live Glowstack website address (https://...)').Trim().TrimEnd('/') }
    else { Write-Host "Using saved Glowstack address: $siteText" }
    $site = $null
    if (-not [Uri]::TryCreate($siteText, [UriKind]::Absolute, [ref]$site) -or $site.Scheme -ne 'https' -or $site.UserInfo -or $site.Query -or $site.Fragment) { throw 'Enter an HTTPS website address without credentials, query parameters or a fragment.' }
    $secureToken = Read-Host 'Paste the worker pairing credential (hidden)' -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $pairingToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
        if ($pairingToken -notmatch '^[\w-]+\.[\w-]{43}$') { throw 'That does not look like a Glowstack worker pairing credential.' }
        Save-EnvValue 'GLOWSTACK_URL' $site.GetLeftPart([UriPartial]::Authority)
        Save-EnvValue 'GLOWSTACK_WORKER_TOKEN' $pairingToken
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
        $pairingToken = $null
        $secureToken.Dispose()
    }
    Write-Host 'Connection saved to the ignored local .env file.'
}

$existing = Get-OwnTask
if ($existing) { Stop-OwnWorker }
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskAction = New-ScheduledTaskAction -Execute $powershellPath -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`"" -WorkingDirectory $projectRoot
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$recoveryTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger @($logonTrigger, $recoveryTrigger) -Principal $principal -Settings $settings -Description 'Glowstack personal AI worker: hidden at login, delayed restarts, current-user ChatGPT authentication. No API fallback.' -Force | Out-Null
Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
if (Has-Configuration) {
    Start-ScheduledTask -TaskName $taskName
    Write-Host 'Installed and startup requested. Check Integrations for Online, then select MCP for the desired engines.'
} else {
    Write-Host 'Automatic startup installed. Run this script again without -SkipConfiguration to enter the URL and pairing credential.'
}
Write-Host 'Runs while you are signed in, including when the screen is locked. Sleep, shutdown and signing out interrupt it.'
Write-Host "Logs: $stateDir"
