# Keep the personal Glowstack worker running on Windows

Run this once from PowerShell on the worker computer:

```powershell
cd C:\Users\brook\Documents\Glowstack
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Setup-GlowstackWorker.ps1
```

If the local `.env` has no worker configuration, setup asks for your live HTTPS
Glowstack address and your pairing credential from **Integrations > MCP worker**.
The credential input is hidden and saved only to the existing ignored `.env`.
Do not paste it into chat or a command line. Existing `.env` settings are retained.
If configuration is already present, setup keeps it; edit `.env` to change or
replace the pairing, then stop/start the task using the commands below.

Setup creates the **Glowstack AI Worker** Windows scheduled task for your Windows
account, using your existing Codex sign-in. It does not store your Windows password
or change the machine-wide PowerShell execution policy. If Windows denies task
registration, run the same setup command in PowerShell as administrator under the
same Windows account. Node, Codex and project dependencies must already be installed.

After setup, refresh **Integrations** in Glowstack. Once the worker is **Online**,
select **MCP** for Chat & Research and/or Media Processing. Close any older manually
started `npm run ai:worker` window with Ctrl+C so only the managed worker runs.

## What runs automatically

- A hidden launcher starts at Windows login and stays running while you are signed in.
- A five-minute recovery trigger restarts the launcher if it exits. Additional task
  instances are ignored; a named mutex also prevents duplicate managed launchers.
- When the worker exits, the launcher restarts it after 30 seconds, doubling the
  delay up to 15 minutes for repeated failures. A stable five-minute run resets the
  delay. A failed content job is not automatically resubmitted.
- The task can run on battery and while the screen is locked. It has no default
  three-day execution cutoff. It runs with normal user privileges.
- Codex's installed executable is rediscovered on worker restart, including after
  desktop updates change its versioned installation folder.
- Launch status and logs are in `.local/worker/`. The previous four worker log pairs
  are retained on restart. `running` means the process exists; Glowstack's Online
  indicator is the check for actual connectivity.

## Keep the computer available

Stay signed in and keep internet connected. For long sessions, plug the computer
in and set **Windows Settings > System > Power & battery > Screen, sleep & hibernate
timeouts > plugged-in sleep** to **Never**, if you want it to remain available.
Display timeout can stay enabled. A laptop may still sleep when its lid closes.
Setup does not change these power settings automatically or wake a sleeping machine.

Sleep, shutdown, signing out, expired authentication, and exhausted Codex allowance
can interrupt processing. The worker reconnects through the restart/recovery cycle
when conditions recover. An expired login needs `codex login` as the same Windows
user. Retrying never switches to paid API billing. The existing short-lived job
queue still expires requests during outages; submit a new request after reconnection.

## Manage the worker

Run from the Glowstack directory. Stop disables scheduled triggers and shuts down
the managed worker's process tree; it may interrupt an in-progress job. Start
reenables scheduled triggers. Uninstall removes the scheduled task but retains
the local credential and logs.

```powershell
# See task and launcher status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Setup-GlowstackWorker.ps1 -Action Status

# Stop until you explicitly start it again
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Setup-GlowstackWorker.ps1 -Action Stop

# Start/re-enable (also useful after editing .env)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Setup-GlowstackWorker.ps1 -Action Start

# Remove automatic startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Setup-GlowstackWorker.ps1 -Action Uninstall
```

To update the code, stop the task, update the checkout and dependencies as needed,
then start it again. Keep this checkout at the same location used during install.
If you move it, uninstall the old task first and reinstall from the new location.

References: [Windows task settings](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset)
and [task identity](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal).
