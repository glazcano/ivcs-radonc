# Application shutdown — 20260923

The header includes **Close application / Cerrar programa**. Its confirmation offers Save and close, Close without saving (only for unsaved changes), and Cancel. A failed save leaves the application and server running, with the error visible. Current operations and open editing dialogs must finish first. Saving remains manual.

The application checks for other responding IVCS RT windows on the same browser origin, including the library manager, before requesting shutdown. Save and close those windows first. Detached tools and image panels belong to the same workspace and close with it. The peer check uses BroadcastChannel: another browser, a different origin, or a suspended tab might not respond, so the dialog also explicitly warns that stopping the server affects every window.

## Browser close button

Closing, refreshing or navigating away triggers the browser's native confirmation while the local server is available, or when there are unsaved changes/operations. Cancelling that confirmation reveals the IVCS RT close dialog explaining saving and server shutdown. Accepting native navigation does not save or stop Node. Closing the browser forcibly cannot be intercepted reliably.

Browsers allow only their generic text in the native confirmation, normally after user interaction. They also restrict `window.close()` on tabs not opened by script. After the explicit shutdown request, IVCS RT attempts to close its window; if refused, a final screen tells the user to close the tab manually. These are browser constraints, not settings IVCS RT can override:

- [beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
- [window.close](https://developer.mozilla.org/en-US/docs/Web/API/Window/close)

No shutdown beacon, unload autosave or inactivity timeout was introduced. In particular, reloading the viewer never stops Node automatically.

## Server implementation

Production and Vite development servers expose `/api/application/status` and an explicit POST `/api/application/shutdown`. The POST requires the process-specific token returned by status, the application's custom header, an accepted loopback Host and same-origin Origin when supplied. Responses are not cached. The server acknowledges the request, stops accepting new requests and drains existing work. There is no forced `process.exit()` that could truncate a save. The production process removes its own PID marker on exit, only when the marker still belongs to that process.

The portable Stop launcher uses this graceful endpoint when available and retains its legacy fallback for older servers. Older running/bundled servers need to be updated and restarted to expose this endpoint. Existing release archives were not regenerated.

## Validation

- TypeScript and production Vite build pass.
- Automated tests reject foreign-origin requests, missing headers and incorrect tokens, and verify draining of an in-flight request.
- A real child Node process starts from an isolated temporary folder, accepts shutdown, exits with code 0 and removes its PID marker.
- Edge browser tests with synthetic images verify native close cancellation, the custom dialog, other-window protection, save failure keeping Node available, save-and-close persistence, discard-and-close preserving the last saved state, and the final screen when browser tab closing is refused.

Tests: `tests/application-shutdown.test.ts`, `tests/application-exit-browser.mts`. No patient data or existing release packages were changed.
