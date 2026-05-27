#!/usr/bin/env python3
"""
DMV Cancellation Hunter Bot
============================
Runs 24/7 in background on your Mac. Checks all 13 DMV offices near
Westminster every 2-3 minutes. When a cancellation slot opens within
1-4 days, sends a macOS notification + bounces the dock icon.

Usage:
    pip3 install playwright
    python3 -m playwright install chromium
    python3 dmv-hunter.py

To run in background:
    nohup python3 dmv-hunter.py &

Or use the launchd plist for auto-start (see dmv-hunter.plist).
"""

import asyncio
import json
import os
import subprocess
import sys
import random
import logging
from datetime import datetime, timedelta
from pathlib import Path

# Try to import playwright
try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Installing playwright...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    from playwright.async_api import async_playwright

# ============================================================
# CONFIGURATION - Edit these if needed
# ============================================================

URL = "https://coloradoappt.cxmflow.com/Appointment/Index/d74f48b1-33a9-428c-acd1-d7d1bfc9555c"

# How often to check (seconds). Randomized between min and max to avoid detection.
CHECK_INTERVAL_MIN = 120   # 2 minutes
CHECK_INTERVAL_MAX = 210   # 3.5 minutes

# Alert if appointment is within this many days from now
MAX_DAYS_OUT = 4

# Service type to look for (case-insensitive substring match)
SERVICE_TYPE = "reinstate"  # matches "Reinstatement", "Reinstate", etc.
# Fallback service types to try if "reinstate" not found
SERVICE_TYPE_FALLBACKS = ["financial", "driver", "license"]

# Offices to monitor (within 1 hour of Westminster)
TARGET_OFFICES = [
    "westminster",
    "westgate",
    "lakewood",
    "golden",
    "denver",
    "boulder",
    "longmont",
    "aurora",
    "loveland",
    "parker",
    "castle rock",
    "fort collins",
    "peoria",
]

LOG_FILE = Path(__file__).parent / "dmv-hunter.log"
STATE_FILE = Path(__file__).parent / "dmv-hunter-state.json"

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("dmv-hunter")


# ============================================================
# macOS NOTIFICATIONS
# ============================================================

