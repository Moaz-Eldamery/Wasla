# Queue & check-in module (IQueue)

Check-in, call next, visit status, queue position, no-shows, the wait estimate.

**Rule:** Other modules use this one only through its public service. Only the allowed status changes in `business.md` go through.

## Files

- `queue.module.ts`: the module. Exports `QueueService` (IQueue). Imports the appointments module for `AppointmentsService.view()`.
- `queue.service.ts`: check-in (BOOKED → CHECKED_IN), call next (CHECKED_IN → IN_CONSULTATION), complete (IN_CONSULTATION → COMPLETED), the clinic queue board and a patient's people-ahead count, with the record-owner checks. A status only changes if it is still the expected one, so simultaneous changes can't both go through; call next also holds a per-doctor lock. Test: `queue.service.spec.ts`.
- `queue.controller.ts`: `POST /appointments/{id}/check-in`, `/doctors/me/queue/call-next`, `/appointments/{id}/complete`, `GET /clinics/{id}/queue`, `/appointments/{id}/queue-position`.
- `queue.views.ts`: the queue response shapes from the contract, and the Prisma select that loads a queue item.
- `dto/queue.dto.ts`: the call-next request body, validated with class-validator.

Still to come: no-shows and the wait estimate (KAN-26).
