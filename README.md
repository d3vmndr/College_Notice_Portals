# Result Portal (Bagmati University)

Static site, no backend. Files: `index.html` (student page), `admin.html` (admin console), `css/style.css`, `js/core.js`, `js/student.js`, `js/admin.js`, `js/seed.js` (sample data), `data/results.json` (published results).

## Run
Serve the folder over **https** or `http://localhost` (the browser crypto API needs it):
`python3 -m http.server 8000` then open `http://localhost:8000/`.

## Admin
- Open `admin.html`. First visit asks you to set a password.
- Add programs, subjects, students (symbol no. + date of birth), enter marks, check Results.
- Admin data is stored **in that browser only**. Use Settings > Backup regularly.
- **Publish** tab: choose terms, build, download `results.json`, upload it to the site's `data/` folder (replace the file).
- Settings > Erase removes the sample data. Do this before real use.

## Student
Enter symbol number and date of birth (calendar set in Settings, BS or AD, no conversion). Results are encrypted per student; wrong details give a generic error.

## Limits
- Admin login is client-side: it deters casual users, it is not server security.
- Lookup is by symbol number (roll numbers are only unique per program/term/batch).
- Sample login: symbol 20820101, DOB 2060-08-17.
