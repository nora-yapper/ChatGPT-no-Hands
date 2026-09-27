# Improvements

> **Update:** Keyboard Chat was removed as a feature after these issues were done (see the end of this file). Issue 8's work, and the Keyboard Chat parts of issues 5 and 7, went with it.

Status: `[ ]` open · `[x]` done. Numbered as given. The **work order** below differs from the numbering, for the reasons under *Dependencies*.

## Work order

1 → 2 → 3 → 4 → 5 → 7 → 8 → 6

## Dependencies and overlaps

- **1 and 2** both edit `recents/RecentsScreen.tsx` (the projects panel and the project cards inside it). Do the layout first, so the card restyle is checked against the final panel size and padding.
- **3 and 4** both touch how a focusable control draws its state: `ChatFocusable.tsx` (overflow, shadow, fill) and the state tokens in `globals.css`. Fix the clipping (3) before tuning dark-mode state colors (4), so 4 is judged on corners that render correctly.
- **4** builds on the earlier Send fix (`--send-bg` / `--send-fill`, commit `1fbe4f0`), which already made dark-mode Send go light gray → white. What's left there is the audit of every *other* control in dark mode.
- **5 and 7** both edit the sidebar interface switcher and the header title, in both `ChatNoHands.tsx` and `KeyboardChat.tsx` (each has its own copy of the sidebar). Make the structural and interaction changes first (5), then rename the text (7), so the rename lands on the final markup.
- **8** edits `KeyboardChat.tsx`, which 5 and 7 have already changed. Doing it after them avoids conflicts in that file.
- **6 (animations) goes last.** It's a cross-cutting check, and items 1–5, 7 and 8 all change markup, colors and transitions. Restoring the animations at the end means the final pass covers every screen as it will actually ship, including the new button colors and dark mode.

## Verification

For each issue: type check, lint and the test suite, plus a look at the running app in headless Chromium (light and dark mode) wherever the change is visual. Head-tracking behavior (focus, arming) can't be exercised without a camera, so for those I check the wiring (targets registered, focus area measured) and state that plainly.

---

## 1. [x] Recent Chats: full-screen layout, New Project inside the projects panel, remove the info card

> Remove the split. Expand the recent chats area and the projects area so together they fill the whole screen (head scrolling is hard, so show as much as possible without scrolling). Move the New Project button into the projects section (the purple area), with proper padding and spacing. Remove the info card ("Recent chats / Projects — select a card to open it, drag onto a project to move it"): drag and drop doesn't work with head movement.

**Touches:** `src/components/ChatNoHands/recents/RecentsScreen.tsx`, plus how `NoHandsScreen.tsx` hosts it (the Keyboard column and input-bar rows it shares with New Chat), and possibly the recents placements in `spatial.ts`.
**Cause:** Recents is placed on New Chat's base grid. It keeps the left Keyboard column and puts the info strip and New project in the input-bar rows, so the cards only get the word-area block.
**Approach:**
- Give Recents the full grid height and width (no Keyboard column, no bar rows), with more card rows per column so more cards show at once.
- Put New project as a tile inside the projects panel, with the panel's inset padding applied evenly.
- Delete the info strip.
- Drag and drop: leave the handlers in place for mouse use, but drop the drag hint.

**Done.**
- **Layout:** the overview is now one region over grid rows 1–14, covering the old word area and the input-bar rows, with the split and the input bar gone. Its columns line up with New Chat's grid, and its rows are four equal card rows, up from three. It shows 4 chats and 7 projects plus New project, previously 3 and 6.
- **Projects panel:** now a real `<section>` with 16 px padding, a title row and its own two-column grid, filled row by row so a few projects spread across both columns. New project is always its first tile. This replaced the old per-row margin arithmetic (`PANEL_*_INSET`, `panelInsetStyle`).
- **Info strip:** removed. Project cards say "Empty" instead of "Empty · drop a chat here". Mouse drag and drop still works, just no longer advertised.
- **Menus:** the chat and project menu overlay now covers the full panel height.
- **Unchanged:** the opened-project view keeps its bar (project info, New chat, All recents), since those controls need somewhere to live.
- **Checked:** screenshots in light and dark mode, plus the menu open. Type check and lint are clean.

## 2. [x] Project cards follow dark mode

