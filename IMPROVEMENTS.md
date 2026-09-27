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

