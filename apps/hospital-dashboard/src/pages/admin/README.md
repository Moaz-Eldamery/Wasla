# Admin pages

Screens for hospital admins: the AI chatbot; later staff, clinics and statistics.

**Rule:** No medical records on any admin screen.

## Files

- `ChatPage.tsx`: `/admin` (KAN-20), the hospital-information assistant.
  - **Asking:** ask in English or Arabic. Enter sends and Shift+Enter adds a line. Questions are limited to 1,000 characters.
  - **Answers:** each answer is written in the question's language and direction, with its sources underneath.
  - **When it can't answer:** "No information" and "assistant unavailable" (`503 AI_UNAVAILABLE`) each get a clear message, with **Ask again**.
  - **First visit:** an empty chat offers four example questions.
  - **History:** the conversation is kept for this tab only (sessionStorage). It's cleared by **New conversation**, by closing the tab or by logging out.
- `ChatPage.test.tsx`:
  - an answer with sources
  - "no information"
  - unavailable, then Ask again
  - a suggested question
  - keeping the conversation through a reload and clearing it
  - the 1,000-character limit
  - Shift+Enter
