INSTALLER REQUIREMENTS — THIN + FULL OFFLINE BUILD

Every release build must produce TWO installer files, not one:

1) THIN INSTALLER
- Small file size, with no bundled runtime prerequisites.
- Uses the WebView2 Evergreen Bootstrapper (downloads WebView2 from the internet if needed) — does not bundle the offline WebView2 runtime.
- Does not bundle the Visual C++ Redistributable.
- Intended for machines that already have the required runtimes installed, or where internet is available during setup.
- In tauri.conf.json: set `bundle.windows.webviewInstallMode.type` to `"downloadBootstrapper"`.

2) FULL / OFFLINE INSTALLER
- A single self-contained installer that bundles everything the target machine could need:
  - The full WebView2 Runtime as an offline installer (not the bootstrapper) — embedded inside the installer itself.
  - The Visual C++ Redistributable (2015–2022) — embedded inside the installer itself.
- In tauri.conf.json: set `bundle.windows.webviewInstallMode.type` to `"offlineInstaller"`.
- Add a custom NSIS hook that:
  1. Checks the Windows registry for an existing, compatible Visual C++ Redistributable.
  2. If missing or outdated, silently runs the bundled `vc_redist.x64.exe` with `/install /quiet /norestart`.
  3. Never prompts the user or requires an internet connection to complete this step.
- This is the default installer distributed to customers, because it must work reliably on any machine regardless of condition: offline, older hardware, or missing prerequisites.
- Expect this installer to be noticeably larger than the thin installer (roughly 150–250MB once WebView2 and the redistributable are embedded) — this is expected and acceptable. Reliability takes priority over installer size.

NAMING & BUILD OUTPUT
- Name the two output files clearly on every build, for example:
  - `CosmeticsPOS-Setup-Lite-vX.X.X.exe` (thin installer)
  - `CosmeticsPOS-Setup-Full-vX.X.X.exe` (full/offline installer)
- Both installers must ship the exact same application version and codebase. The only difference between them is which runtime prerequisites are bundled — never a difference in features or behavior inside the app itself.

TESTING (required, not optional)
- Test the thin installer on a machine that already has WebView2 and VC++ Redistributable installed.
- Test the full/offline installer on a clean virtual machine with no internet connection and no prerequisites pre-installed — it must install and run with zero errors and zero user-facing prompts about missing dependencies.
- Both installers must also pass the general Windows compatibility checklist already defined for this project (older/low-spec machine, no internet, limited user privileges, upgrade without data loss, uninstall/reinstall without data loss, printer installation).
