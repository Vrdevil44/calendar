# LinkedIn launch draft — Calendar baseline (DRAFT ONLY, do not post)

---

Shipped a small thing I'm proud of: a single-file calendar that tracks daily
expenses right in the month view.

Every day shows its total at a glance. Green means you're under your daily
threshold, red flags the days that went over. Click any date to add, edit, or
delete entries. Everything lives in the browser — no account, no backend, no
data leaving your device.

What went into this baseline:
- Per-day totals color-coded against a $3,000 threshold
- JSON export/import, demo data reset
- Versioned localStorage schema, graceful handling when storage is blocked
- Pinned dependencies with integrity checks, zero console errors
- Full keyboard support and a clean accessibility pass

Live demo: https://vrdevil44.github.io/calendar/

This is the baseline. The fun part — the actually smart calendar ideas — comes
next. Building in the open, one baseline at a time.

#buildinpublic #webdev #javascript
