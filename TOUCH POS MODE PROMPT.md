ADD-ON FEATURE — OPTIONAL TOUCH-SCREEN POS MODE

Context: The application is already built and working in production (mouse/keyboard POS screen, ~25,000 products, already tested for stability — see the prior stability audit). This is an ADDITIVE feature only: do not rewrite or break the existing POS screen or any business logic. The goal is to let the same store owner use a regular computer (mouse/keyboard) most of the time, but switch to a touch-screen-optimized POS layout on the same machine if they plug in or move to a touch monitor.

1. SETTINGS TOGGLE (not a separate app/build)
- Add a setting under Settings → POS: "POS Display Mode" with two options: "Standard" (current screen) and "Touch Screen".
- Switching this setting swaps the POS screen's UI layer only. It must NOT duplicate business logic — both modes call the exact same cart, pricing, discount, stock, and sale-completion logic already in the app. Only the presentation/layout component differs.
- The switch must take effect without restarting the app, and must be quick to change back and forth (a cashier/owner may switch mid-day if they move between a desktop and a touch kiosk).

2. TOUCH MODE LAYOUT REQUIREMENTS
Reuse the existing layout structure from section 129 (search bar top, category shortcuts below it, cart on the left) but adapted for touch:
- Minimum tap target size for every interactive element (buttons, category chips, product cards, quantity +/- controls): no smaller than 44x44px (48x48px preferred), with adequate spacing between adjacent targets to prevent accidental taps — especially around irreversible actions like "Complete Sale," "Void," and "Delete item."
- Quantity adjustment: prefer large "+ / −" step buttons over requiring the user to type a number, though direct entry should remain available via the on-screen keyboard.
- Category shortcuts and product cards become larger, grid-based tap targets (not small list rows) — this can reuse the same underlying data as Standard mode, just rendered bigger with more spacing.
- Increase base font sizes and control heights across the POS screen in Touch mode compared to Standard mode.

3. ON-SCREEN KEYBOARD HANDLING
- When Touch mode is active and the search field, quantity field, discount field, or any other text/number input is focused, an on-screen keyboard must appear automatically (numeric keypad for numbers/quantity/payment amounts, full Arabic/English keyboard for text search) — do not rely on Windows' own on-screen keyboard being manually opened by the user.
- The on-screen keyboard must not cover the field being edited or the "Complete Sale" action — reposition/resize the layout if needed so the cashier can always see what they're typing and confirm.
- If a physical barcode scanner (acting as a keyboard-wedge device) is connected, scanning must still work correctly and immediately in Touch mode — the search field should remain focused/ready for scanner input the same way it does in Standard mode, without the on-screen keyboard interfering with or blocking scanner input.

4. SCREEN SIZE / ORIENTATION
- Touch mode must remain usable on smaller and portrait-oriented touch displays, not just the 1366x768 landscape baseline already required for Standard mode (section 61). Define a reasonable minimum supported touch resolution and test against it.

5. WHAT NOT TO CHANGE
- Do not alter the Standard (mouse/keyboard) POS screen's behavior, layout, or performance while implementing this.
- Do not introduce a second, separate database, settings store, or business-logic path — Touch mode is a UI variant of the same POS, sharing 100% of the same underlying code for cart, stock, pricing, shifts, and printing.
- Silent thermal printing and the shift/PIN identification system already in place apply identically in Touch mode — no behavior change there.

6. TESTING
- Test the full sale flow (search/scan → add to cart → adjust quantity → discount → payment → print) end-to-end in Touch mode on an actual touch display, using the real product database.
- Test switching between Standard and Touch mode mid-session (e.g. after closing and reopening the POS screen) and confirm cart state, open shift, and settings all remain consistent across the switch.
- Confirm no regression in Standard mode after this feature is added.
