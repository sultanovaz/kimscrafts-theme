#!/usr/bin/env python3
"""
Colorado DMV Appointment Finder - Westminster Area
Scrapes the Colorado DMV cxmflow appointment system to find the
soonest available reinstatement appointment near Westminster, CO.

Usage:
    pip install requests beautifulsoup4
    python dmv-appointment-finder.py
"""

import requests
import json
import re
import sys
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://coloradoappt.cxmflow.com"
SCHEDULER_GUID = "d74f48b1-33a9-428c-acd1-d7d1bfc9555c"
APPOINTMENT_URL = f"{BASE_URL}/Appointment/Index/{SCHEDULER_GUID}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}

AJAX_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}

# DMV offices within 30-40 min driving of Westminster, CO
# with reinstatement services
WESTMINSTER_NEARBY_OFFICES = {
    "Westminster": {
        "address": "8464 Federal Blvd, Westminster, CO 80031",
        "drive_min": 0,
    },
    "Lakewood": {
        "address": "1881 Pierce St, Lakewood, CO 80214",
        "drive_min": 20,
        "note": "Required for alcohol-related reinstatements",
    },
    "Golden": {
        "address": "16950 W. Colfax Ave, Suite 104, Golden, CO 80401",
        "drive_min": 25,
    },
    "Denver Central": {
        "address": "1351 5th St, Suite 100, Denver, CO 80204",
        "drive_min": 25,
    },
    "Denver (Peoria)": {
        "address": "4685 Peoria St, Suite 115, Denver, CO 80239",
        "drive_min": 30,
    },
    "Boulder": {
        "address": "4800 Baseline Rd, Suite A102, Boulder, CO 80303",
        "drive_min": 35,
    },
    "Aurora": {
        "address": "14391 E. 4th Ave, Aurora, CO 80011",
        "drive_min": 35,
    },
}


def create_session():
    session = requests.Session()
    session.headers.update(HEADERS)
    return session


def get_initial_page(session):
    """Load the appointment page and extract tokens, location IDs, and service types."""
    print(f"[*] Loading appointment page: {APPOINTMENT_URL}")
    resp = session.get(APPOINTMENT_URL, timeout=30)
    resp.raise_for_status()
    print(f"[+] Page loaded (status {resp.status_code})")

    soup = BeautifulSoup(resp.text, "html.parser")

    # Extract anti-forgery token
    token_input = soup.find("input", {"name": "__RequestVerificationToken"})
    token = token_input["value"] if token_input else None

    # Extract any embedded JSON data
    scripts = soup.find_all("script")
    page_data = {}
    for script in scripts:
        if script.string:
            # Look for location data, service types, etc.
            for pattern in [
                r"var\s+locations?\s*=\s*(\[.*?\]);",
                r"var\s+services?\s*=\s*(\[.*?\]);",
                r"var\s+appointmentTypes?\s*=\s*(\[.*?\]);",
                r'"locations?"\s*:\s*(\[.*?\])',
                r'"services?"\s*:\s*(\[.*?\])',
                r"locationData\s*=\s*(\{.*?\});",
                r"serviceData\s*=\s*(\{.*?\});",
            ]:
                match = re.search(pattern, script.string, re.DOTALL)
                if match:
                    try:
                        data = json.loads(match.group(1))
                        page_data[pattern.split("\\s")[0].replace("var", "").strip()] = data
                    except json.JSONDecodeError:
                        pass

    # Extract all form fields
    forms = soup.find_all("form")
    form_data = {}
    for form in forms:
        action = form.get("action", "")
        inputs = form.find_all(["input", "select"])
        for inp in inputs:
            name = inp.get("name", inp.get("id", ""))
            value = inp.get("value", "")
            if name:
                form_data[name] = value

    # Extract select/dropdown options (locations, services)
    selects = soup.find_all("select")
    select_options = {}
    for sel in selects:
        sel_name = sel.get("name", sel.get("id", "unknown"))
        options = []
        for opt in sel.find_all("option"):
            options.append({
                "value": opt.get("value", ""),
                "text": opt.get_text(strip=True),
            })
        if options:
            select_options[sel_name] = options

    # Extract links that might be API endpoints
    links = set()
    for a_tag in soup.find_all("a", href=True):
        links.add(a_tag["href"])
    for script in scripts:
        if script.get("src"):
            links.add(script["src"])

    # Look for API URLs in JavaScript
    api_urls = set()
    for script in scripts:
        if script.string:
            for pattern in [
                r'["\'](/(?:api|Appointment|Schedule|Calendar|Location|Service)[^"\']*)["\']',
                r"url\s*:\s*[\"']([^\"']+)[\"']",
                r"fetch\s*\(\s*[\"']([^\"']+)[\"']",
                r"\$\.(?:get|post|ajax)\s*\(\s*[\"']([^\"']+)[\"']",
            ]:
                matches = re.findall(pattern, script.string)
                api_urls.update(matches)

    return {
        "token": token,
        "page_data": page_data,
        "form_data": form_data,
        "select_options": select_options,
        "links": links,
        "api_urls": api_urls,
        "html_snippet": resp.text[:3000],
        "full_html": resp.text,
    }


