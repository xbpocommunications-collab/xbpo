# XBPO Communications — Full Subpages / Careers Production Pass

This build keeps the approved XBPO electric-blue / cyan / white / midnight-navy visual direction and expands the site beyond the homepage.

## Subpages
- Every non-home HTML page has a full, visible, multi-column production footer.
- Core company pages now contain multiple content sections instead of short placeholder-style pages.
- Every service page contains its own extended operating layers, control points and campaign CTA.
- Every job role has a dedicated long-form role profile with responsibilities, daily rhythm, useful strengths, team handoffs and an application CTA.

## Career roles
- Fronter
- Closer
- Verifier

The public careers form has no Preferred Shift field. The site states the operation runs on US-market night-shift hours instead of asking candidates to select a shift.

## Motion / UI
Scroll reveal, page progress, hero motion, floating elements, card hover depth, workflow motion and reduced-motion handling remain enabled from the production subpage system. The new depth layer adds animated flow arrows, hover lift, controlled card glow and responsive long-form layouts.

## Backend
The existing Google Apps Script integration remains in `backend/Code.gs`. Configure `config.js` and the Apps Script deployment before expecting live Google Sheets, Drive CV storage or email delivery.

## Motion polish
- Branded first-load logo sequence
- Branded internal page-transition wipe
- Header logo entrance / hover motion
- Subtle ambient motion and button sheen
- Reduced-motion accessibility fallback


## Logo motion refinement
- Full-screen loading treatment removed.
- Original black XBPO logo is used without recolouring.
- Each of the 16 pages has a distinct short logo entrance animation.
- Internal page changes trigger a brief destination-specific logo animation while the current page remains visible.
- Reduced-motion preferences disable these effects.
