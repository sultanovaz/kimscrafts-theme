#!/usr/bin/env python3
"""
Step 1: Discovery script - run this ONCE on your Mac to capture the page structure.
This tells the bot how the cxmflow appointment page is built.

Usage:
    pip3 install playwright
    python3 -m playwright install chromium
    python3 dmv-discover.py
"""

import asyncio
import json
from playwright.async_api import async_playwright

URL = "https://coloradoappt.cxmflow.com/Appointment/Index/d74f48b1-33a9-428c-acd1-d7d1bfc9555c"

async def main():
    print("=" * 60)
    print("  DMV Page Discovery - Capturing page structure")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        print(f"\n[*] Loading: {URL}")
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)

        print("[+] Page loaded. Analyzing structure...\n")

        structure = await page.evaluate("""() => {
            const result = {
                title: document.title,
                selects: [],
                inputs: [],
                buttons: [],
                forms: [],
                links: [],
                calendars: [],
                scripts: [],
                apiUrls: [],
                allText: document.body.innerText.substring(0, 3000),
            };

            // All select dropdowns with their options
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
                });
            });

            // All input fields
            document.querySelectorAll('input').forEach(inp => {
                result.inputs.push({
                    id: inp.id,
                    name: inp.name,
                    type: inp.type,
                    value: inp.value.substring(0, 100),
                    className: inp.className,
                    visible: inp.offsetParent !== null,
                });
            });

            // All buttons
            document.querySelectorAll('button, input[type="submit"], a.btn, [role="button"]').forEach(b => {
                result.buttons.push({
                    id: b.id,
                    text: b.textContent.trim().substring(0, 50),
                    className: b.className,
                    tagName: b.tagName,
                    type: b.type || '',
                    visible: b.offsetParent !== null,
                });
            });

            // Forms
            document.querySelectorAll('form').forEach(f => {
                result.forms.push({
                    id: f.id,
                    action: f.action,
                    method: f.method,
                });
            });

            // Calendar-like elements
            document.querySelectorAll('table, .calendar, [class*="calendar"], [class*="datepicker"], [id*="calendar"], [id*="Calendar"]').forEach(c => {
                result.calendars.push({
                    id: c.id,
                    className: c.className,
                    tagName: c.tagName,
                    html: c.outerHTML.substring(0, 1000),
                });
            });

            // Script sources
            document.querySelectorAll('script[src]').forEach(s => {
                result.scripts.push(s.src);
            });

            // Find API URLs in inline scripts
            document.querySelectorAll('script:not([src])').forEach(s => {
                if (s.textContent) {
                    const urlPatterns = [
                        /['"](\\/(?:Appointment|Schedule|Calendar|api|Location|Service)[^'"]*)['"]/g,
                        /url\s*[:=]\s*['"]([^'"]+)['"]/g,
                    ];
                    urlPatterns.forEach(pattern => {
                        let match;
                        while ((match = pattern.exec(s.textContent)) !== null) {
                            result.apiUrls.push(match[1]);
                        }
                    });
                }
            });

            return result;
        }""")

        # Also capture network requests when clicking a location
        network_log = []

        page.on("request", lambda req: network_log.append({
            "method": req.method,
            "url": req.url,
            "post_data": req.post_data[:500] if req.post_data else None,
        }))

        # If there are select dropdowns, try clicking through one to see what network requests fire
        if structure["selects"]:
            biggest_select = max(structure["selects"], key=lambda s: s["optionCount"])
            if biggest_select["optionCount"] > 1:
                sel_id = biggest_select["id"]
                sel_name = biggest_select["name"]
                selector = f"#{sel_id}" if sel_id else f"select[name='{sel_name}']" if sel_name else f"select"

                print(f"[*] Triggering change on dropdown: {selector} (has {biggest_select['optionCount']} options)")

                # Pick the second option (first real one after placeholder)
                if len(biggest_select["options"]) > 1:
                    test_value = biggest_select["options"][1]["value"]
                    try:
                        await page.select_option(selector, test_value)
                        await asyncio.sleep(3)
                        print(f"[+] Selected option: {biggest_select['options'][1]['text']}")
                    except Exception as e:
                        print(f"[!] Could not select option: {e}")

        # Save everything
        output = {
            "page_structure": structure,
            "network_requests_after_selection": network_log,
        }

        with open("dmv-page-structure.json", "w") as f:
            json.dump(output, f, indent=2)

        print("\n" + "=" * 60)
        print("  RESULTS")
        print("=" * 60)

        print(f"\nPage title: {structure['title']}")
        print(f"\nDropdowns found: {len(structure['selects'])}")
        for s in structure["selects"]:
            print(f"  #{s['id'] or s['name'] or '?'} - {s['optionCount']} options (visible: {s['visible']})")
            for opt in s["options"][:5]:
                print(f"    {opt['value']}: {opt['text']}")
            if s["optionCount"] > 5:
                print(f"    ... and {s['optionCount'] - 5} more")

        print(f"\nInputs: {len(structure['inputs'])}")
        print(f"Buttons: {len(structure['buttons'])}")
        for b in structure["buttons"]:
            print(f"  [{b['tagName']}] {b['text']} (id={b['id']})")

        print(f"\nCalendar elements: {len(structure['calendars'])}")
        print(f"Script files: {len(structure['scripts'])}")
        print(f"API URLs found: {len(structure['apiUrls'])}")
        for url in structure["apiUrls"]:
            print(f"  {url}")

        print(f"\nNetwork requests captured: {len(network_log)}")
        for req in network_log:
            if "cxmflow" in req["url"]:
                print(f"  {req['method']} {req['url']}")
                if req["post_data"]:
                    print(f"    POST data: {req['post_data']}")

        print(f"\n[+] Full data saved to: dmv-page-structure.json")
        print(f"\n[*] Browser is still open - take a look at the page.")
        print(f"    Press Enter here when done to close.\n")

        input()
        await browser.close()

asyncio.run(main())
