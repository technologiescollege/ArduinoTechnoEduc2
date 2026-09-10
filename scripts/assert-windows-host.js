//@ts-check
/**
 * Cross-packaging Linux → Windows is not supported: native modules (.node) and
 * arduino-cli would be Linux ELF binaries, so the Windows app shows a blank UI.
 * Official CI builds on windows-latest (.github/workflows/build-win-x64-zip.yml).
 */
if (process.platform !== 'win32') {
  console.error(`
ERROR: yarn build:win:x64 must run on Windows (or GitHub Actions windows-latest).

Current host: ${process.platform}/${process.arch}

Packaging from Linux embeds Linux binaries (arduino-cli, keytar, drivelist, …).
On Windows the IDE then fails to start (blank splash / white screen).

Options:
  1) Build on a Windows machine with Node 18–20 + yarn
  2) Trigger: .github/workflows/build-win-x64-zip.yml (workflow_dispatch)
`);
  process.exit(1);
}
