# DMV Cancellation Hunter Bot - Build Instructions for Claude Code

## CONTEXT
The user lives at 8811 Rutgers St, Westminster, CO. Their driver's license is revoked and they need a reinstatement appointment at a Colorado DMV office. All nearby offices (within 1 hour) are booked out ~20 days. The user needs Claude Code to build a bot that runs 24/7 on their Mac, checks for cancellation slots, and alerts them instantly so they can book on their phone.

## WHAT TO BUILD
A Python bot using Playwright (headless Chromium) that:
1. Scrapes https://coloradoappt.cxmflow.com/Appointment/Index/d74f48b1-33a9-428c-acd1-d7d1bfc9555c every 2-3 minutes
2. Selects service type "Reinstatement" (or "Financial Responsibility" if that's how it's labeled)
3. Cycles through ALL 13 DMV offices within 1 hour of Westminster (listed below)
4. Reads the calendar for each office to find the first available date
5. If any slot is within 1-4 days from now → sends an URGENT macOS notification + opens the booking URL in the browser automatically
6. Logs everything to a file
7. Runs forever in the background, survives terminal close, auto-restarts on crash

## TARGET OFFICES (within 1 hour of 8811 Rutgers St, Westminster CO)
1. Westminster - 8464 Federal Blvd, Westminster 80031 (10 min)
2. Westgate - 3265 S Wadsworth Blvd #3A, Lakewood 80227 (25 min)
3. Lakewood - 1881 Pierce St, Lakewood 80214 (25 min)
4. Golden - 16950 W Colfax Ave Ste 104, Golden 80401 (30 min)
5. Denver Central - 1351 5th St Ste 100, Denver 80204 (30 min)
6. Denver Peoria - 4685 Peoria St Ste 115, Denver 80239 (35 min)
7. Boulder - 4800 Baseline Rd Ste A102, Boulder 80303 (35 min)
8. Longmont - 2144 Main St, Longmont 80501 (40 min)
9. Aurora - 14391 E 4th Ave, Aurora 80011 (40 min)
10. Loveland - 118 E 29th St Ste F, Loveland 80538 (50 min)
11. Parker - 17924 Cottonwood Dr, Parker 80134 (50 min)
12. Castle Rock - 110 Fontaine Blvd Ste 100 (55 min)
13. Fort Collins - 1601 S Lemay Ave (~1 hr)

## THE APPOINTMENT SYSTEM (cxmflow OABS)
- URL: https://coloradoappt.cxmflow.com/Appointment/Index/d74f48b1-33a9-428c-acd1-d7d1bfc9555c
- It's a web app with dropdown menus for service type and location
- When you select a location, a calendar loads showing available dates
- The first available date gets auto-highlighted on the calendar
- The page likely uses jQuery and AJAX to load calendar data when dropdown changes
- You MUST use Playwright (not just requests) because the calendar is JavaScript-rendered
- The page structure is unknown - the bot must auto-discover dropdowns, service types, and calendar elements on first run

## CRITICAL REQUIREMENTS

### 1. FULLY AUTOMATIC - NO USER INPUT
- Claude Code must do ALL the work: create the folder, write all files, install all dependencies, start the bot
- The user should not have to type any commands, edit any files, or configure anything
- Use `pip3 install` and `python3 -m playwright install chromium` automatically

### 2. NOTIFICATIONS MUST BYPASS DO NOT DISTURB
The user's Mac is on Do Not Disturb. Normal notifications get silenced. To bypass this:
- Use `osascript` to trigger a "critical alert" style notification (these bypass DND):
  ```
  osascript -e 'display alert "DMV SLOT FOUND!" message "Lakewood has opening May 29! BOOK NOW!" as critical'
  ```
  The `as critical` flag bypasses Do Not Disturb on macOS.
- ALSO play a loud sound using `afplay`:
  ```
  afplay /System/Library/Sounds/Sosumi.aiff &
  ```
