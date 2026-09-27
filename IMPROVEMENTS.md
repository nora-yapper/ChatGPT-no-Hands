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


---

# Round 3: settings screen polish

## Work order

10 → 11 → 12 → 13

## Dependencies and overlaps

- **10, 11 and 12 all edit `components/ChatNoHands/IsntSettingsPanel.tsx`**, the only file for this round, plus settings-scoped rules in `globals.css`. The shared `ChatFocusable` is **not** changed: it already exposes every state as a data attribute (`data-focused`, `data-armed`, `data-confirming`, `data-cooling`) and a confirm-pulse class. The settings screen styles those under its own scope (`.isnt-settings`), so the rest of the app is untouched.
- **10 before 11:** 11 adds a new source for the explanation strip (the card under the pointer). The strip's fixed height has to be computed over *every* text it can show, so the mechanism comes first.
- **11 before 12:** the requirement is that color never competes with the focus / armed / confirm / cooldown feedback. So the state feedback is settled first, and color is added afterwards and judged against it.
- **13** is an answer only (no code). Last, so it describes the final screen.

## 10. [x] Settings descriptions: fixed height, no layout shift

> The description section's height changes with the focused setting, so the layout jumps. Give it a fixed height sized to the longest description (not a guess), responsive to the viewport but constant at a given size. Keep text readable on small screens instead of letting the box grow. Nothing else may move.

**Touches:** the explanation strip in `IsntSettingsPanel.tsx`.
**Cause:** the strip is a `<p>` with `min-h-[2.75rem]`, so a longer text adds lines and the flex column above it shrinks, moving every tile.
**Approach:**
- **Measure with CSS, not a guess:** render *every* text the strip can show (all explanations, and the longest variant of each notice) invisibly, stacked in the same grid cell as the visible one. The grid cell's height is then the tallest text at the current width, automatically and responsively. It never changes when focus changes.
- **Hidden copies** are `aria-hidden` and `visibility: hidden`.
- **Font:** size set with `clamp()` against the viewport, so small screens get slightly smaller text rather than a taller box.
- **Check:** measure the strip's and every tile's rects while focus moves across all settings. Nothing may move.

**Done.**
- **How the height is fixed:** the strip is now a one-cell CSS grid. Every text it can ever show (all explanations, the three blocked-gesture variants of every gesture, and every "moved from" / trial / preset / reset notice, `STRIP_TEXTS`) is stacked invisibly (`aria-hidden`, `visibility: hidden`) in that cell, under the visible one. The box is therefore exactly as tall as the longest text at the current width, measured by layout rather than guessed. It only changes with the viewport, never with focus.
- **Font:** `clamp(11px, 0.45vw + 7px, 13px)`, so narrow screens get slightly smaller text rather than a taller box.
- **Cleanup:** the notice builders became named functions (`trialNotice`, `movedNotice`, …) so they can be enumerated.
- **Checked:** moved the mouse over every tile in all four views (Gestures, Movement, a shortcut chooser, the Confirm chooser) at 1440×900 and 1024×700, 78 pointer positions each. Strip height: 51.8 px and 63.9 px respectively, constant throughout. No text clipped. No tile moved.
- **Noticed, not changed** (out of scope): at 1024×700 the tiles are slightly too short for their two-line content (45 px of content in a 40 px tile), so it's clipped a little. That's panel sizing on short viewports, worth a follow-up.

## 11. [x] Settings: clear feedback for every interaction state

