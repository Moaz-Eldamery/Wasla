# Appointments module (IAppointments)

Slots, booking, cancel and reschedule, walk-ins, follow-ups.

**Rule:** Other modules use this one only through its public service. A slot never has more than one active booking.

## Files

- `appointments.module.ts`: the module. Exports `AppointmentsService` (IAppointments).
- `appointments.service.ts`: browsing (departments, doctors, free slots), booking, and seeing appointments, with the record-owner checks. `view()` gives other modules the contract's Appointment shape after they've checked the caller themselves. Test: `appointments.service.spec.ts`.
- `catalog.controller.ts`: `GET /departments`, `/departments/{id}/doctors`, `/doctors/{id}/slots`.
- `appointments.controller.ts`: `POST /appointments`, `GET /me/appointments`, `/appointments/{id}`, `/me/clinics`, `/clinics/{id}/appointments`.
- `appointment.views.ts`: the response shapes from the contract, and the Prisma selects that load them. The clinic shape comes from `shared/clinic.views.ts`.
- `dto/booking.dto.ts`: request bodies and query parameters, validated with class-validator.

Still to come: cancel and reschedule, staff slot management (KAN-25), walk-ins (KAN-37), follow-ups (KAN-40).
