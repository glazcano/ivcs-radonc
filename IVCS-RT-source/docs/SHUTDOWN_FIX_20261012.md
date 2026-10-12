# Intermittent shutdown — 2026-10-12

The Windows push job failed after acknowledging shutdown while the matching
pull-request job passed. Instrumented run `38309102039`, Windows job
`115010203840`, reproduced the failure: the listener was closed (`listening:
false`) but the server's close callback never completed. An existing HTTP
keep-alive connection continued serving all 40 status probes with HTTP 200.
Browser traces also showed the probes being aborted after their headers had
already resolved. This was a real connection-drain problem, not an assertion
that simply needed more time.

Application control responses now use `Connection: close`, so status/shutdown
requests cannot keep reusing a pre-shutdown connection. Other in-flight requests
are allowed to finish; no forced socket destruction or process kill is added.

The UI consumes each status response body before retrying. A timeout, HTTP
failure or interrupted body is not treated as proof of server exit. Only a
network failure before headers, while the probe signal remains un-aborted,
confirms that the endpoint is unreachable. The individual probe timeout is
2.5 seconds, allowing Windows to report refusal instead of aborting the attempt
prematurely at 500 ms. The existing attempt limit remains 40.

Regressions cover complete-body consumption, connection refusal, HTTP errors,
body failure and timeout/abort false positives. Existing tests retain their
checks that pending requests drain without losing work and that the production
Node process exits and removes its own PID marker. The exit browser test runs
three save/discard cycles per platform and asserts the actual server close
callback, with connection/request traces on failure.

Only synthetic data is used. Cross-platform validation must include both push
and pull-request jobs for the corrected commit; one green duplicate does not
override a failing one.
