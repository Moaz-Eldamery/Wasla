# Events (outbox)

How modules publish events: the transactional outbox (`core.outbox_events`) and the poller that reads new rows and hands them to in-process handlers (realtime, notifications).

**Rule:** An event is saved in the same transaction as the change it describes.

## Files

_None yet._ Filled by KAN-27.
