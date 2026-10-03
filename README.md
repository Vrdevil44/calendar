# Calendar

A single-file daily expense/entry tracker built with FullCalendar 6.

## What it is

Click any day to open a popup, add expense entries (name, amount, remark), and see
per-day totals colour-coded right in the month view — green for a normal day,
red when a day's total tops $3,000. Includes a Go-to-Date search.

## Feature tour

**Month view** — every day shows its total at a glance. Green means under the
$3,000 daily threshold, red flags a day that went over.

![Month view with color-coded daily totals](screenshots/month-view.png)

**Day popup** — click any date to add, edit, or delete entries. Amounts support
refunds (negative values), entries carry an optional remark and category, and the
day total updates live.

![Day popup with entry form](screenshots/day-popup.png)

**Data controls** — export everything to JSON, import it back, or reload the
obviously-fake demo data any time. All entries live in your browser's
`localStorage` (versioned schema) — nothing leaves your device, no account or
backend needed. Storage failures (private mode, quota) are handled gracefully.

**Mobile** — the layout holds up on small screens, with the same color-coded
totals and the over-threshold day flagged in red.

![Mobile month view](screenshots/month-view-mobile.png)

**Burn-rate forecast** — the app figures out your average daily spend and
sketches projected totals (~$X, dashed outline) onto the days still ahead.
Under the calendar a summary line reads "At this pace: $X by October 31" —
it turns red if your pace is over the $3,000 daily threshold. Nothing logged
yet? It just says "Add entries to see your forecast."

![Burn-rate forecast with projected totals](screenshots/forecast-view.png)

## Demo

Live: https://vrdevil44.github.io/calendar/

## What's new in v2.0

*   **Quick-add:** Type phrases like "lunch 12.50" in the day popup to auto-parse entries. Use "refund" to credit your balance. You have an 8-second undo window after every addition.
*   **Categories:** Organize spending with eight emoji-labeled, neon-colored categories. Entries now appear as color-coded chips directly in the calendar grid.
*   **Monthly Breakdown:** A new summary strip above the grid displays your total spending per category for the current month.
*   **Copy Summary:** Use the new button to copy a clean, category-based text summary of your monthly spending to your clipboard.
*   **BudgetGuard:** Set a daily budget in the header. Days exceeding this limit are flagged with a red warning.
*   **Recurring Entries:** Set items to repeat monthly. These show a badge and can be edited or deleted across the entire series.
*   **Visual Refresh:** Enjoy a cleaner look with pastel gradients, rounded tiles, and a pink ring highlighting today.
