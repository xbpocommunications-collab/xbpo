# XBPO Communications — website setup

## Current build

- Original XBPO logo used across the website.
- Electric blue, cyan, white and midnight-navy visual system.
- 21 HTML pages: Home, About, Services, Our Process, Careers, Contact, Applicant Privacy, six dedicated service pages and eight dedicated role-profile pages.
- Subpages use separate page compositions rather than one repeated inner-page layout.
- Motion includes scroll reveals, page progress, pointer parallax, animated signal/ring elements, hover depth and service workflow effects. Reduced-motion preferences are respected.
- Internal navigation, service cards, role cards and CTAs point to real destinations.
- US-focused outbound calling and final expense campaign content must still receive client approval before public launch. No statistics or certifications are invented.
- Careers uses US-market night-operation wording and contains no shift selector.
- Existing Google Apps Script transport supports Google Sheets application/enquiry logs, private Drive CV storage and email notifications after deployment.

## Preview locally

Extract the ZIP and double-click `START_XBPO_DEMO.bat` on Windows. The site can also be opened from `index.html`.

## Enable email, Sheets and Drive

1. In the client-owned Google account, create a Google Spreadsheet with tabs named `Applications` and `Inquiries`, or allow the script to create them.
2. Create a private Google Drive folder for CVs. Do not use public link sharing.
3. Open Google Apps Script, create a project and paste `backend/Code.gs`.
4. Replace `PASTE_GOOGLE_SHEET_ID` and `PASTE_GOOGLE_DRIVE_FOLDER_ID` in `backend/Code.gs`. The recruitment and business notification inbox is already set to `official@xbpoandcommunnications.com`; change it only if XBPO chooses another inbox.
5. Deploy as a Web app under the client-owned account and grant only the required Sheets, Drive and Mail access.
6. Copy the `/exec` deployment URL into `config.js` as `appsScriptUrl`.
7. Submit one test business enquiry and one test application with a disposable PDF. Confirm the Sheet rows, private Drive upload and notification emails.
8. Publish only after XBPO confirms final service scope, campaign disclosures, active vacancies, privacy/retention wording and public contact details.

## Not live in this ZIP

The XBPO notification inbox is configured as `official@xbpoandcommunnications.com`. Google Sheet/Drive IDs and the deployed Apps Script endpoint are still required before the forms can claim successful live delivery.