def discover_api_endpoints(session, page_info):
    """Try common cxmflow API endpoint patterns."""
    endpoints_to_try = [
        f"/Appointment/GetLocations/{SCHEDULER_GUID}",
        f"/Appointment/GetServices/{SCHEDULER_GUID}",
        f"/Appointment/GetAppointmentTypes/{SCHEDULER_GUID}",
        f"/api/Appointment/GetLocations/{SCHEDULER_GUID}",
        f"/api/Appointment/GetServices/{SCHEDULER_GUID}",
        f"/api/Location/GetAll/{SCHEDULER_GUID}",
        f"/api/Schedule/GetAvailableDates",
        f"/api/Schedule/GetTimeSlots",
        f"/Appointment/GetLocationList",
        f"/Appointment/GetServiceList",
        f"/Appointment/LocationList/{SCHEDULER_GUID}",
        f"/Appointment/ServiceList/{SCHEDULER_GUID}",
        "/Appointment/GetLocations",
        "/Appointment/GetServices",
        "/Schedule/GetAvailableDates",
        "/Schedule/GetTimeSlots",
        "/Calendar/GetAvailableDates",
        "/Calendar/GetTimeSlots",
    ]

    # Also add discovered API URLs
    for url in page_info.get("api_urls", set()):
        if url.startswith("/"):
            endpoints_to_try.append(url)

    results = {}
    for endpoint in endpoints_to_try:
        url = urljoin(BASE_URL, endpoint)
        try:
            resp = session.get(url, headers=AJAX_HEADERS, timeout=10)
            if resp.status_code == 200 and resp.text.strip():
                try:
                    data = resp.json()
                    results[endpoint] = data
                    print(f"[+] Found API endpoint: {endpoint}")
                except (json.JSONDecodeError, ValueError):
                    if len(resp.text) < 5000:
                        results[endpoint] = resp.text
        except requests.RequestException:
            pass

    # Try POST requests too
    post_endpoints = [
        f"/Appointment/GetLocations",
        f"/Appointment/GetServices",
        f"/Appointment/GetAvailableDates",
        f"/Appointment/GetAvailableSlots",
        f"/Appointment/GetTimeSlots",
    ]

    post_data = {"schedulerGuid": SCHEDULER_GUID}
    if page_info.get("token"):
        post_data["__RequestVerificationToken"] = page_info["token"]

    for endpoint in post_endpoints:
        url = urljoin(BASE_URL, endpoint)
        try:
            resp = session.post(url, data=post_data, headers=AJAX_HEADERS, timeout=10)
            if resp.status_code == 200 and resp.text.strip():
                try:
                    data = resp.json()
                    results[f"POST {endpoint}"] = data
                    print(f"[+] Found POST endpoint: {endpoint}")
                except (json.JSONDecodeError, ValueError):
                    pass
        except requests.RequestException:
            pass

    return results


def check_availability_for_location(session, page_info, location_id, service_id=None):
    """Check appointment availability for a specific location."""
    today = datetime.now()
    results = []

    # Try various date-fetching endpoints
    date_endpoints = [
        "/Appointment/GetAvailableDates",
        "/Schedule/GetAvailableDates",
        "/Calendar/GetAvailableDates",
        "/api/Schedule/GetAvailableDates",
    ]

    for endpoint in date_endpoints:
        url = urljoin(BASE_URL, endpoint)
        params = {
            "locationId": location_id,
            "schedulerGuid": SCHEDULER_GUID,
            "month": today.month,
            "year": today.year,
        }
        if service_id:
            params["serviceId"] = service_id

        if page_info.get("token"):
            params["__RequestVerificationToken"] = page_info["token"]

        try:
            # Try GET
            resp = session.get(url, params=params, headers=AJAX_HEADERS, timeout=10)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    if data:
                        results.append({"endpoint": endpoint, "method": "GET", "data": data})
                except (json.JSONDecodeError, ValueError):
                    pass

            # Try POST
            resp = session.post(url, data=params, headers=AJAX_HEADERS, timeout=10)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    if data:
                        results.append({"endpoint": endpoint, "method": "POST", "data": data})
                except (json.JSONDecodeError, ValueError):
                    pass
        except requests.RequestException:
            pass

    return results


