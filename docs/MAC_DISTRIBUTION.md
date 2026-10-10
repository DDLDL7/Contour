# Mac distribution

Public distribution is currently blocked: this Mac has an Apple Development identity, but no Developer ID Application identity. No signed/notarised release is claimed.

The workflow follows [Tauri's macOS signing guidance](https://v2.tauri.app/distribute/sign/macos/). Install the Developer ID Application certificate and its private key in your keychain, and create a notarisation credential profile with `xcrun notarytool store-credentials` when your Apple account is ready. Do not put certificates, passwords or private keys in this repository.

Set `APPLE_SIGNING_IDENTITY` to the exact installed Developer ID Application identity and `CONTOUR_NOTARY_PROFILE` to the existing keychain profile name. Then run:

```sh
npm run release:mac -- --check
npm run release:mac
```

The first command checks the identity and authenticates the profile without submitting an app. The second runs the test suite and computation benchmarks, builds the application, verifies its signature and hardened runtime, submits an archive to Apple, staples the accepted ticket, validates it and runs Gatekeeper assessment. It stops on any failed step. The resulting ZIP and SHA-256 file are placed in the ignored `release/` directory. The architecture is included in the filename; this workflow does not claim a universal binary.

Before publishing, extract that ZIP on a second Mac, install it using Finder, launch it through the normal Gatekeeper path, then run the tasks in [STUDENT_TESTING.md](STUDENT_TESTING.md) with networking disabled. Verify project recovery and all native export paths there. An accepted notarisation submission does not replace an installation test.

The current Mac webview downloads project files, graph images and HTML/Markdown worksheets. When its popup printing path is unavailable, Print / PDF explains how to export HTML and print it in a browser. This fallback must remain visible; do not claim native worksheet printing passed just because HTML export succeeds.