> In dark mode the project cards still have a white background. Use the same dark surface and text colors as the other cards and panels.

**Touches:** `RecentsScreen.tsx` (the project card's `card-force-light` class) and `globals.css` (`.card-force-light`).
**Cause:** The card pins itself to the light tokens on purpose (`card-force-light`), so it stays white in dark mode.
**Approach:** Drop the pin on project cards so they use the theme's surface and text tokens, like the chat cards. Then check contrast against the dark pastel panel. Remove `.card-force-light` if nothing else uses it.

**Done.** Removed `card-force-light` from the project card, which now uses `bg-background` and `text-foreground`, the same as a chat card. Deleted the now-unused `.card-force-light` rule from `globals.css`. Checked with a dark-mode screenshot: the project cards are the same dark sheet as the chat cards on the dark pastel panel, and light mode is unchanged.

## 3. [x] Log Out button corners are clipped

> On the profile card in Account, the Log Out button's rounded corners look clipped or faded, as if the radius doesn't match the shape. Show clean, fully visible corners in default, focused and armed states.

**Touches:** `src/components/ChatNoHands/AccountScreen.tsx` (profile card and Log out), and possibly `ChatFocusable.tsx`.
**Likely cause:** A radius mismatch. `ChatFocusable` clips to its own `radius` (default `rounded-xl`) with `overflow-hidden`, while the inner `Button` or the profile card uses a different radius. The result is clipped corners and a focus shadow that doesn't follow the shape. It could also be a parent with `overflow-hidden` cutting off the shadow.
**Approach:** Inspect the rendered button, match the radii (pass `radius` to `ChatFocusable`, or make the inner button inherit it), and make sure no ancestor clips the focus or armed shadow.

**Done.**
- **Cause:** a radius mismatch. `ChatFocusable` clips to `rounded-2xl` (16 px), but the outline `Button` inside kept shadcn's default 12 px, so its 1 px border was cut off at every corner. The screenshot showed the corners fading out.
- **Fix:** the Log out button uses `rounded-2xl`, and the editable name and email rows in the same card use `rounded-xl` (16 px). A browser audit found those rows had the same mismatch.
- **Checked:** zoomed screenshots in light and dark mode, and a forced armed state (armed shadow and full fill): the corners are clean. The audit found no other head-focusable control on New chat, Recents or Account whose visible button radius differs from its wrapper.

## 4. [x] Dark mode: visible default → focused → armed progression on every button

> Same problem as the light-mode Send fix: in dark mode the button is fully white, so it can't get lighter. Make it light gray by default, turning white as it arms. Check every other button in dark mode for a clear difference between default, focused and armed.

**Touches:** `globals.css` (dark-mode state tokens: `--send-*`, `--chat-fill-neutral`, `--chat-shadow-*`, dark `--pastel-fill-*`) and the button classes of any control that hides its fill behind an opaque background.
**Status going in:** Send already goes `#b4b4b4` → white in dark mode (commit `1fbe4f0`). Confirm it in the running app.
**Approach:** Audit each head-focusable control type in dark mode: pastel tiles, neutral/secondary buttons, Send, the Recents cards and the account buttons. Find controls whose opaque background covers the rising fill, or whose fill barely differs from their resting color. Fix those with tokens, not per-component colors.

**Done.**
- **What the audit found:** every *solid* head-focusable button had the old Send problem, in both themes. That's Reply, the keyboard's Add, the rename keyboard's Save and Keyboard Chat's Send; in dark mode they're solid white. So did every *secondary* key on the on-screen keyboards (`#2f2f2f` in dark), plus the light-mode Log out (a white outline button). `ChatFocusable` paints its fill under the content, so an opaque button covered it, and only the shadow changed between focused and armed.
- **Fix:** one set of rules in `globals.css`, scoped to live focusables (`.chat-root [data-target]`). A solid, secondary or (light-mode) outline button hands its background to the wrapper and turns transparent, so the fill rises between surface and label.
  - Solid controls use `--solid-bg` / `--solid-fill`: dark gray → black in light mode, light gray (`#b4b4b4`) → white in dark mode. These are the old `--send-*` tokens, generalized.
  - Secondary keys keep their surface and show the neutral fill.
- **Cleanup:** removed the Send-only `.send-control` class. Send is back to its original markup and is covered by the general rule.
- **Unchanged:** disabled focusables render without `data-target`, so they keep their normal look.
- **Checked:** rest, focused and armed contact sheets (focus and armed forced in the page) for Send, Back, Keyboard, a starter tile, the tabs, a key, Add, Log out and the name row, in dark mode and the main ones in light. Every one shows a distinct step. Type check, lint and tests pass.

## 5. [x] Sidebar reachable by head pointer; readable tooltips; no fake dropdown arrow

> Let the pointer enter the sidebar and use every control there (light/dark toggle, interaction settings, switching between Input Lab, ChatGPT No Hands and Keyboard Chat, closing the sidebar), with the same focus and arming behavior as the rest of the app and large enough to target. Give tooltips a solid, high-contrast background in both modes. Remove the dropdown arrow next to the "ChatGPT No Hands" title.

**Touches:** `ChatNoHands.tsx` and `KeyboardChat.tsx` (sidebar and header), `useFocusArea.ts` (what the pointer maps onto), and `shadcn/tooltip.tsx`.
**Causes:**
- **Sidebar:** the head pointer maps only onto the main area's focus rect, and the sidebar controls are plain links and buttons, not registered focus targets.
- **Tooltips:** they're drawn outside `.chat-root`, but their colors (`bg-foreground` / `text-background`) come from theme values defined only inside it, so the background resolves to nothing.
- **Arrow:** a decorative `ChevronDown` in the header.

**Approach:**
- Extend the pointer's focus area to cover the sidebar and main area together.
- Wrap each sidebar control in `ChatFocusable` with a large enough target.
- When the sidebar is closed, make "Open sidebar" a focusable target.
- Give tooltips explicit colors that don't depend on the chat theme (or draw them inside `.chat-root`).
- Remove the chevron and render the title as plain text.

**Risk:** a wider focus area changes how head angle maps to screen position. Check that the main grid still feels the same.

**Done.**
- **Sidebar reachable by head:** the pointer's area is now the whole window in both chat interfaces, New Chat and Keyboard Chat. The root element owns the area and the transit dot, and the screens measure their Grid Glide fields in it.
  - **Glide speed unchanged:** `GridLayout.motionScale` (new in `gridNavigator.ts`, with a unit test) scales head motion by old-area size / window size, so a head movement still covers the same pixels as before. That's 0.82 × 0.81 on New Chat and 0.53 × 0.28 on Keyboard Chat at 1440×900.
  - **Shared controls:** the sidebar controls are now one component, `SidebarControls.tsx`, used by both interfaces. Close / Open sidebar, the three interface entries, and the light/dark and settings toggles are all `ChatFocusable` tiles at least 48 px tall. Head confirms and clicks both run `SB_*` actions.
  - **Closed sidebar:** only "Open sidebar" is a field. The hidden controls unregister so they don't linger as invisible fields.
- **Tooltips:** `TooltipContent` is portalled outside `.chat-root`, where `--foreground` / `--background` don't exist, so its background resolved to nothing. It now uses fixed colors (`#0d0d0d` chip, white text, faint white ring) that read in both themes.
- **Title:** the chevron is gone and the title is plain text (also on Keyboard Chat, which had the same fake dropdown).
- **Bug found and fixed along the way:** `useMeasuredGrid` ran in a layout effect before a parent's ref is attached, so with the area now owned by the page it measured nothing on first mount. It now reads the ref lazily and starts observing on the next frame.
- **Checked:**
  - The dumped grid layout: all sidebar controls are fields in both interfaces, and only `sb-open` while closed.
  - Clicking theme, settings, close/open and both interface switches works.
  - Screenshots with a tooltip open in light and dark mode.
  - Type check and lint are clean; 76 tests pass.
- **Not checked:** the head gliding itself can't be exercised without a camera.

## 6. [x] Restore the subtle enter/exit animations

> Text and backgrounds used to animate in and out; they no longer seem to. Find why, restore them, keep them subtle and consistent, and check they work with the new colors and dark mode.

**Touches:** `globals.css` (the animation library import, keyframes, transitions) and the components that use `animate-in` / `fade-in` classes.
**Lead:** `@import "tw-animate-css"` sits at line 74 of `globals.css`, after other rules. CSS ignores an `@import` that isn't at the top, so all of the library's `animate-in` / `fade-*` / `zoom-*` classes could be missing. Check the built CSS to confirm before changing anything.
**Other checks:** reduced-motion rules (none found in `src/`), transitions overwritten by the color changes (e.g. `.pastel`'s `transition`), and elements that appear instantly because they're simply shown or hidden with no transition.

**Done.**
- **First lead ruled out:** the mid-file `@import "tw-animate-css"` wasn't it. Tailwind inlines the import, the served CSS has `.animate-in` and `@keyframes enter`, and a probe element animates. There's no reduced-motion rule, and nothing animation-related was removed this session (checked with a diff against `1b9478f`).
- **Actual causes, reproduced by sampling every frame after a pick:**
  1. **Head picks skipped the pick animation.** The glide of the picked word to the center, and the fade-out of the other starters, were started only from the card's `onActivate`, which is the **mouse-click** path. A head-confirmed pick arrives through the pipeline dispatcher, goes straight to the parent's `act("PICK")`, and never triggered them. Measured: mouse pick, 28 frames of glide and fade; head pick, **0**. So with real head use, the text and backgrounds just swapped instantly.
  2. **Compass fields popped in when predictions were slow.** The reveal fade ran on the loading placeholders. When the predictions arrived afterwards, the real fields replaced them as fresh elements at full opacity, with no transition.
  3. **The clockwise stagger was never implemented.** The code comment describes the reveal as "lightly staggered clockwise from the top", but no delay existed.
  4. **Recents had no enter animation** when switching tabs; Account did.
- **Fixes (`NoHandsScreen.tsx`, `RecentsScreen.tsx`):**
  1. NoHandsScreen also listens for `PICK` on the dispatcher and starts the same glide (`startFlight`, shared with the click path). It reads the card's position and `--tint` synchronously, before the re-render.
  2. A compass field that replaces its placeholder is held hidden for two frames and then fades in like the rest.
  3. The reveal is staggered clockwise from the top in 35 ms steps. Only the fade-in is delayed, never the hide.
  4. Recents fades in over 300 ms, like Account.
- **Checked:**
  - Head-path pick: 29 frames of glide and starter fade.
  - Head pick with predictions delayed 900 ms: the fields first appear at opacity 0 and fade in.
  - Switching to Recents or Account: opacity ramps 0 → 1 over ~300 ms, in light and dark mode.
  - The reveal animates `opacity` and `background-color` inline, so the new pastel and state colors (issue 4's rules only touch solid, secondary and outline buttons, not the pastel ghosts) don't interfere.
  - Type check and lint are clean; tests pass.

## 7. [x] Rename "ChatGPT No Hands" → ISNT

> ISNT, all caps (Ima Slike Nema Tona). Every visible place: sidebar switcher, header title, page title, tooltips, other labels. User-facing text only.

**Touches (from search):**
- `src/app/chat/layout.tsx` (page title)
- `src/app/chat/page.tsx` (loading text)
- `ChatNoHands.tsx` (sidebar item and header title)
- `KeyboardChat.tsx` (sidebar link)
- any tooltip or aria-label text found in the final search

**Approach:** Change visible strings only; code comments, file names and component names stay. Re-search afterwards for `ChatGPT No Hands`, `ChatGPT no Hands` and `No Hands`. The Keyboard Chat header ("ChatGPT *Keyboard Chat*") is a separate interface; I'll note it rather than rename it.

**Done.**
- **Where it now says ISNT:**
  - the page title (`app/chat/layout.tsx`, which `/chat/keyboard` inherits, as it did the old name)
  - the loading text (`app/chat/page.tsx`)
  - the sidebar interface switcher (the shared `SidebarControls.tsx`, so both chat interfaces)
  - the header title (plain "ISNT" since issue 5)
  - the Input Lab's interface switcher (`layout/InterfaceSwitcher.tsx`)
- **Checked:** the rendered text of `/chat`, `/chat/keyboard` and `/` no longer contains the old name, and the tab title is "ISNT".
- **Left as is:** code comments, file, component and variable names, and the localStorage keys (`chat-no-hands-*`). Renaming the keys would reset saved theme and recents. `README.md` also still uses the old name.
- **Flagged, not changed:** the Keyboard Chat header reads "ChatGPT *Keyboard Chat*". That's a different interface, and "ISNT Keyboard Chat" would misname it, so it's your call: "Keyboard Chat" alone, "ISNT Keyboard Chat", or leave it.

## 8. [x] Keyboard Chat: centered keyboard, no example phrases

> Center the keyboard horizontally and vertically. Remove the example phrases above it. The interface should then contain only Up/Down, New Chat, Send and the keyboard, with balanced spacing in both modes.

**Touches:** `src/components/KeyboardChat/KeyboardChat.tsx` and `KeyboardChatControls.tsx`.
**Approach:** Remove the phrase-suggestion row. Lay out the controls and keyboard as one block centered in the main area, horizontally and vertically, and check the spacing in both themes.

**Done.**
- **Layout:** Keyboard Chat's main column is now three rows, `1fr | keyboard | 1fr`, so the keyboard block (keys plus Up / Down, Delete, space, New chat, Send) sits in the middle of the screen, horizontally and vertically. The screenshot at 1440×900 puts the block's center at y ≈ 478, the middle of the area below the header.
- **Composer:** docked above the keyboard, at the bottom of the conversation row. It grows *upward* as the draft gets longer, so the keys never move while typing, which matters for head targeting. The hint text sits in the bottom row.
- **Removed:**
  - The example phrases: the `SUGGESTIONS` row, its `PROMPT` action and handler.
  - The small round mouse-only Send inside the composer, which duplicated the Send key.
- **Checked:** screenshots in light and dark mode. Type check and lint are clean; tests pass.

---

## Follow-up: Keyboard Chat removed

> Remove ChatGPT Keyboard Chat as a feature.

**Done.**
- **Deleted:** the `/chat/keyboard` route (`src/app/chat/keyboard/`) and `src/components/KeyboardChat/` (`KeyboardChat.tsx`, `KeyboardChatControls.tsx`).
- **References removed:**
  - the sidebar interface switcher (`SidebarControls.tsx`: `InterfaceId` is now `"lab" | "chat"`)
  - the Input Lab's `InterfaceSwitcher`
  - the README's interface list, which already said "two interfaces"
  - a doc comment in `TailText.tsx`
- **Checked:** `/chat/keyboard` now returns 404, and `/` and `/chat` return 200. The sidebar shows Input Lab and ISNT only. Lint is clean and 76 tests pass.
- **Stale cache:** the type check's only error is the stale `.next/types/validator.ts` still listing the old route. It's generated build output and regenerates on the next dev-server restart or `next build`.
- **Settled:** the flagged "ChatGPT *Keyboard Chat*" header decision from issue 7 no longer applies.


---

## 9. [x] Feature: ISNT settings in Account

> Account gets a two-part layout: profile on the left, ISNT's own simplified settings on the right. Input Lab settings stay exactly as they are. The ISNT settings cover gesture shortcuts, a simplified set of sensitivity and tracking controls, a UI that works fully by head (steppers and option tiles, never sliders or dropdowns), safety bounds so no setting can lock the user out, and a plain-language explanation for every item.

### Analysis

- **Where settings live today.** `settingsStore` holds one set of `thresholds` (47 parameters, `config/thresholds.ts`), `smoothing`, `bindings` (gesture → intent) and `scrollToggleGesture`. The Input Lab's `SettingsPanel` edits all of it with sliders, and ISNT currently opens that same panel from the sidebar. The pipeline reads the store on every frame.
- **Gestures that exist.** `BLINK`, `LONG_BLINK`, `NOD`, `HEAD_SHAKE`, `MOUTH_OPEN` / `MOUTH_HOLD`, `BROW_RAISE_LEFT` / `RIGHT` / `BOTH`, `LOOK_AWAY` (yaw *or* pitch far from center), and `HEAD_STEP` (discrete navigation, only in "discrete" focus mode). There is no held turn/tilt gesture per direction, and nothing for roll.
- **How actions run.** The FSM turns a *bound* gesture into CONFIRM or CANCEL on an armed target, and dispatches `ActionEvent`s that ISNT's `act()` executes. The on-screen buttons are `ChatFocusable` targets, registered with the focus manager only while they're enabled and visible.

### Design decisions

- **Separate ISNT profile, overlaid only while ISNT is open.**
  - `settingsStore` gets a new, separately persisted `isnt` object: the confirmation gesture, the shortcut map, and one step index per simplified control.
  - `isnt/isntSettings.ts` derives a *profile* from it: partial thresholds, partial smoothing, bindings and the scroll-toggle gesture.
  - ISNT calls `pipeline.setProfile(profile)` on mount and whenever `isnt` changes, and `setProfile(null)` on unmount. That's the same pattern it already uses for `focusMode`.
  - The pipeline reads *effective* settings (lab store plus profile).
  - Result: Input Lab's own values and its panel are untouched.
- **Sidebar "Settings" in ISNT opens Account › Settings,** instead of the lab slider panel. Inside ISNT that panel would be misleading, because the ISNT profile overrides the values it shows. Input Lab keeps its panel.
- **New head-pose gestures** (`HeadPoseGestureDetector`):
  - `TURN_LEFT` / `TURN_RIGHT` (yaw), `TILT_UP` / `TILT_DOWN` (pitch), `ROLL_LEFT` / `ROLL_RIGHT` (head toward a shoulder).
  - Each fires once when the head is held past a threshold, as a fraction of head range, for a hold time. It re-arms only after returning near center, and only the dominant axis counts.
  - They're new `InputEventType`s but **not** `GestureEventType`s, so the lab's binding list and the FSM are unchanged. They're only ever used as ISNT shortcuts.
  - Tilt events are ignored while head scroll is active, because tilting *is* scrolling then.
  - They run in every interface (cheap). Only ISNT listens.
- **Excluded, as requested:** nod, single-eyebrow raises and eye blend. Head shake isn't offered either: it's a yaw oscillation that would collide with the turn gestures.
- **Confirmation gesture:** face gestures only (open mouth, raise both eyebrows, long blink). A head gesture moves the pointer off the armed button, so it can't confirm it.
- **Shortcuts do exactly what the button does.** Each shortcut names the on-screen button's target id. When its gesture fires, ISNT looks the target up in the focus manager. It runs `act(target, target.action)`, with the same flash, only if that button is currently registered, i.e. enabled and on screen. So Send does nothing when there's nothing to send, and Open Keyboard does nothing on Recents: the same rules as pointing at the button.
  - Incognito's header button isn't a head target, so its shortcut toggles incognito directly.
  - "Toggle head scroll" is also listed as a shortcut, because it *is* one (it was a separate lab setting). That brings it into the same conflict rules.

### Shortcut actions and default presets

| Action | What it does (on-screen equivalent) | Preset A: "Mouth confirms" (default) | Preset B: "Eyebrows confirm" |
|---|---|---|---|
| **Confirm** (required) | confirms the armed button | Open mouth | Raise both eyebrows |
| Toggle head scroll | turns head-tilt scrolling on/off | Raise both eyebrows | Open mouth |
| Go to Account | Account tab | Long blink | Long blink |
| Go back | the Back button (undo last word) | Head to left shoulder | Head to left shoulder |
| Send | the Send button | Head to right shoulder | Head to right shoulder |
| New chat | the New chat tab | — | — |
| Open keyboard | the Keyboard button | — | — |
| Toggle incognito | the temporary-chat toggle | — | — |

- **Roll for the defaults:** rolling the head doesn't move the Grid Glide pointer (it uses yaw and pitch), so it's the one head gesture that never disturbs pointing.
- **Turn and tilt:** offered, but unassigned by default. They push the pointer to an edge.

**Assignable gestures:** Open mouth · Raise both eyebrows · Long blink · Turn head left · Turn head right · Tilt head up · Tilt head down · Head to left shoulder · Head to right shoulder.

**Conflict rules** (enforced when assigning, and re-validated on load):
- One gesture maps to at most one action, including Confirm and Toggle head scroll.
- Assigning a gesture that's already in use moves it: the old action becomes unassigned, and a note says so.
- The Confirm gesture can't be chosen for a shortcut: its tile is shown as "used to confirm" and can't be selected.
- Confirm can never be unassigned.

### Sensitivity and tracking: from 47 parameters to 9 controls

Every control is a stepper (− / +) over a fixed list of safe steps. Each step sets one or more underlying parameters. Every step is within bounds, so no combination can stop the pointer.

| Group | Control | Plain explanation (shown in UI) | Parameters it sets | Steps (default **bold**) |
|---|---|---|---|---|
| Pointer movement | **Pointer speed** | How far the pointer moves for a head movement. Raise it if you have to turn a lot; lower it if the pointer overshoots. | `gridSensitivity` | 0.45, 0.6, 0.75, **0.9**, 1.1, 1.3, 1.55, 1.8 |
| | **Steadiness** | How much small, shaky head movement is ignored. Raise it if the pointer jitters or slips off buttons; lower it if it feels sluggish. | `gridDeadZone` (head-speed dead zone) + `gridHysteresis` (pull of the current button) + `smoothing.head` | 5 steps, **3rd** = 0.25 / 0.40 / 0.35 (current defaults); dead zone at most 0.45 |
| | **Hold to arm** | How long you keep the pointer still on a button before it's ready to confirm. | `gazeHoldMs` | 300, 400, **500**, 650, 800, 1000, 1300 ms |
| Head range | **Head range** | How far you turn your head to go across the screen. Lower it if turning is uncomfortable; raise it if the pointer is too jumpy. | `headYawRangeDeg` (pitch = 0.75×, roll = 1.25× of it) | 12, 14, 16, 18, **20**, 23, 26, 30 ° |
| | **Flip left / right**, **Flip up / down** | Reverse a direction if the pointer moves the wrong way. | `invertYaw`, `invertPitch` | off / on (default off) |
| Head scroll | **Scroll speed** | How fast the page scrolls when you tilt all the way. | `scrollMaxSpeed` + `scrollPageIntervalMs` (inversely) | 5 steps, **3rd** = 900 px/s / 220 ms |
| | **Scroll start** | How far you tilt before scrolling starts. Raise it if pages scroll when you don't mean them to. | `scrollDeadzone` | 0.06, 0.09, **0.12**, 0.16, 0.20, 0.25 |
| Gestures | **Gesture strength** | How big a face or head gesture must be to count. Lower it if gestures are missed; raise it if they fire by accident. | `mouthOpenThreshold` + `browRaiseThreshold` + `headGestureThreshold` | 5 steps, **3rd** = 0.45 / 0.50 / 0.85 |
| | **Gesture hold** | How long you hold a gesture before it counts. | `mouthHoldMs`, `browMinMs`, `longBlinkMs`, `headGestureHoldMs` × factor | ×0.6, ×0.8, **×1**, ×1.3, ×1.6 (long blink stays ≥ 360 ms, above a natural blink) |

**Dropped or hidden in ISNT** (still in the Input Lab):
- **Pointer / discrete focus modes only:** focus stability and window, navigating velocity, pointer gain X/Y, step threshold and repeat. ISNT always uses Grid Glide.
- **Unused gestures:** nod, shake, refractory, start-from-center tolerance, look-away (threshold, duration), blinks to toggle and blink burst window (blink burst isn't offered), single brows.
- **Too technical, safe defaults kept:** eye-closed threshold, blink min, long blink max, speech guard, tracking-lost delay, arm grace, cooldown, settle time and settle velocity, speed curve, acceleration, smoothing for pointer/face, grid input mode, eye blend.

### Safety: no deadlocks

1. **Bounded steps.** No control can go outside its step list. The steps are chosen so the pointer always moves: the dead zone is ≤ 0.45 head-units/s, the head range is 12–30°, and hold to arm is ≤ 1.3 s. Stored values are clamped on load too.
2. **The confirmation gesture is trialled.** After changing Confirm, a banner asks you to confirm anything with the *new* gesture within 20 s. If that doesn't happen, it reverts automatically. The trial survives a reload, and an expired trial reverts on load. So picking a gesture your face or camera can't produce can't lock you out.
3. **Reset.** A large "Reset ISNT settings" tile sits on the Movement tab. The gesture tab has the presets, which are always valid. Mouse and keyboard keep working throughout.
4. **Conflicts are impossible by construction** (see the rules above). Confirm always exists.

### Account layout (head-navigable)

- **Left third:** the profile, unchanged.
- **Right two thirds:** a settings panel with two big tabs, **Gestures** | **Movement**. No scrolling.
- **Gestures tab:**
  - Eight action tiles (Confirm plus seven shortcuts) in a 2×4 grid. Each shows the action, its gesture and a one-line explanation.
  - Selecting a tile opens a chooser over the panel, like the Recents menu: nine gesture tiles, each with a one-line explanation, plus "None" (not for Confirm) and "Close". Gestures already in use are marked, and the Confirm gesture is disabled for shortcuts.
  - A row at the bottom holds the two presets.
- **Movement tab:** the 9 controls as rows (label, explanation, value, big − and + buttons), grouped under small headings, plus the Reset tile.
- **Everything is a `ChatFocusable`,** with the same focus, arming and flash as the rest of the app. Actions are `IS_*`, handled by the panel itself for both head and mouse (the Recents pattern).

### Files

`isnt/isntSettings.ts` (new: catalogs, presets, validation, profile derivation, unit tests) · `gestures/headPoseGestureDetector.ts` (new, with tests) · `events/types.ts` · `config/thresholds.ts` (two new parameters, not added to the lab's slider list) · `store/settingsStore.ts` (`isnt`) · `gestures/scrollToggleDetector.ts` (accepts any gesture) · `pipeline/Pipeline.ts` (profile overlay, detector, tilt suppression while scrolling) · `ChatNoHands.tsx` (profile, shortcuts, confirm trial, hints, sidebar Settings) · `AccountScreen.tsx` and `IsntSettingsPanel.tsx` (new).

### Done

Implemented as planned. The Input Lab's settings and panel are unchanged (no diff in `components/Settings`).

- **New files:**
  - `isnt/isntSettings.ts`: catalogs, presets, conflict rules, confirm trial, safe steps, profile. 11 unit tests.
  - `gestures/headPoseGestureDetector.ts`: turn, tilt and roll, held. 5 unit tests.
  - `components/ChatNoHands/IsntSettingsPanel.tsx`.
- **Changed:** `settingsStore` (`isnt`, sanitized on load) · `Pipeline` (`setProfile` / `effective()`, tilt gestures ignored while head scroll is on, the scroll toggle accepts any gesture) · `ChatNoHands` (profile on mount / clear on unmount, shortcuts, trial banner and auto-revert, footer hint generated from the chosen gestures, sidebar Settings → Account) · `AccountScreen` (profile | settings).
- **Deviation from the plan, explanations:** each tile shows its label and current value. The full plain-language explanation appears in a strip at the bottom of the panel, for whatever is being pointed at (head focus or mouse hover). Putting 3–4 lines of explanation on every stepper would have forced scrolling. Notices (a gesture moved here from another action, the trial started, the preset applied, the reset done) take over the strip for 8 s.
- **Dark mode:** the panel sits on the page background rather than `bg-card`. In dark mode the card surface is the same `#2f2f2f` as the secondary tiles, which made them invisible.
- **Checked in the browser:**
  - A fired `LONG_BLINK` switches to Account.
  - `ROLL_LEFT` (Back) does nothing when there's nothing to undo, because the Back button isn't registered.
  - The confirm gesture doesn't act as a shortcut.
  - Pointer speed tops out at step 8, where the + tile disables; the pipeline runs `gridSensitivity` 1.8 while the lab's own value stays 0.9; Reset goes back to 0.9.
  - Assigning Long blink to New chat moves it from Go to Account, with a notice.
  - A new confirm gesture shows the countdown badge and binds only that gesture in the FSM. It reverts when the trial expires, and is kept when it actually confirms a button.
  - Leaving for the Input Lab clears the profile (the lab's `LONG_BLINK → CONFIRM` is back).
  - Screenshots of both tabs and the chooser in light and dark mode.
  - Lint is clean; 92 tests pass.
- **Not checked:** real gestures can't be exercised without a camera, so the gesture events were injected on the bus.
- **Noticed, not changed:** the "Free plan" badge on the profile card is invisible in dark mode (secondary on card, the same colour clash). It predates this work.

### Follow-up: Settings removed from the sidebar

- **Change:** the sidebar's Settings tile is gone, in favour of Account › Settings. It had become a shortcut there anyway, and the lab slider panel had already moved out of ISNT.
- **Code:** removed `SB_SETTINGS` and the `toggleSettings` handler from `SidebarControls.tsx`. `SidebarToggles` became `SidebarThemeToggle`, one full-width "Dark mode" / "Light mode" tile.
- **Checked:** the sidebar fields are now `sb-close`, `sb-go-lab`, `sb-go-chat` and `sb-theme`, and the theme tile still switches the theme. Lint is clean; 92 tests pass.