def analyze_page_structure(html):
    """Deep analysis of the page to find how the scheduling wizard works."""
    soup = BeautifulSoup(html, "html.parser")

    print("\n[*] Analyzing page structure...")

    # Find all JavaScript files
    js_files = []
    for script in soup.find_all("script", src=True):
        js_files.append(script["src"])
        print(f"    JS file: {script['src']}")

    # Find all divs that might be wizard steps
    wizard_steps = soup.find_all(class_=re.compile(r"step|wizard|panel|tab", re.I))
    for step in wizard_steps:
        step_id = step.get("id", "no-id")
        step_class = step.get("class", [])
        print(f"    Wizard step: id={step_id}, class={step_class}")

    # Find buttons
    buttons = soup.find_all(["button", "input"], type=re.compile(r"submit|button"))
    for btn in buttons:
        print(f"    Button: {btn.get('id', '')} - {btn.get_text(strip=True)[:50]}")

    # Find data attributes
    data_elements = soup.find_all(attrs={"data-url": True})
    for elem in data_elements:
        print(f"    Data URL: {elem['data-url']}")

    data_elements = soup.find_all(attrs={"data-action": True})
    for elem in data_elements:
        print(f"    Data action: {elem['data-action']}")

    return js_files


def fetch_js_for_api_urls(session, js_files):
    """Fetch JavaScript files to find API endpoint patterns."""
    api_endpoints = set()

    for js_url in js_files:
        full_url = urljoin(BASE_URL, js_url)
        try:
            resp = session.get(full_url, timeout=15)
            if resp.status_code == 200:
                # Search for API patterns
                patterns = [
                    r'["\'](/Appointment/[^"\']+)["\']',
                    r'["\'](/Schedule/[^"\']+)["\']',
                    r'["\'](/Calendar/[^"\']+)["\']',
                    r'["\'](/api/[^"\']+)["\']',
                    r'["\'](/Location/[^"\']+)["\']',
                    r'url\s*[:=]\s*["\']([^"\']+/(?:Get|Set|Save|Load|Check)[^"\']*)["\']',
                    r'ajax\s*\(\s*\{[^}]*url\s*:\s*["\']([^"\']+)["\']',
                ]
                for pattern in patterns:
                    matches = re.findall(pattern, resp.text)
                    for m in matches:
                        api_endpoints.add(m)
                        print(f"    [JS] Found endpoint: {m}")
        except requests.RequestException:
            pass

    return api_endpoints


def main():
    print("=" * 70)
    print("  Colorado DMV Appointment Finder")
    print("  Finding soonest reinstatement appointments near Westminster, CO")
    print("=" * 70)
    print()

    session = create_session()

    # Step 1: Load the main page
    try:
        page_info = get_initial_page(session)
    except requests.RequestException as e:
        print(f"[!] Failed to load appointment page: {e}")
        print("[!] The site may require browser-based access.")
        print_manual_instructions()
        return

    # Print what we found
    print(f"\n[*] Anti-forgery token: {'Found' if page_info['token'] else 'Not found'}")
    print(f"[*] Form fields found: {len(page_info['form_data'])}")
    for k, v in page_info["form_data"].items():
        print(f"    {k}: {v[:80] if v else '(empty)'}")

    print(f"\n[*] Dropdown menus found: {len(page_info['select_options'])}")
    for sel_name, options in page_info["select_options"].items():
        print(f"\n    [{sel_name}]")
        for opt in options:
            print(f"      {opt['value']}: {opt['text']}")

    print(f"\n[*] Embedded data found: {len(page_info['page_data'])}")
    for k, v in page_info["page_data"].items():
        print(f"    {k}: {json.dumps(v)[:200]}")

    print(f"\n[*] API URLs found in scripts: {len(page_info['api_urls'])}")
    for url in page_info["api_urls"]:
        print(f"    {url}")

    # Step 2: Deep page analysis
    js_files = analyze_page_structure(page_info["full_html"])

    # Step 3: Fetch JS files for more API endpoints
    if js_files:
        print("\n[*] Scanning JavaScript files for API endpoints...")
        more_endpoints = fetch_js_for_api_urls(session, js_files)
        page_info["api_urls"].update(more_endpoints)

    # Step 4: Discover API endpoints
    print("\n[*] Probing API endpoints...")
    api_results = discover_api_endpoints(session, page_info)

    if api_results:
        print(f"\n[+] Found {len(api_results)} working API endpoints!")
        for endpoint, data in api_results.items():
            print(f"\n  Endpoint: {endpoint}")
            if isinstance(data, dict) or isinstance(data, list):
                print(f"  Data: {json.dumps(data, indent=2)[:500]}")
            else:
                print(f"  Response: {str(data)[:500]}")

        # Step 5: Try to get availability for each location
        # Parse location IDs from API results
        locations = []
        for endpoint, data in api_results.items():
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        loc_id = item.get("Id") or item.get("id") or item.get("LocationId") or item.get("locationId")
                        loc_name = item.get("Name") or item.get("name") or item.get("LocationName") or item.get("locationName")
                        if loc_id and loc_name:
                            locations.append({"id": loc_id, "name": loc_name})

        if locations:
            print(f"\n[*] Found {len(locations)} locations, checking availability...")
            for loc in locations:
                # Check if this location is near Westminster
                loc_name = loc["name"].lower()
                near_westminster = any(
                    office.lower() in loc_name
                    for office in WESTMINSTER_NEARBY_OFFICES.keys()
                )

                if near_westminster or len(locations) <= 15:
                    print(f"\n  Checking: {loc['name']} (ID: {loc['id']})")
                    avail = check_availability_for_location(session, page_info, loc["id"])
                    if avail:
                        for a in avail:
                            print(f"    Available dates: {json.dumps(a['data'], indent=2)[:300]}")
                    else:
                        print(f"    No availability data returned")
    else:
        print("\n[!] Could not discover API endpoints automatically.")
        print("[*] The page HTML structure will be saved for manual inspection.")

    # Save the full HTML for inspection
    with open("dmv_page_dump.html", "w") as f:
        f.write(page_info["full_html"])
    print(f"\n[*] Full page HTML saved to dmv_page_dump.html")

    # Print manual instructions regardless
    print_manual_instructions()


