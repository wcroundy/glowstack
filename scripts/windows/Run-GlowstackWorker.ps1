[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$stateDir = Join-Path $projectRoot '.local\worker'
$stopFile = Join-Path $stateDir 'STOP'
$statusFile = Join-Path $stateDir 'status.json'
$launcherLog = Join-Path $stateDir 'launcher.log'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Write-WorkerStatus([string]$State, [string]$Detail) {
    @{ state = $State; detail = $Detail; updatedAt = (Get-Date).ToUniversalTime().ToString('o'); supervisorPid = $PID } |
        ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding UTF8
    if ((Test-Path -LiteralPath $launcherLog) -and (Get-Item -LiteralPath $launcherLog).Length -gt 1MB) {
        Move-Item -LiteralPath $launcherLog -Destination "$launcherLog.previous" -Force
    }
    Add-Content -LiteralPath $launcherLog -Value "$(Get-Date -Format o) $State - $Detail"
}
function Find-Executable([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and (Test-Path -LiteralPath $command.Source)) { return $command.Source }
    if ($Name -eq 'node.exe') {
        $candidate = Join-Path $env:ProgramFiles 'nodejs\node.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    if ($Name -eq 'codex.exe') {
        # Codex desktop updates install a new versioned bin directory.
        $binRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
        if (Test-Path -LiteralPath $binRoot) {
            $candidate = Get-ChildItem -LiteralPath $binRoot -Directory | Sort-Object LastWriteTime -Descending |
                ForEach-Object { Join-Path $_.FullName 'codex.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
            if ($candidate) { return $candidate }
        }
    }
    throw "$Name was not found. Install it, then start the worker again."
}
function Rotate-WorkerLog([string]$Path) {
    # Only these exact task-owned files are rotated; no recursive deletes.
    for ($index = 4; $index -ge 1; $index--) {
        $source = if ($index -eq 1) { $Path } else { "$Path.$($index - 1)" }
        if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination "$Path.$index" -Force }
    }
}

$hasher = [Security.Cryptography.SHA256]::Create()
$identity = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))).Replace('-', '').Substring(0, 16)
$hasher.Dispose()
$mutex = New-Object Threading.Mutex($false, "Local\GlowstackWorker-$identity")
$ownsMutex = $false
$supervisorStarted = $false
$workerProcess = $null
try {
    try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }
    if (Test-Path -LiteralPath $stopFile) { exit 0 }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
        Write-WorkerStatus 'needs-setup' 'Run Setup-GlowstackWorker.ps1 to configure the connection.'
        exit 2
    }
    $envText = [IO.File]::ReadAllText((Join-Path $projectRoot '.env'))
    if ($envText -notmatch '(?m)^\s*GLOWSTACK_WORKER_TOKEN\s*=\s*["'']?[\w-]+\.[\w-]{43}' -or
        $envText -notmatch '(?m)^\s*GLOWSTACK_URL\s*=\s*["'']?https?://') {
        Write-WorkerStatus 'needs-setup' 'The live URL or pairing credential is missing. Run Setup-GlowstackWorker.ps1.'
        exit 2
    }
    $envText = $null
    Set-Location -LiteralPath $projectRoot
    $supervisorStarted = $true
    $retrySeconds = 30
    while (-not (Test-Path -LiteralPath $stopFile)) {
        try {
            $nodePath = Find-Executable 'node.exe'
            # Discover on each launch; do not pin the versioned desktop installation path.
            $env:CODEX_BIN = Find-Executable 'codex.exe'
            $outLog = Join-Path $stateDir 'worker.log'
            $errLog = Join-Path $stateDir 'worker-error.log'
            Rotate-WorkerLog $outLog
            Rotate-WorkerLog $errLog
            $startedAt = Get-Date
            $workerProcess = Start-Process -FilePath $nodePath -ArgumentList @('"scripts/ai-worker.js"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
            $null = $workerProcess.Handle
            Write-WorkerStatus 'running' "Worker process $($workerProcess.Id) started. Check Glowstack Integrations for connection status."
            while (-not $workerProcess.HasExited -and -not (Test-Path -LiteralPath $stopFile)) { Start-Sleep -Seconds 2; $workerProcess.Refresh() }
            if (Test-Path -LiteralPath $stopFile) { break }
            $workerProcess.WaitForExit()
            $code = $workerProcess.ExitCode
            if ($null -eq $code) { $code = 'unknown' }
            $workerProcess = $null
            if (((Get-Date) - $startedAt).TotalMinutes -ge 5) { $retrySeconds = 30 }
            Write-WorkerStatus 'retrying' "Worker exited ($code). Retrying in $retrySeconds seconds; see worker-error.log."
        } catch {
            # No environment values or pairing credentials are written to status/logs.
            Write-WorkerStatus 'retrying' "Unable to start worker. Check Node/Codex installation and worker-error.log. Retrying in $retrySeconds seconds."
        }
        $until = (Get-Date).AddSeconds($retrySeconds)
        while ((Get-Date) -lt $until -and -not (Test-Path -LiteralPath $stopFile)) { Start-Sleep -Seconds 2 }
        $retrySeconds = [Math]::Min($retrySeconds * 2, 900)
    }
} finally {
    if ($workerProcess -and -not $workerProcess.HasExited) {
        # Stop only the process tree this launcher started, including its Codex child.
        & "$env:SystemRoot\System32\taskkill.exe" /PID $workerProcess.Id /T /F 2>$null | Out-Null
    }
    if ($ownsMutex) {
        if ($supervisorStarted) { Write-WorkerStatus 'stopped' 'Worker launcher stopped.' }
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
