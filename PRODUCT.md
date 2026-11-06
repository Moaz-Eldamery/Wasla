# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The staff website (`apps/hospital-dashboard`) is the web surface this file mainly serves. The patient app (`apps/patient-app`) is a native React Native + Expo app; its screens follow the implementation Ysalem already built in KAN-14 and KAN-15.

## Users

- **Receptionists** at a clinic's front desk. They check patients in and watch the queue board, one patient after another, all day. They must never see medical details.
- **Doctors** in the consultation room, between and during visits. They call the next patient, write visit notes, order tests and release results.
- **Lab and radiology staff** at their bench. They work through the tests ordered for their department and upload result files.
- **Hospital admins** in an office. They manage staff and their roles, set up departments and clinics, read the statistics and the audit log, and ask the AI assistant about hospital information. They must never see medical records.
- **Patients** (mobile app). They book visits, follow their place in the queue and their journey, and read results their doctor has released.

Staff use **desktop PCs and tablets**. Doctors may move around with a tablet, so every staff screen has to work with touch at about 768px wide as well as with a mouse and keyboard.

## Product Purpose

Wasla runs a patient's visit inside one hospital, from booking through check-in, queue, consultation and tests to released results. Every step is visible to the patient and to the staff member responsible for it. Success means staff move patients through a visit without paperwork or guessing, and patients always know where they are and what comes next.

## Positioning

One system follows the visit from start to finish. The patient's app and the staff website show the same appointment as it moves through `BOOKED → CHECKED_IN → IN_CONSULTATION → COMPLETED`. Each role sees exactly its part of the visit and nothing more.

## Operating Context

- Rules, roles and status flows are in `business.md`. The API both apps use is `contracts/openapi.yaml`, and every request goes through the gateway.
- Staff log in with a phone number and password. A staff account can hold several roles, for example `DOCTOR,RECEPTIONIST`.
- Receptionists, doctors and lab staff work in the clinics they're assigned to (`GET /me/clinics`).
- Live updates (KAN-27) aren't built yet, so screens refresh on their own or on demand.

## Capabilities and Constraints

- **Arabic and English everywhere**, with right-to-left layout for Arabic. The staff website **opens in English** and can be switched to Arabic.
- **Times** are stored in UTC and shown in Africa/Cairo time.
- **Fake data only.** Never real patient data.
- **The AI is a helper and may be down.** Every screen except the chatbot must work without it, and the chatbot must say clearly when it's unavailable.
- **Results:** a patient only sees a result after the doctor releases it. Uploads are PDF or image files of at most 10 MB.
- **Backend status (2026-11-06):**
  - Auth, booking, check-in and queue have a real backend.
  - Visit notes, lab tests and results, and the chatbot (KAN-10, KAN-11, KAN-22) don't yet. Their screens are built against the contract and tested with `pnpm mock`, so they work unchanged once the backend lands.
  - The admin's staff, hospital setup, statistics and audit log screens (KAN-20) are built against a draft (`contracts/drafts/admin.yaml`) until KAN-36, KAN-39 and KAN-62 agree the endpoints.

## Brand Commitments

- **Name:** Wasla.
- **Shared look:** the staff website matches the patient app, so staff and patients see one product. That means the patient app's deep blue `#0B5CAB` as the brand color, on slate greys.

## Evidence on Hand

- **Demo data:** the generated demo data (KAN-13) gives every screen fake departments, clinics, doctors, staff and patients.
- **Nothing real:** no real hospital name, logo, patient data, testimonials or statistics exist. None may be invented as if they were real.

## Product Principles

1. **Each role sees its own work, and nothing it shouldn't.** Receptionist and admin screens show no medical details.
2. **The visit's status is the backbone.** Every screen shows where a visit is in its flow, and only allows the moves `business.md` permits.
3. **Fast, repeatable actions.** Check-in, call next and upload are things staff do dozens of times a day, so they take one obvious step.
4. **Say what isn't known.** Wait times are labelled as estimates, unreleased results say "waiting for review", and an AI that doesn't know says so.

## Accessibility & Inclusion

- Every screen works with the keyboard alone and with a screen reader.
- Layouts hold up in right-to-left Arabic and with large text.
- KAN-30 and KAN-31 check this formally later.