def send_mac_notification(title, message, sound="Glass"):
    """Send a macOS notification with sound. Bounces dock icon too."""
    # Notification banner
    script = f'''
    display notification "{message}" with title "{title}" sound name "{sound}"
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True)

    # Also bounce Terminal in dock
    bounce_script = '''
    tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
    end tell
    if frontApp is not "Terminal" then
        tell application "Terminal" to activate
        delay 0.5
        tell application "System Events"
            set visible of process "Terminal" to true
        end tell
    end if
    '''
    subprocess.run(["osascript", "-e", bounce_script], capture_output=True)

    # Terminal bell (causes dock bounce if Terminal not focused)
    print("\a", end="", flush=True)


def send_critical_alert(office, date_str, time_str=""):
    """Send an urgent alert for a found slot."""
    title = "DMV SLOT FOUND!"
    time_part = f" at {time_str}" if time_str else ""
    msg = f"{office} has an opening on {date_str}{time_part}! Book NOW on your phone!"

    log.info(f"ALERT: {msg}")

    # Send notification 3 times with increasing urgency
    for i in range(3):
        send_mac_notification(title, msg, "Sosumi" if i > 0 else "Glass")
        if i < 2:
            import time
            time.sleep(2)

    # Also open the booking URL in default browser
    subprocess.run(["open", URL], capture_output=True)


# ============================================================
# PAGE STRUCTURE (auto-discovered, cached)
# ============================================================

def load_page_structure():
    """Load previously discovered page structure."""
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, KeyError):
            pass
    return None


def save_page_structure(structure):
    """Save discovered page structure for future runs."""
    with open(STATE_FILE, "w") as f:
        json.dump(structure, f, indent=2)


# ============================================================
# CORE BOT
# ============================================================

async def discover_page(page):
    """First run: figure out the page structure."""
    log.info("Discovering page structure (first run)...")

    structure = await page.evaluate("""() => {
        const result = { selects: [], buttons: [] };

        document.querySelectorAll('select').forEach((s, i) => {
            const options = [];
            s.querySelectorAll('option').forEach(o => {
                options.push({ value: o.value, text: o.textContent.trim() });
            });
            result.selects.push({
                index: i,
                id: s.id,
                name: s.name,
                className: s.className,
                optionCount: options.length,
                options: options,
                visible: s.offsetParent !== null,
                parentId: s.parentElement ? s.parentElement.id : '',
            });
        });

        document.querySelectorAll('button, input[type="submit"], a.btn, [role="button"]').forEach(b => {
            result.buttons.push({
                id: b.id,
                text: b.textContent.trim().substring(0, 80),
                className: b.className,
                tagName: b.tagName,
                visible: b.offsetParent !== null,
            });
        });

        return result;
    }""")

    # Identify the service dropdown and location dropdown
    service_select = None
    location_select = None

    for sel in structure["selects"]:
        opts_text = " ".join(o["text"].lower() for o in sel["options"])

        # Service dropdown: contains reinstatement, license, etc.
        if any(kw in opts_text for kw in ["reinstate", "financial", "license type", "service"]):
            service_select = sel
            continue

        # Location dropdown: has many options and contains office names
        if sel["optionCount"] > 5 and any(kw in opts_text for kw in ["westminster", "denver", "lakewood", "aurora", "boulder"]):
            location_select = sel
            continue

    # Fallback: if not identified by content, use heuristics
    if not location_select:
        # The dropdown with the most options is likely locations
        viable = [s for s in structure["selects"] if s["optionCount"] > 3 and s["visible"]]
        if viable:
            location_select = max(viable, key=lambda s: s["optionCount"])

    if not service_select:
        # A dropdown that isn't the location one, has 2+ options
        for sel in structure["selects"]:
            if sel != location_select and sel["optionCount"] >= 2 and sel["visible"]:
                service_select = sel
                break

    discovered = {
        "service_select": service_select,
        "location_select": location_select,
        "all_selects": structure["selects"],
        "buttons": structure["buttons"],
    }

    save_page_structure(discovered)
    return discovered


def get_selector(sel_info):
    """Build a CSS selector from select info."""
    if sel_info.get("id"):
        return f"#{sel_info['id']}"
    if sel_info.get("name"):
        return f"select[name='{sel_info['name']}']"
    return f"select:nth-of-type({sel_info.get('index', 0) + 1})"


def is_target_office(option_text):
    """Check if this option matches one of our target offices."""
    text_lower = option_text.lower()
    return any(target in text_lower for target in TARGET_OFFICES)


def parse_date(date_str):
    """Try to parse a date string into a datetime."""
    formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%d %B %Y",
        "%d %b %Y",
        "%m-%d-%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


async def check_calendar(page):
    """Read the calendar on the current page and find the first available date."""
    result = await page.evaluate("""() => {
        const found = { dates: [], firstAvailable: null, noAvailMsg: null };

        // Look for "no availability" messages
        const noAvailSelectors = [
            '.no-availability', '.unavailable', '.alert-warning',
            '.alert-danger', '.no-appointments', '.fully-booked',
            '[class*="no-avail"]', '[class*="fully-booked"]'
        ];
        for (const sel of noAvailSelectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null && el.textContent.trim()) {
                found.noAvailMsg = el.textContent.trim().substring(0, 200);
            }
        }

        // Strategy 1: Find clickable/available calendar cells
        const cellSelectors = [
            'td.available a', 'td.available', 'td.open a', 'td.open',
            'td:not(.disabled):not(.unavailable):not(.past):not(.empty) a',
            '.calendar-day.available', '.available-day',
            '.ui-datepicker td:not(.ui-state-disabled) a',
            'td[data-available="true"]',
            '.day-available', '.slot-available',
            'td.CalendarDay:not(.CalendarDay--blocked)',
        ];

        for (const sel of cellSelectors) {
            const cells = document.querySelectorAll(sel);
            cells.forEach(cell => {
                const dateAttr = cell.getAttribute('data-date') ||
                                 cell.getAttribute('data-full-date') ||
                                 cell.getAttribute('title') ||
                                 cell.parentElement?.getAttribute('data-date') ||
                                 cell.textContent.trim();
                if (dateAttr) {
                    found.dates.push(dateAttr);
                }
            });
            if (found.dates.length > 0) break;
        }

        // Strategy 2: Look for highlighted/first-available
        const highlightSelectors = [
            '.first-available', '.highlighted', '.earliest',
            '.selected-date', '.bg-success', '.active.available',
            '[class*="highlight"]', '[class*="first-avail"]',
            '.fc-highlight', '.ui-datepicker-current-day',
        ];
        for (const sel of highlightSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const d = el.getAttribute('data-date') || el.getAttribute('title') || el.textContent.trim();
                if (d) found.firstAvailable = d;
                break;
            }
        }

        // Strategy 3: Look for date display elements
        const dateDisplaySelectors = [
            '.next-available', '.first-available-date', '.available-date',
            '#nextAvailable', '#firstAvailable', '[id*="vailableDate"]',
            '.appointment-date', '.slot-date', '.date-display',
        ];
        for (const sel of dateDisplaySelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                found.firstAvailable = el.textContent.trim();
                break;
            }
        }

        // Strategy 4: Look for time slot elements (indicates today/selected date has slots)
        const slotSelectors = [
            '.time-slot', '.timeslot', '.slot', '.available-time',
            'input[type="radio"][name*="time"]', '.time-btn', '.slot-btn',
        ];
        let slotCount = 0;
        for (const sel of slotSelectors) {
            slotCount += document.querySelectorAll(sel).length;
        }
        found.hasTimeSlots = slotCount > 0;
        found.timeSlotCount = slotCount;

        // Get any visible month/year header
        const headerSelectors = [
            '.calendar-header', '.month-header', '.ui-datepicker-header',
            'th[colspan]', '.fc-toolbar-title',
        ];
        for (const sel of headerSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                found.calendarHeader = el.textContent.trim();
                break;
            }
        }

        return found;
    }""")

    return result


async def run_check(page, structure):
    """Run one full check cycle across all target offices."""
    log.info("Starting check cycle...")

    service_sel = structure.get("service_select")
    location_sel = structure.get("location_select")

    if not location_sel:
        log.error("No location dropdown found in page structure. Re-discovering...")
        structure = await discover_page(page)
        location_sel = structure.get("location_select")
        if not location_sel:
            log.error("Still no location dropdown. Page may have changed.")
            return []

    # Select service type first (if there's a service dropdown)
    if service_sel:
        selector = get_selector(service_sel)
        matched_service = None

        for opt in service_sel["options"]:
            text_lower = opt["text"].lower()
            if SERVICE_TYPE.lower() in text_lower:
                matched_service = opt
                break

        if not matched_service:
            for fallback in SERVICE_TYPE_FALLBACKS:
                for opt in service_sel["options"]:
                    if fallback in opt["text"].lower():
                        matched_service = opt
                        break
                if matched_service:
                    break

        if matched_service:
            try:
                await page.select_option(selector, matched_service["value"])
                await asyncio.sleep(1)
                log.info(f"Selected service: {matched_service['text']}")
            except Exception as e:
                log.warning(f"Could not select service: {e}")

    # Check each target office
    loc_selector = get_selector(location_sel)
    results = []
    now = datetime.now()
    max_date = now + timedelta(days=MAX_DAYS_OUT)

    for opt in location_sel["options"]:
        if not opt["value"] or opt["value"] in ("", "0", "-1"):
            continue

        if not is_target_office(opt["text"]):
            continue

        office_name = opt["text"].strip()
        log.info(f"  Checking: {office_name}...")

        try:
            await page.select_option(loc_selector, opt["value"])
            await asyncio.sleep(2)

            # Trigger change event explicitly
            await page.evaluate(f"""() => {{
                const sel = document.querySelector('{loc_selector}');
                if (sel) {{
                    sel.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    if (window.jQuery) try {{ jQuery(sel).trigger('change'); }} catch(e) {{}}
                }}
            }}""")
            await asyncio.sleep(2)

            calendar_data = await check_calendar(page)

            first_date = calendar_data.get("firstAvailable")
            available_dates = calendar_data.get("dates", [])

            if first_date:
                log.info(f"    First available: {first_date}")
                parsed = parse_date(first_date)
                if parsed and parsed <= max_date:
                    days_away = (parsed - now).days
                    log.info(f"    *** SLOT WITHIN {days_away} DAYS! ***")
                    results.append({
                        "office": office_name,
                        "date": first_date,
                        "parsed_date": parsed.isoformat() if parsed else None,
                        "days_away": days_away if parsed else None,
                        "time_slots": calendar_data.get("timeSlotCount", 0),
                    })
                elif parsed:
                    days_away = (parsed - now).days
                    log.info(f"    {days_away} days away (outside {MAX_DAYS_OUT}-day window)")
                else:
                    log.info(f"    Could not parse date: {first_date}")
            elif available_dates:
                log.info(f"    Found {len(available_dates)} dates: {available_dates[:3]}")
                for d in available_dates:
                    parsed = parse_date(d)
                    if parsed and parsed <= max_date:
                        days_away = (parsed - now).days
                        log.info(f"    *** SLOT WITHIN {days_away} DAYS: {d} ***")
                        results.append({
                            "office": office_name,
                            "date": d,
                            "parsed_date": parsed.isoformat(),
                            "days_away": days_away,
                        })
                        break
            elif calendar_data.get("noAvailMsg"):
                log.info(f"    No availability: {calendar_data['noAvailMsg'][:80]}")
            else:
                log.info(f"    No dates found on calendar")

        except Exception as e:
            log.warning(f"    Error checking {office_name}: {e}")

        # Small delay between offices to be polite
        await asyncio.sleep(random.uniform(0.5, 1.5))

    return results


async def main_loop():
    """Main bot loop - runs forever."""
    log.info("=" * 60)
    log.info("  DMV Cancellation Hunter Bot - Starting")
    log.info(f"  Monitoring {len(TARGET_OFFICES)} offices")
    log.info(f"  Alert window: {MAX_DAYS_OUT} days")
    log.info(f"  Check interval: {CHECK_INTERVAL_MIN}-{CHECK_INTERVAL_MAX}s")
    log.info(f"  Log file: {LOG_FILE}")
    log.info("=" * 60)

    send_mac_notification(
        "DMV Hunter Started",
        f"Monitoring {len(TARGET_OFFICES)} offices for cancellations. Will alert you when a slot opens!",
        "Submarine",
    )

    check_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )

        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        # Load page structure or discover it
        structure = load_page_structure()

        while True:
            try:
                check_count += 1
                log.info(f"\n--- Check #{check_count} at {datetime.now().strftime('%I:%M %p')} ---")

                # Navigate fresh each time (avoids stale state)
                await page.goto(URL, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                # Discover structure on first run
                if not structure:
                    structure = await discover_page(page)
                    if not structure.get("location_select"):
                        log.error("Could not find location dropdown. Will retry...")
                        await asyncio.sleep(30)
                        continue

                results = await run_check(page, structure)

                if results:
                    # FOUND SLOTS!
                    best = min(results, key=lambda r: r.get("days_away", 999))
                    log.info(f"\n{'!'*60}")
                    log.info(f"  CANCELLATION FOUND!")
                    log.info(f"  {best['office']}: {best['date']}")
                    log.info(f"  ({best.get('days_away', '?')} days from now)")
                    log.info(f"{'!'*60}\n")

                    send_critical_alert(
                        best["office"],
                        best["date"],
                        f"{best.get('time_slots', '?')} time slots available",
                    )

                    # Keep checking but less frequently after finding a slot
                    # (in case user wants to find an even better one)
                    interval = 300  # 5 min after finding
                else:
                    log.info(f"  No slots within {MAX_DAYS_OUT} days. Sleeping...")
                    interval = random.uniform(CHECK_INTERVAL_MIN, CHECK_INTERVAL_MAX)

                log.info(f"  Next check in {int(interval)}s")
                await asyncio.sleep(interval)

            except Exception as e:
                log.error(f"Error during check: {e}", exc_info=True)
                # Notification on repeated errors
                if check_count % 10 == 0:
                    send_mac_notification("DMV Hunter Error", f"Bot hit an error: {str(e)[:100]}", "Basso")
                await asyncio.sleep(60)

                # Re-create page on error
                try:
                    await page.close()
                except:
                    pass
                page = await context.new_page()
                structure = None  # Force re-discovery


def main():
    print(r"""
    ╔═══════════════════════════════════════════╗
    ║     DMV CANCELLATION HUNTER BOT          ║
    ║     Westminster, CO - 13 Offices         ║
    ║                                          ║
    ║  Runs 24/7. Checks every 2-3 min.       ║
    ║  Alerts you the SECOND a slot opens.     ║
    ║                                          ║
    ║  Press Ctrl+C to stop.                   ║
    ╚═══════════════════════════════════════════╝
    """)
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        log.info("\nBot stopped by user. Goodbye!")
        send_mac_notification("DMV Hunter Stopped", "Bot was stopped. No longer monitoring.", "Purr")


if __name__ == "__main__":
    main()
