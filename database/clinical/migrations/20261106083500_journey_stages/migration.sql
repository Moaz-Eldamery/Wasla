-- Seed the six journey stages and their bilingual titles, next steps and
-- locations (KAN-12). Stored in core.journey_stages so stages and messages are
-- data, not hard-coded in the services or apps.
INSERT INTO "core"."journey_stages" (
  "code",
  "sort_order",
  "title_ar",
  "title_en",
  "next_step_ar",
  "next_step_en",
  "location"
) VALUES
  (
    'BOOKED',
    1,
    'تم حجز الموعد',
    'Appointment booked',
    'توجه إلى الاستقبال لتسجيل الحضور في يوم موعدك',
    'Go to the clinic reception to check in on the day of your appointment',
    'APPOINTMENT_CLINIC'
  ),
  (
    'CHECKED_IN',
    2,
    'تم تسجيل الحضور',
    'Checked in',
    'انتظر في منطقة الانتظار حتى ينادي الطبيب اسمك',
    'Wait at the clinic waiting area until the doctor calls you',
    'APPOINTMENT_CLINIC'
  ),
  (
    'WITH_DOCTOR',
    3,
    'مع الطبيب',
    'With the doctor',
    'أنت الآن في الكشف مع الطبيب',
    'You are now in consultation with the doctor',
    'APPOINTMENT_CLINIC'
  ),
  (
    'TEST_ORDERED',
    4,
    'تم طلب فحص',
    'Test ordered',
    'توجه إلى عيادة الفحص لإجراء الفحص المطلوب',
    'Go to the test clinic to complete the ordered test',
    'TEST_CLINIC'
  ),
  (
    'RESULT_READY',
    5,
    'النتيجة جاهزة',
    'Result ready',
    'اعتمد الطبيب نتيجة الفحص ويمكنك الاطلاع عليها الآن',
    'Your doctor released the test result and you can view it now',
    'APPOINTMENT_CLINIC'
  ),
  (
    'DONE',
    6,
    'انتهت الزيارة',
    'Visit completed',
    'اكتملت زيارتك، نتمنى لك دوام الصحة والعافية',
    'Your visit is complete',
    'NONE'
  )
ON CONFLICT ("code") DO UPDATE SET
  "sort_order" = EXCLUDED."sort_order",
  "title_ar" = EXCLUDED."title_ar",
  "title_en" = EXCLUDED."title_en",
  "next_step_ar" = EXCLUDED."next_step_ar",
  "next_step_en" = EXCLUDED."next_step_en",
  "location" = EXCLUDED."location";
