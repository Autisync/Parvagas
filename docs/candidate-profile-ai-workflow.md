# Candidate Profile and CV Workflow

## 1. Onboarding Prompt

The onboarding prompt appears only once after login and stores a local flag to avoid repeated display.

## 2. CV Template

Template file location:
- public/templates/modelo-cv-parvagas.docx

The file is served statically to candidates for manual download and fill.

## 3. Profile Save Flow

Backend endpoints:
- GET /api/v1/candidates/profile
- PUT /api/v1/candidates/profile

Save strategy:
1. Load current candidate profile.
2. Merge incoming data.
3. Validate field formats.
4. Persist changes.
5. Return updated profile.

## 4. CV Upload and Parsing

Backend endpoint:
- POST /api/v1/cv/upload

Flow:
1. Candidate uploads PDF, DOCX, or TXT.
2. Backend stores file in upload directory.
3. Parser extracts text and maps profile fields.
4. Parsed data is returned to frontend.
5. Parsed metadata is stored in database.

## 5. Frontend Behavior

- Users can save partial profile updates.
- CV parsing can pre-fill profile form fields.
- Users can edit parsed fields before final save.

## 6. Testing Checklist

- Upload valid PDF CV and verify parsed response.
- Upload DOCX and TXT and compare parsed quality.
- Update profile after parsing and reload profile.
- Verify endpoint errors are surfaced as user-friendly messages.
