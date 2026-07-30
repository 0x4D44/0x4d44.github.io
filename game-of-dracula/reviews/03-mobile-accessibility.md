# Review 03 — hostile mobile and accessibility reviewer

## Attack brief

Play at 390×844 with one thumb, then without a mouse, without sound, without colour perception, with reduced motion and with several humans sharing a device. Look for obscured controls, secret board-only actions and focus traps.

## Findings and changes

- **Critical:** the compact turn card and control rail both behaved as sticky layers and obscured the spinner. Mobile turn card changed to normal flow.
- **High:** SVG destinations alone are hard to discover and operate. Every legal destination now has a numbered HTML button; SVG targets also expose role, name, focus and Enter/Space.
- **High:** pass-and-play exposed the next human's role/choices. Added a full-screen hand-off gate whenever control changes between human seats.
- **High:** rule tabs lacked complete keyboard semantics. Added tab/tabpanel IDs, selected/tabindex state, and Arrow/Home/End navigation.
- **Medium:** colour-coded pawns need redundant identity. Each has a distinct symbol, name and text status.
- **Medium:** the board must remain inspectable on a phone. Added drag, wheel/pinch-compatible pointer viewport, fit/zoom controls and a compact legend.
- **Medium:** animation and audio cannot carry state. Added textual outcome cards/logs, `prefers-reduced-motion`, sound toggle and procedural audio only after user interaction.
- **Low:** touch controls needed larger targets and safe-area padding. Mobile controls are at least roughly 38–44 px and bottom padding uses `env(safe-area-inset-bottom)`.

## Verdict

Pass for keyboard and responsive play. Formal screen-reader testing on physical iOS/Android devices remains outside this environment, but essential actions are semantic HTML and text-equivalent.