> 1. Highlight the whole setting card under the pointer, statically (not the arming fill: the card isn't clickable, only its − / + are). 2. Clearly distinct focus / armed (fill progress) / confirm (brief flash or pulse) / cooldown (visibly inactive until it can fire again) on every interactive settings button. Show the changed value after each − / + press. Consistent with the rest of the app, light and dark.

**Touches:** `IsntSettingsPanel.tsx`, and settings-scoped CSS in `globals.css`.
**Current state:** `ChatFocusable` gives focus a soft shadow, dwell a rising fill, confirm a 260 ms scale pulse (barely visible on the small − / + tiles), and cooldown only the fill easing out. Nothing says "inactive", so a quick second press seems to be ignored. The card has no highlight at all.
**Approach:**
- **Card highlight:** the card counts as "under the pointer" when the Grid Glide cursor is inside its rectangle (read each frame from the grid status and area rect, as the transit dot does), when its − or + is focused, or on mouse hover. It shows a static tinted background and outline, with no fill. The explanation strip follows the card too.
- **Focus:** keep the app's lift shadow, and add a thin outline ring in the foreground color, so it reads on small tiles.
- **Armed:** keep the app's bottom-up fill, which is already the "progress" everywhere else.
- **Confirm:** the app's pulse, plus a short bright flash overlay (~300 ms) on the tile.
- **Cooldown:** while `data-cooling` is set, the tile is dimmed and a thin bar along its bottom drains over the cooldown time, so it visibly isn't ready yet. Mouse clicks don't go through the FSM, so they have no cooldown.
- **Changed value:** after − / +, the value text briefly scales up and gets a highlight background (keyed on the value, so it replays on every change).

**Done.** Styles are scoped to `.isnt-settings` in `globals.css`; the shared `ChatFocusable` is untouched, so the rest of the app keeps its quieter version.
- **Focus:** the usual lift shadow, plus a thin 45 % foreground ring.
- **Armed:** the usual bottom-up fill reaches the top, and the ring goes solid.
- **Confirm:** the usual scale pulse, plus a 260 ms bright flash over the control (`::after`).
- **Cooldown** (`data-cooling`): the content dims to 45 %, and a 3 px bar along the bottom drains over exactly the cooldown time (`--isnt-cooldown` = hold-visible + `cooldownMs`), so a quick second press visibly isn't ready yet. Mouse clicks bypass the FSM and have no cooldown.
- **Changed value:** after − / + the value pops (scale 1.18) with a brief highlight behind it. It's keyed on a per-setting press counter, so it replays on every press but not when you switch tabs.
- **Card highlight:** static (no fill), an outline ring and a faint tint, shown when the Grid Glide cursor is inside the card (read per frame from the grid status and area rect; cards aren't targets), when one of its − / + is focused, or on mouse hover. The explanation strip follows the card too.
  - A first attempt used `bg-muted`, which is the tile color in both themes and hid the − / + edges, so it became a ring.
- **Checked:** contact sheets in light and dark mode, with states forced on a − / + tile via the same data attributes and classes: rest / focused / armed / confirm / cooldown, plus the value pop after a press and a card highlighted by placing the glide cursor over it. Lint is clean; tests pass.

## 12. [x] Settings: color

> The settings screen is too plain. Give each group an accent color (header, icon or card edge), use accents in the gesture options so gestures and actions are easy to recognize, and tint the − / + or value displays. Balanced: color supports orientation and must not compete with focus / armed / confirm feedback. Readable in light and dark.

**Touches:** `IsntSettingsPanel.tsx` styles only.
**Approach:** reuse the app's pastel palette tokens (`--pastel-N` surfaces, `--pastel-fill-N` fills). They're already tuned for both themes, and the dwell fill of a tinted control already uses its hue, as on the compass.
- **Movement groups:** Pointer movement = sky, Head range = mint, Head scroll = peach, Gestures (strength/hold) = lavender. Each card gets its group's color as a left edge and a small group label. Its − / + are tinted with the group pastel, so their fill rises in the group hue. The value pips use the group color.
- **Gestures tab:** each *gesture* gets a fixed hue, used on a small color dot wherever it appears (action tiles, chooser). The same gesture looks the same everywhere. The Confirm tile gets a stronger rose edge, since it's the one that matters most.
- **Balance:** surfaces stay pale pastels at the lightness already used on the compass. The strongest color on screen is still the saturated fill (armed), the confirm flash and the focus ring.
- **Check:** screenshots in both themes, and a forced armed / cooldown state on tinted tiles.

**Done** (`IsntSettingsPanel.tsx` only). Colors come from the app's pastel tokens, so both themes are covered.
- **Movement groups:** each has an accent. Pointer movement = sky, Head range = mint (with the flips), Head scroll = peach, Gestures = lavender. It appears as the card's 4 px left edge, a dot before the group label, the value pips (filled in the saturated hue, empty in the pale one) and the − / + tiles. Those are pastel surfaces whose dwell fill rises in the group hue, like the compass.
- **Gesture colors:** each gesture has one hue wherever it appears, with left/right pairs sharing one. Mouth = rose, brows = butter, long blink = periwinkle, turn = lime, tilt = sky, head-to-shoulder = lilac. Action tiles take the color of their assigned gesture (unassigned ones stay neutral), and show a colored dot. The chooser shows each gesture tile in its own color. The Confirm tile's label is set in bold caps.
- **Disabled tiles** fade as a whole, surface included. The current choice stays readable.
- **Balance:** surfaces stay pale. The strongest signals are still the saturated arming fill, the foreground focus / armed rings, the confirm flash and the cooldown bar. Checked on a tinted tile with a forced armed / confirm / cooldown state.
- **Bug found and fixed:** the "active" ring on the selected tab and the current choice was clipped by the focusable wrapper (it was drawn outside), so the active tab wasn't visible. It's now `ring-inset`.
- **Checked:** Gestures, Movement and the chooser screenshotted in light and dark mode, plus the state sheet. The issue 10 layout-stability run is still 0 changes at both sizes. Lint is clean; tests pass.

**Follow-up (feedback on 12):**
- **Flips:** Flip left/right and Flip up/down now use the Projects panel's purple (`PHRASE_TINT`, lavender) instead of mint.
- **Accents removed:** the 4 px group edge on the Movement cards and the colored dots before the group titles are gone. The group colors remain on the − / + tiles and the value pips.
- **Gesture dots:** removed on the Gestures tab too (action tiles and chooser). Each gesture keeps its color only as the tile's surface.
- **Gestures tab outlines:** the focus/armed outlines (added in 11) no longer appear there. Those tiles show the app's own shadow and fill, as everywhere else. The outlines are now scoped to the Movement tab's small − / + steppers (`.isnt-settings[data-tab="movement"]`).
- **Checked:** screenshots in both themes; the computed outline on a forced-focus gesture tile is `none`. Lint is clean; tests pass.

## 13. [x] Explain how the original settings map to the ISNT settings

> No code changes. Answer in a message: for each displayed setting, its name and group, which original parameters it controls, how they're combined, and its default and safe range. Then the dropped/hidden settings (and why), and those still exposed as they were.

**Approach:** answered in chat from `isnt/isntSettings.ts` (the source of truth) once 10–12 are done. Only this checkbox is updated here.

**Done.** Answered in chat, from `isnt/isntSettings.ts`. No code changes.


## 14. [x] Settings: "More" button and popup

> A "More" button in the bottom right corner of the settings section opens a popup (the same one as for projects) with: Colour legend (what the color split means), Technicalities (empty for now), Advanced settings (empty for now), and Close.

**Done.**
- **Shared popup:** Recents' chat and project menu was extracted into `components/ChatNoHands/TilePanel.tsx`: a small title, big head-selectable tiles, Close always last. Given content, it shows a single row of tiles underneath it. Recents' menus and the settings "More" popup both use it.
  - The shared panel sits on the page background. The old Recents menu used `bg-card`, which in dark mode is the same color as its tiles, so they were invisible; they're readable now.
- **More tile:** the bottom row of the settings panel is now the explanation strip plus a More tile in the corner, stretched to the strip's height.
  - The strip keeps its fixed height (it's measured by layout): constant 51.8 px at 1440×900 and 79.8 px at 1024×700 (narrower now) across 82 pointer positions. Nothing moved.
- **Popup:** it covers the tab body, like the gesture chooser. Anything under it stops being a head target; the tabs and More stay live.
  - **Menu:** Colour legend · Technicalities · Advanced settings · Close.
  - **Colour legend:** two columns. Movement groups (pointer movement, head range, head scroll, gestures, and the flip switches in the Projects purple), and gesture colors (grey = no gesture). Each row has a swatch and a plain-language meaning, drawn from the same color maps the screen uses. Back and Close sit underneath.
  - **Technicalities / Advanced settings:** empty pages with Back and Close, as asked.
- **Checked:**
  - The grid fields: while the popup is open, only its tiles plus the tabs and More are targets. After Close, the steppers are back.
  - Screenshots in both themes, including the Recents menu in dark mode.
  - Lint is clean; tests pass.

**Follow-up (tabs):**
- **Gestures / Movement tabs:** no outline any more. They're styled like the New chat / Recents / Account tabs: the selected one gets the darker grey fill (`bg-accent`, medium weight), and the other has a hairline border and muted text.
- **Focus outline:** now limited to the − / + steppers (`[data-target^="is-step-"]`), so no other settings tile shows it.
- **Checked:** screenshots in both themes. Lint is clean; tests pass.

## 15. [x] Head pointer hidden behind settings popups

> When the popup in settings gestures shows up, my pointer is hidden behind it.

**Done.**
- **Cause:** the pointer's transit dot (`TransitIndicator`) and its cell tint were deliberately at z 3 / 4, *below* in-place popups (z 5). But whatever an open popup covers stops being a head target, so the pointer is always over the popup's own tiles, and it was drawn underneath them. This affected the gesture chooser, the More popup and the Recents menus.
- **Fix:** the dot and tint are now at z 47 / 46, above every in-place popup. They stay below the pick glide ghost (z 50). The keyboard modals (z 40) draw their own pointer inside their layer, and the window-level one isn't rendered while they're open.
- **Checked:** screenshots with the glide cursor placed over a chooser tile (light) and a More tile (dark): the dot and cell tint are on top. Lint is clean; tests pass.

**Follow-up (legend explains shared colours):**
- **The legend now explains grouping.** A colour marks a group, not an individual gesture or setting.
  - **Movement column** ("one colour per group"): each group lists the settings it contains, e.g. Pointer movement: Pointer speed, Steadiness, Hold to arm. The flips are noted as the Projects purple.
  - **Gestures column** ("one colour per kind of movement"): tiles take their gesture's colour, and mirrored head movements share one because they're the same movement in two directions (turning, tilting, head to a shoulder). The three face gestures sit on one row with three swatches, "one colour each". Grey means no gesture.
- **Room on short screens:**
  - The More popup now covers the whole settings panel (the tabs and More become inactive while it's open) instead of just the tab body.
  - Its Back/Close row height and the legend's text size and spacing scale with viewport height.
  - Nothing is clipped at 1440×900 (light and dark) or at 1024×700.
- **Checked:** screenshots at both sizes, plus a clipping check. While the popup is open, only its tiles are head targets. Lint is clean; tests pass.

**Follow-up (flips light grey):**
- **Flips:** Flip left/right and Flip up/down now use the plain light-grey secondary surface (dark grey in dark mode) instead of the Projects purple. That drops `FLIP_TINT`.
- **Legend:** the row now reads "Flip switches — light grey: on/off switches, not part of a group".
- **Checked:** screenshots in both themes. The legend still fits at 1440×900 and 1024×700. Lint is clean; tests pass.

**Follow-up (legend text trimmed):**
- **Headings:** now just "Movement tab" and "Gestures tab".
- **Rows:** every "— …" detail is gone; each row is a swatch and a name. Movement: Pointer movement, Head range, Head scroll, Gestures. Gestures: Face gestures (three swatches), Turning, Tilting, Head to a shoulder.
- **Removed rows:** Grey and Flip switches. The now-unused `GROUP_MEMBERS` map is deleted.
- **Kept:** the one-line note under each heading, which is what explains why colours are shared.
- **Checked:** screenshots; no clipping at 1440×900 or 1024×700. Lint is clean; tests pass.

## 16. [x] Advanced settings: what each Movement setting changes underneath

> In Advanced settings, display the Movement tab mapping from the earlier answer (issue 13's table). It will probably need the whole-screen popup.

**Done.**
- **Content:** More › Advanced settings now shows the issue 13 table: Setting, Original parameters it controls, How they're combined, Default, Safe range. The settings are grouped under section rows (Pointer movement, Head range, Head scroll, Gestures), with both flips under Head range. The intro sentence about safe limits and Input Lab values sits above the table.
  - The text lives next to each control's actual steps in `isntSettings.ts` (`LevelDef.doc`, `FLIP_DOCS`), so it can't drift from the values it describes.
  - The pasted table had truncated cells, so the wording comes from the source.
- **Full-screen popup:** it's portalled into a host that Account places over the whole screen block, tabs included (grid rows 1–17). While it's open, the profile card, the settings panel and the New chat / Recents / Account tabs all stop being head targets; only Back and Close remain. The cover is reported up (`onCover` → `onCoverNav`) and cleared on unmount, so leaving Account with it open (e.g. via the sidebar) doesn't leave the tabs off.
  - Back returns to the More menu; Close closes it.
  - The shared `TilePanel` gained `tilesClassName`, for a lower Back / Close row here.
- **Fit:** the table takes 488 px of its 569 px box at 1440×900, so no scrolling. On shorter screens (1024×700: 646 px in 387 px) it scrolls, and it's registered as the head-scroll target while open, so the app's own head scroll moves it.
- **Bug found and fixed:** a duplicate React key. "Head range" is both a group and a setting name, which showed as "2 Issues" in the dev overlay. The console is clean now.
- **Checked:**
  - Screenshots in both themes.
  - The nav fields are 0 while the popup is open and 3 after Back, Close, or leaving via the sidebar.
  - Lint is clean; tests pass.

**Follow-up (renamed):**
- **Renamed:** "Advanced settings" is now "About controls": the More menu tile, the popup title, and the explanation strip texts (including the More tile's own description) and code comments.
- **Unchanged:** internal ids (`is-more-advanced`, `IS_ADV_*`).
- **Checked:** a screenshot of the menu; the table still fits; the console is clean. Tests pass.

**Follow-up (intro text):** About controls' intro now says what the table shows: "What each Movement setting adjusts behind the scenes: the tracking values it controls, how they change together, its default, and the safe range it stays within." The table still fits (488 of 586 px at 1440×900), and the console is clean.

## 17. [x] New Chat starters: swap the two weakest for common prompt verbs

> Based on the UMN CCAPS list of common prompt terms: keep 10 starters, replace `Could` → `Summarize` and `Give` → `Compare`.

**Done.**
- **Starters** (`STARTERS` in `predictionRules.ts`): What, How, Why, Can, **Summarize**, Help, Create, Write, Explain, **Compare**. They take the old words' slots, so the layout and colours are unchanged. The README lists the new words and cites the source under "Research & open source".
- **Fit on small screens:** "Summarize" was wider than its field below ~1300 px, and "Explain" had already been clipping at 1024. Starters now render through `FitWord`, which measures the text against its field (re-measured on resize) and shrinks only a word that doesn't fit. Short words stay at 20px. At 1024×700, What is 20px, Explain 17.7px, Compare 13.7px and Summarize 11.2px; at 1440 all are 20px.
- **Checked:** screenshots at 1440 in both themes and at 1024; the Summarize and Compare picks work; Back works; the console is clean.

## 18. [x] Predictions: use the other common prompt verbs one step later

> Bring the remaining good-fit terms (Outline, Define, Describe, Analyze, Review, Identify, Show how, Illustrate, Clarify, Contrast) into the model's prediction guidance and the offline fallbacks.

**Done.**
- **Model** (`PREDICT_SYSTEM` in `server/llm.ts`): while the prompt is still short, the model is asked to favour task framings built on the common prompt verbs (explain, summarize, compare, contrast, define, describe, outline, analyze, review, identify, show how, illustrate, clarify, elaborate), with three examples. They are options among others, not in every slot.
- **Offline fallbacks** (`FALLBACK`):
  - Summarize and Compare/Contrast have their own sets ("the key points of", "the pros and cons", …); before, they fell through to the generic "and / with a minimal style".
  - One shared set covers Describe/Define/Outline/Analyze/Review/Identify/Clarify/Illustrate, and Elaborate has its own ("on the last point", …).
  - Can and Help now offer "you summarize this text", "you outline a plan", "me outline an essay" and "me review my draft".
  - Explain opens with "step by step how".
- **Test:** every starter and each of those verbs gets its own offline set that survives validation as a full 4 + 4. 93 tests pass; lint and tsc are clean.

## 19. [x] Real AI predictions with Claude

> Implement actual AI predictions, with Claude only (the PREDICT4ALL idea is dropped). Offline suggestions stay as the fallback.

**Done (code), waiting for an API key to try it live.**
- **Already built:** the Claude path existed: `/api/predict` sends the whole prompt, and the model returns 8 + 8 candidates that are validated down to 4 + 4. It falls back from the full request to one retry, then a simpler request, then the local rules. It never ran because there was no key.
- **Models:**
  - Predictions now use **`claude-sonnet-5`**. They run after every pick while the user waits, so speed matters more than depth.
  - Replies use **`claude-sonnet-5`** too (changed from Opus 5.5 on request).
  - Both can be changed (`ANTHROPIC_PREDICT_MODEL` / `ANTHROPIC_MODEL`).
- **Setup:** `.env.example` explains it: copy it to `.env.local`, add the key, and restart `npm run dev`.
- **Status:** `/api/status` tells the UI whether the server has a key. Without one, the header badge reads "No API key — offline suggestions".
- **PREDICT4ALL dropped:** the source copy in the scratchpad is deleted. Its Java install had failed (it needed an admin password), so nothing was left on the system; nothing was ever added to the repo.

## 20. [x] Offline mode switch in the sidebar

> An Offline mode in the sidebar: while on, nothing is sent to Claude; predictions come from the local rules.

**Done.**
- **Switch:** "Offline mode" sits above the theme toggle. It's a 48px, head-selectable tile (`sb-offline`, action `SB_OFFLINE`) with a switch (`role="switch"`). The line under it reads "Using Claude", "No API key — local suggestions" or "Only local suggestions". The setting is remembered per browser (`isnt-offline-mode`).
- **While on:**
  - Predictions are computed in the browser from the local rules (`offlinePredictions`), with source `offline`.
  - Replies are a notice telling you to turn Offline mode off.
  - No request leaves the page.
  - The header shows an "Offline mode" badge.
- **Caching:** Claude and offline results are cached separately, so switching modes re-predicts the current prompt.
- **Checked in the browser:**
  - With no key, the badge reads "No API key — offline suggestions".
  - With the switch on: the badge reads "Offline mode", picking and sending made **zero** `/api/*` requests, and the reply is the notice.
  - The switch stays on after a reload. The console is clean; tsc and lint are clean.

## 21. [x] Compass: field animation separate from the word / phrase animation

> The animation starts before the words and phrases are generated, and restarts once they arrive. Separate the coloured fields' animation from the text's, so there's no glitch.

**Done.**
- **Cause:** while a prediction was loading, each field was a placeholder element. When the prediction arrived, it was replaced by a new element that hid and replayed the fade and colour bloom.
- **Fix:** each compass field (`SlotCell`) is now one persistent coloured element. It plays the fade plus colour bloom (staggered clockwise) once per pick, whether or not the prediction has arrived.
  - The word or phrase lives inside it and fades in on its own when it's ready.
  - While waiting, a soft shimmer shows inside the field.
  - The field ignores the pointer until its text is visible.
- **Checked:** predictions were delayed by 1.2 s in the browser, on a starter pick and a compass pick. The field reached full opacity at about 0.9 s and stayed there; the text faded from 0 to 1 only after the prediction landed. There's no replay, and the field element is the same throughout. Screenshot in dark mode; tsc and lint are clean; 93 tests pass.

## 22. [x] Show predictions as they are generated

> The text animation waits for all words and phrases. Animate each one in as it's generated.

**Done.**
- **Server** (`/api/predict`):
  - It now streams. Claude writes one candidate per line (`W: …` / `P: …`, alternating, best first) via `streamCandidateLines` in `server/llm.ts`.
  - Each complete line is parsed (`parseCandidateLine`) and put through the same validation, de-duplication and diversity rules. Those rules are now incremental (`PredictionSelector`), and `selectPredictions` uses the same code.
  - Each accepted item is sent at once as an NDJSON event, then `done`.
  - Anything still missing gets one plain retry, then the local rules. Something already shown is never withdrawn.
  - A cancelled request (a new pick or Back) stops writing.
- **Client:**
  - `fetchPredictions` reads the stream and reports each item.
  - ChatNoHands keeps the partial set and marks it done at the end. An interrupted stream's half set is removed, so coming back re-predicts it cleanly.
  - If the stream fails midway, what's on screen stays and the local rules fill the rest.
- **Fields:** each field is "ready" when its own text exists, and it fades in on its own; issue 21's field animation is untouched.
- **Pacing:** Claude writes in bursts (5 lines within a few ms), so items are released at most one per 80 ms, in the order written. A lone item isn't delayed.
- **Checked (real Claude, Sonnet 5):**
  - "Explain": the first field at 1.7 s, then one every ~85 ms until 2.3 s.
  - After a compass pick: 1.8–2.6 s.
  - The field opacity never dips after the reveal.
  - A pick mid-stream followed by Back refills all 8.
  - Screenshot mid-stream. 95 tests pass (new: line parsing; incremental selection matches the whole-set selection). tsc and lint are clean; the console is clean.

## 23. [x] New Chat reading mode: bigger messages area, controls stacked on the right

> The messages section needs to be larger. Stack Up, Down and Reply vertically on its right side.

**Done.**
- **Transcript:** it now spans base rows 1–14 (down to where the input bar sits) and columns 1–21, instead of rows 1–9 across the full width. At 1440×900 it's 882×620 px, up from about 1135×420: roughly 200 px taller and 17% more area. The 768 px reading column still fits.
- **Controls:** on the right, 4 columns wide: Up and Down share rows 1–9, split evenly inside one wrapper (the 9 flexible rows don't halve on the grid); Reply takes rows 10–14, level with the input bar in compose mode. Reply is icon over label; while sending it reads "Waiting…" so it fits the narrow column.
- **Checked:**
  - Screenshots at 1440×900 (light) and 1024×700 (dark): at 1440 it's Up 206 / Down 206 / Reply 192 px; at 1024, 106 / 106 / 192.
  - Reply opens the composer (read buttons gone, Conversation field present); Conversation returns to reading.
  - The console is clean; tsc and lint are clean.

## 24. [x] Technicalities: open-source tools and research

> In Technicalities, write out the open-source tools used and the research it was based on, including Villaroman, Rowe & Helps (2013). Use the paper's five stages (user input, capture technology, feature retrieval, feature processing, pointer behaviour) to structure the tech part.

**Done.**
- **Page:** More › Technicalities (new `Technicalities.tsx`) opens in the same full-screen popup as About controls, covering the whole Account block. The nav tabs are off while it's open, and Back / Close work as there. `advanced: boolean` became `fullPage: "advanced" | "tech" | null`.
- **Content:**
  - **Five stages:** five cards, left to right with arrows, each with the paper's definition, what ISNT does, and the tools used:
    1. **User input:** head movement plus face and head gestures.
    2. **Capture:** webcam via getUserMedia, 640×480 at ~30 fps, local only.
    3. **Feature retrieval:** MediaPipe Face Landmarker (478 landmarks, 52 blendshapes, head pose; expression-proof pose).
    4. **Feature processing:** calibration, EMA smoothing, dead zone, detectors, state machine.
    5. **Pointer behaviour:** Grid Glide's magnetic snap, constant pixel speed, dwell to arm and gesture to confirm.
  - **Beyond the paper:** composing without typing: starter words, streamed Claude predictions, Offline mode.
  - **Research:** the full citation with DOI (verified against the ACM record: RIIT '13, pp. 65–70, doi:10.1145/2512209.2512218) and the UMN CCAPS prompt terms.
  - **Open-source tools:** the table of tools with their licences, read from each installed package.
- **README:** "Research & open source" now cites the paper and maps its five stages onto the pipeline.
- **Checked:**
  - It fits exactly at 1440×900 (611 of 611 px).
  - At 1280×800 and 1024×700 it scrolls, and it's the head-scroll target while open.
  - Back returns to the More menu. Screenshots in both themes; the console, tsc and lint are clean.

## 25. [x] Sidebar: show the AI's last reply while replying

> In the sidebar, add a small section that shows the last message in a chat: when a chat is open and the user selects Reply, they can see what the AI's response was.

**Done.**
- **What:** a "Last reply" card (`SidebarLastReply`) in the sidebar's free space, between the interface switcher and the camera card. It shows the most recent assistant message as plain text, like the transcript.
- **When:** only while composing in an ongoing chat (New Chat, a transcript exists, after Reply). It's hidden on a fresh chat, in reading mode (the transcript is visible there) and on other screens. It fades in, and it updates when a new reply arrives.
- **Size:** it fills whatever height is free: 359 px at 1440×900, 159 px at 1024×700. A long reply scrolls with the mouse, with a fade at the bottom. It isn't a head target; the full conversation is one Conversation field away.
- **Checked with real Claude:** send, then Reply, and the card shows the reply; Conversation hides it again. Screenshots in both themes; the console, tsc and lint are clean.
- **Noticed, not changed:** at 1024×700 the existing "Conversation" label is clipped in the narrow left column (it predates this change).

**Follow-up (starts at the bottom):** the card now opens scrolled to the end of the reply (re-scrolled whenever the reply changes), where it usually asks or concludes. The fade moved to the top, where earlier text is cut off, and scrolling up with the mouse shows the rest. Checked at 1024×700: scrollTop 155 of 155; the last line is fully visible.

**Follow-up (head scroll):** the Last reply card is the head-scroll surface while it's shown (`useHeadScrollTarget` in `SidebarLastReply`). It's active under the same conditions as the transcript in reading mode: the sidebar is open and no keyboard or rename popup is open. Nothing else claims head scroll while composing, and the transcript takes it back in reading mode.
- **Checked in the browser** by driving the registered surface the way the head-scroll controller does:
  - The card, starting at 135 of 135, went to 15 after scrolling up 120 and to 75 after scrolling down 60.
  - With the keyboard open, no surface is registered.
  - The handoff is correct: transcript while reading, card while composing, transcript again after Conversation.

## 26. [x] Footer hint: width of the inputs, wording that follows the settings

> Limit the width of the text at the bottom to the width of the middle section's inputs. The text also has to update properly according to the settings.

**Done.**
- **Width:** the footer uses the same block width and side padding as the screen above it (`max-w-[1180px] px-16`), so its text box lines up with the input bar and tabs. Measured: 324–1376 px at 1440 and 324–960 px at 1024, identical to the tabs.
- **Wording:**
  - The text was already tied to the settings, but it pasted gesture labels into a fixed sentence. So anything other than the defaults read badly ("then long blink to confirm", "Turn head left toggles…").
  - Each gesture now has an instruction phrase (`gestureInstruction` in `isntSettings.ts`: "open your mouth", "do a long blink", "tip your head to your left shoulder", …), and the line is built from the current confirm gesture and scroll-toggle shortcut (`footerHint`).
  - The scroll sentence is left out when no gesture toggles scrolling.
- **Checked live** by changing settings in the browser:
  - Default: "…then open your mouth to confirm. To turn head-tilt scrolling on or off, raise both eyebrows."
  - Long blink and left shoulder: "…then do a long blink to confirm. To turn head-tilt scrolling on or off, tip your head to your left shoulder."
  - No scroll gesture: the sentence is omitted.
  - tsc, lint and 95 tests pass.
