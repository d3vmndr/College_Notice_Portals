# College Notice & Result Portals (Bagmati University)

Unified campus portal with Notice Management System (CRUD), Examination Desk, and Student Result Verification.

## Files
- `admin.html`: Unified Admin Console (Notice CRUD, Examination Desk, Student Gradesheet Lookup, Settings)
- `notice_page.html`: Live Notice Board Stream
- `index.html`: Student Result Portal
- `css/style.css`: Shared styling and UI themes
- `js/core.js`: Core storage, encryption (AES-GCM/PBKDF2) & result calculation
- `js/admin.js`: Multi-portal admin application logic
- `js/student.js`: Student gradesheet lookup
- `data/results.json`: Encrypted published examination records

## Run Locally
Serve the folder over `http://localhost` (browser crypto API requires localhost or https):
```bash
python -m http.server 8000
```
Then open `http://localhost:8000/` in your browser.

## Portals & Features
- **Admin Console (`admin.html`)**: First visit sets admin password. Manage notice CRUD, faculties, programs, subjects, students, marks entry, and publish encrypted results.
- **Notice Board (`notice_page.html`)**: Real-time notice feed with category filtering, search, and priority alerts.
- **Student Portal (`index.html`)**: Secure student gradesheet lookup by Symbol No. and Date of Birth.
- **Sample student credentials**: Symbol `20820101`, DOB `2060-08-17`.
