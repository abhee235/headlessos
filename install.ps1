# M17.3: installs HeadlessOS on this PC, for this account: the latest release, checked against its
# SHA-256, installed by its own installer and started.
#
#   irm https://raw.githubusercontent.com/abhee235/headlessos/main/install.ps1 | iex
#
# No administrator rights. Run it again to update HeadlessOS. Your servers and settings live in
# %USERPROFILE%\.headlessos and %APPDATA%\headlessos-desktop, which this never touches.
#
# Files fetched this way are not marked as downloaded from the internet, so Windows runs the installer
# without SmartScreen's warning. The SHA-256 check is what makes sure it is the release's own file.
# @see docs/phases/phase-17.md

# All in one function, called on the last lines: a script cut short on its way here runs nothing.
function Install-HeadlessOS {
    $ErrorActionPreference = 'Stop'
    # Windows PowerShell draws a progress bar for each download, which slows it down a great deal.
    $ProgressPreference = 'SilentlyContinue'
    # GitHub takes TLS 1.2 only, which older Windows PowerShell does not offer by itself.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $repo = 'https://github.com/abhee235/headlessos'
    $docs = 'https://headlessos.com/docs/installation'

    if ($env:OS -ne 'Windows_NT') { throw "this script is for Windows. For macOS and Linux, see $docs" }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'HeadlessOS needs 64-bit Windows.' }
    $running = 'HeadlessOS is running. Close its window, then run this again.'

    # The latest release, from where GitHub sends /releases/latest. Not the API: it allows 60 calls an
    # hour per address, which a shared office or mobile network can use up.
    $page = Invoke-WebRequest -UseBasicParsing -Method Head -Uri "$repo/releases/latest"
    # Windows PowerShell gives the final address one way, PowerShell 7 another.
    $final = if ($page.BaseResponse.ResponseUri) { $page.BaseResponse.ResponseUri.AbsoluteUri } else { $page.BaseResponse.RequestMessage.RequestUri.AbsoluteUri }
    $tag = ([string]$final).TrimEnd('/').Split('/')[-1]
    if ($tag -notmatch '^v\d+\.\d+\.\d+$') { throw 'the latest release could not be found.' }
    $asset = "HeadlessOS.Setup.$($tag.Substring(1)).exe"

    # M17.11: the same version isn't installed twice. HEADLESSOS_REINSTALL=1 does it anyway, for a broken copy.
    $latest = $tag.Substring(1)
    $current = $null
    $entry = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'HeadlessOS*' -and $_.DisplayVersion } | Select-Object -First 1
    if ($entry) { $current = [string]$entry.DisplayVersion }
    else {
        $exe = Join-Path $env:LOCALAPPDATA 'Programs\headlessos-desktop\HeadlessOS.exe'
        if (Test-Path $exe) { $current = [string](Get-Item $exe).VersionInfo.ProductVersion }
    }
    if (($current -eq $latest -or $current -eq "$latest.0") -and $env:HEADLESSOS_REINSTALL -ne '1') {
        Write-Host "HeadlessOS $latest is already installed, and it's the latest release. Nothing to do."
        Write-Host 'To install it again anyway, run this first: $env:HEADLESSOS_REINSTALL = ''1'''
        return
    }
    if (Get-Process -Name 'HeadlessOS' -ErrorAction SilentlyContinue) { throw $running }

    $work = Join-Path ([IO.Path]::GetTempPath()) ('headlessos-' + [Guid]::NewGuid())
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        $sums = Join-Path $work 'SHA256SUMS'
        try { Invoke-WebRequest -UseBasicParsing -Uri "$repo/releases/download/$tag/SHA256SUMS" -OutFile $sums }
        catch { throw "release $tag has no SHA256SUMS, so its files can't be checked. Download it from $docs instead." }

        Write-Host "Downloading $asset, from release $tag..."
        $setup = Join-Path $work $asset
        Invoke-WebRequest -UseBasicParsing -Uri "$repo/releases/download/$tag/$asset" -OutFile $setup

        # A name may carry sha256sum's binary-mode mark, "*".
        $line = Get-Content $sums | Where-Object { ([string]($_ -split '\s+')[1]).TrimStart('*') -eq $asset } | Select-Object -First 1
        if (-not $line) { throw "the release's SHA256SUMS has no line for $asset." }
        $expected = ($line -split '\s+')[0].ToLowerInvariant()
        $actual = (Get-FileHash -Algorithm SHA256 -Path $setup).Hash.ToLowerInvariant()
        if ($expected -ne $actual) { throw "$asset does not match its SHA-256 in the release, so it was deleted." }
        Write-Host "Checked: its SHA-256 is the release's."

        # With GitHub's CLI signed in, also that the release workflow built this very file.
        if (Get-Command gh -ErrorAction SilentlyContinue) {
            gh auth status *> $null
            if ($LASTEXITCODE -eq 0) {
                gh attestation verify $setup --repo abhee235/headlessos *> $null
                if ($LASTEXITCODE -ne 0) { throw "GitHub could not confirm that the release workflow built $asset." }
                Write-Host "Checked: GitHub confirms the release workflow built it."
            }
        }

        if (Get-Process -Name 'HeadlessOS' -ErrorAction SilentlyContinue) { throw $running }
        # /S installs without questions, for this account only, where the installer always puts it.
        Write-Host 'Installing...'
        $installer = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
        if ($installer.ExitCode -ne 0) { throw "the installer stopped with code $($installer.ExitCode)." }
        # electron-builder's per-user folder is named after the package; the uninstall entry also says.
        $app = Join-Path $env:LOCALAPPDATA 'Programs\headlessos-desktop\HeadlessOS.exe'
        if (-not (Test-Path $app)) {
            $entry = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -like 'HeadlessOS*' -and $_.InstallLocation } | Select-Object -First 1
            if ($entry) { $app = Join-Path $entry.InstallLocation 'HeadlessOS.exe' }
        }
        if (-not (Test-Path $app)) { throw "the installer finished, but HeadlessOS.exe wasn't found." }
        Write-Host "Installed: $app"
        # M17.12: a shell that VS Code started (one of its tasks, or an AI assistant running in it) passes
        # on ELECTRON_RUN_AS_NODE=1, and HeadlessOS would start as plain Node and quit with no window.
        # It's cleared for the app only, and put back for the shell.
        $asNode = $env:ELECTRON_RUN_AS_NODE
        Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
        try { Start-Process -FilePath $app }
        finally { if ($null -ne $asNode) { $env:ELECTRON_RUN_AS_NODE = $asNode } }
    }
    finally {
        Remove-Item -Path $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Errors are said, not thrown: with `iex`, a script that exits would close the PowerShell window it runs in.
try { Install-HeadlessOS }
catch { Write-Host "HeadlessOS was not installed: $($_.Exception.Message)" -ForegroundColor Red }