- ALSO open the booking URL in browser automatically:
  ```
  open "https://coloradoappt.cxmflow.com/Appointment/Index/d74f48b1-33a9-428c-acd1-d7d1bfc9555c"
  ```
- ALSO make Terminal dock icon bounce by printing bell character: `print("\a")`

### 3. RUNS IN BACKGROUND 24/7
- After building, start the bot using `nohup python3 dmv-hunter.py &` or a launchd plist
- The bot must keep running after the Claude Code session ends
- If using launchd, create the plist and load it automatically
- The bot should auto-restart on crash (KeepAlive in launchd, or try/except loop)

### 4. SMART SCRAPING
- Check every 2-3 minutes (randomized to avoid detection)
- Rotate user agents occasionally
- Handle session timeouts by re-navigating to the page
- If the page structure changes, re-discover it automatically
- Log every check with timestamp, office name, and result

## STEP-BY-STEP FOR CLAUDE CODE
1. Create project folder (e.g., ~/dmv-hunter/)
2. Write the Python bot script (dmv-hunter.py)
3. Write the launchd plist (com.dmv.hunter.plist)
4. Install dependencies: `pip3 install playwright && python3 -m playwright install chromium`
5. Run the discovery step first: load the page, capture dropdown IDs and calendar structure, save to a JSON file
6. Start the bot in background
7. Verify it's running and logging
8. Tell the user it's done and what to expect

## HOW THE BOT WORKS (for Claude Code to implement)

### Discovery Phase (first run):
1. Launch headless Chromium via Playwright
2. Navigate to the appointment URL
3. Wait for page to fully load (networkidle)
4. Extract all `<select>` elements, their IDs, names, and all `<option>` values/text
5. Identify which select is the service type dropdown (contains "reinstate" or "financial" in options)
6. Identify which select is the location dropdown (contains office names like "Westminster", "Denver", etc.)
7. Select the reinstatement service type
8. Select one test location and wait for calendar to load
9. Identify how the calendar shows available dates (look for clickable `<td>` elements, highlighted cells, data-date attributes, etc.)
10. Save all this info to a JSON state file

### Monitor Phase (runs forever):
1. Every 2-3 minutes:
   a. Navigate to the appointment URL fresh
   b. Select reinstatement service type
   c. For each of the 13 target offices:
      - Select the office in the location dropdown
      - Wait 2 seconds for calendar to load
      - Read the first available date from the calendar
      - Parse the date and check if it's within 1-4 days from now
   d. If ANY office has a slot within 4 days:
      - Send critical macOS alert (bypasses DND)
      - Play alert sound
      - Open booking URL in browser
      - Log: "FOUND: [office] has slot on [date]!"
   e. If no slots found, log: "Check #N complete. No slots within 4 days. Next check in Xs."
2. On error: log the error, wait 60 seconds, retry

## EXAMPLE LOG OUTPUT
```
2026-05-27 09:15:23 [INFO] === Check #1 at 9:15 AM ===
2026-05-27 09:15:25 [INFO]   Westminster: first available Jun 16 (20 days)
2026-05-27 09:15:28 [INFO]   Westgate: first available Jun 14 (18 days)
2026-05-27 09:15:31 [INFO]   Lakewood: first available Jun 12 (16 days)
2026-05-27 09:15:34 [INFO]   Golden: first available Jun 15 (19 days)
...
2026-05-27 09:16:02 [INFO]   No slots within 4 days. Next check in 147s.
...
2026-05-27 11:42:15 [INFO] === Check #58 at 11:42 AM ===
2026-05-27 11:42:18 [INFO]   Westminster: first available Jun 16 (20 days)
2026-05-27 11:42:21 [INFO]   Lakewood: first available May 29 (2 days)
2026-05-27 11:42:21 [INFO]   !!! SLOT FOUND: Lakewood - May 29 (2 days away) !!!
2026-05-27 11:42:21 [INFO]   >>> SENDING ALERT <<<
```