def print_manual_instructions():
    """Print instructions for manually finding appointments."""
    print("\n")
    print("=" * 70)
    print("  QUICK GUIDE: Finding Your Reinstatement Appointment")
    print("=" * 70)
    print("""
DMV OFFICES NEAR WESTMINSTER (sorted by drive time):
=====================================================

1. WESTMINSTER - 8464 Federal Blvd, Westminster, CO 80031
   Drive: ~0 min | Hours: 8am-5pm Mon-Fri
   Avg wait: ~16 days for appointment
   Services: Full service including reinstatements

2. LAKEWOOD - 1881 Pierce St, Lakewood, CO 80214
   Drive: ~20 min | Hours: 8am-5pm Mon-Fri
   Avg wait: ~5 days (often shorter!)
   Services: Full service, REQUIRED for alcohol-related reinstatements
   ** BEST BET FOR SOONEST APPOINTMENT **

3. GOLDEN - 16950 W. Colfax Ave, Suite 104, Golden, CO 80401
   Drive: ~25 min | Hours: 8am-5pm Mon-Fri
   Services: Full service including reinstatements

4. DENVER CENTRAL - 1351 5th St, Suite 100, Denver, CO 80204
   Drive: ~25 min | Hours: 8am-5pm Mon-Fri
   Avg wait: ~11 days
   Services: Full service including reinstatements

5. DENVER (PEORIA) - 4685 Peoria St, Suite 115, Denver, CO 80239
   Drive: ~30 min | Hours: 8am-5pm Mon-Fri
   Services: Full service including reinstatements

6. BOULDER - 4800 Baseline Rd, Suite A102, Boulder, CO 80303
   Drive: ~35 min | Hours: 8am-5pm Mon-Fri
   Services: Full service including reinstatements

7. AURORA - 14391 E. 4th Ave, Aurora, CO 80011
   Drive: ~35 min | Hours: 8am-5pm Mon-Fri
   Services: Full service including reinstatements


HOW TO BOOK THE SOONEST APPOINTMENT:
=====================================

FASTEST METHOD - Check ALL offices at once:
1. Go to: https://coloradoappt.cxmflow.com/Appointment/Index/d74f48b1-33a9-428c-acd1-d7d1bfc9555c
2. Select service type: "Reinstatement" (or "Financial Responsibility")
3. For EACH office listed above, select it and note the first available date
4. The first available date is auto-highlighted on the calendar
5. Pick the office with the soonest date and book it

PRO TIPS for getting an earlier slot:
- Check Lakewood FIRST - it often has 5-day waits vs 16 for Westminster
- Check early morning (8-9am) - new cancellation slots appear overnight
- Try smaller offices (Golden, Boulder) - they often have shorter waits
- Call 720-295-2965 to ask about cancellation availability
- Check back frequently - cancellations open up slots throughout the day

REINSTATEMENT REQUIREMENTS:
============================
- Reinstatement fee: $95 (check, money order, or card)
- SR-22 insurance proof (if required for your case)
- Valid ID
- Any court-ordered documents
- If alcohol-related: MUST go to Lakewood office or do online

ONLINE REINSTATEMENT (skip the office!):
=========================================
If eligible, you may be able to reinstate online:
  https://mydmv.colorado.gov
- Not all revocation types qualify for online reinstatement
- Check eligibility at the site above

PHONE: 720-295-2965 (ask about same-day cancellations!)

NOTE: All offices closed Monday May 25 (Memorial Day) and
      today is May 27, so offices are open today.
""")


if __name__ == "__main__":
    main()
