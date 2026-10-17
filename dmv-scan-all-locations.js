// =============================================================
// Colorado DMV - Scan ALL Locations for Soonest Appointment
// =============================================================
// HOW TO USE ON iPHONE:
//
// METHOD 1 - Bookmarklet (recommended):
//   1. Open Safari, go to any page, bookmark it
//   2. Edit the bookmark name to "DMV Scanner"
//   3. Replace the URL with the ENTIRE contents of this file
//      (starting from "javascript:" below)
//   4. Go to the DMV appointment page:
//      https://coloradoappt.cxmflow.com/Appointment/Index/d74f48b1-33a9-428c-acd1-d7d1bfc9555c
//   5. Tap the bookmarks icon, tap "DMV Scanner"
//   6. Wait for results!
//
// METHOD 2 - Paste in address bar:
//   1. Open the DMV page in Safari
//   2. Copy EVERYTHING below the "javascript:" line
//   3. Tap the address bar, type "javascript:" then paste
//   4. Hit Go
//
// METHOD 3 - Desktop Chrome/Firefox:
//   1. Open the DMV page
//   2. Press F12 (DevTools), go to Console tab
//   3. Paste everything below and press Enter
// =============================================================

javascript:void(function(){
  var results = [];
  var statusDiv = document.createElement('div');
  statusDiv.id = 'dmv-scanner-status';
  statusDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#1a1a2e;color:#00ff88;font-family:monospace;font-size:14px;padding:15px;max-height:80vh;overflow-y:auto;border-bottom:3px solid #00ff88;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
  document.body.appendChild(statusDiv);

  function log(msg) {
    statusDiv.innerHTML += msg + '<br>';
    statusDiv.scrollTop = statusDiv.scrollHeight;
    console.log(msg);
  }

  log('🔍 <b>DMV APPOINTMENT SCANNER</b> - Scanning all locations...');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Find the location dropdown - try common selectors
  var locationSelect = document.querySelector('select[id*="ocation"], select[id*="ddlLocation"], select[name*="ocation"], select[id*="Unit"], select[name*="Unit"], select[id*="branch"], select[name*="branch"]');

  // If not found by ID/name, try finding by looking at all selects
  if (!locationSelect) {
    var allSelects = document.querySelectorAll('select');
    log('Found ' + allSelects.length + ' dropdown(s) on page');
    for (var i = 0; i < allSelects.length; i++) {
      var s = allSelects[i];
      var optCount = s.options.length;
      log('  Select #' + i + ': id="' + s.id + '" name="' + s.name + '" options=' + optCount);
      // The location dropdown typically has multiple options (one per office)
      if (optCount > 3) {
        locationSelect = s;
        break;
      }
    }
  }

  if (!locationSelect) {
    // Maybe it uses radio buttons or a different UI
    var radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      log('Found ' + radios.length + ' radio buttons instead of dropdown');
      log('Radio names: ' + Array.from(new Set(Array.from(radios).map(function(r){return r.name}))).join(', '));
    }

    // Check for clickable list items
    var listItems = document.querySelectorAll('li[data-id], li[data-value], .location-item, .list-group-item');
    if (listItems.length > 0) {
      log('Found ' + listItems.length + ' clickable list items');
    }

    // Dump page structure for debugging
    log('');
    log('<b>PAGE STRUCTURE DEBUG:</b>');
    var forms = document.querySelectorAll('form');
    log('Forms: ' + forms.length);
    forms.forEach(function(f, i) {
      log('  Form #' + i + ': action="' + f.action + '"');
    });

    var inputs = document.querySelectorAll('input, select, textarea');
    log('Input fields: ' + inputs.length);
    inputs.forEach(function(inp) {
      log('  ' + inp.tagName + ' id="' + inp.id + '" name="' + inp.name + '" type="' + (inp.type||'') + '" value="' + (inp.value||'').substring(0,50) + '"');
    });

    var buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
    log('Buttons: ' + buttons.length);
    buttons.forEach(function(b) {
      log('  ' + b.tagName + ' id="' + b.id + '" text="' + (b.textContent||'').trim().substring(0,40) + '"');
    });

    // Look for Angular/React/Vue data
    if (window.__NEXT_DATA__) log('Next.js data found: ' + JSON.stringify(window.__NEXT_DATA__).substring(0,200));
    if (window.ng) log('Angular detected');
    if (window.__NUXT__) log('Nuxt.js data found');
    if (document.querySelector('[ng-app], [data-ng-app]')) log('AngularJS detected');
    if (document.querySelector('[data-reactroot]')) log('React detected');

    // Check for any global JS variables with location/appointment data
    var globals = ['locations', 'offices', 'branches', 'units', 'appointmentData', 'scheduleData', 'calendarData', 'availableDates', 'serviceTypes'];
    globals.forEach(function(g) {
      if (window[g]) {
        log('window.' + g + ' = ' + JSON.stringify(window[g]).substring(0,200));
      }
    });

    log('');
    log('⚠️ Could not find location dropdown automatically.');
    log('Please scroll down and note what you see, then share a screenshot.');
    return;
  }

  // Found the location dropdown!
  var options = Array.from(locationSelect.options).filter(function(o) {
    return o.value && o.value !== '' && o.value !== '0' && o.value !== '-1';
  });

  log('✅ Found location dropdown: "' + locationSelect.id + '" with ' + options.length + ' locations');
  log('');

  // Also find the service type dropdown if there is one
  var serviceSelect = null;
  var allSelects = document.querySelectorAll('select');
  allSelects.forEach(function(s) {
    if (s !== locationSelect && s.options.length > 1) {
      var hasReinstate = false;
      Array.from(s.options).forEach(function(o) {
        if (o.text.toLowerCase().indexOf('reinstate') >= 0 || o.text.toLowerCase().indexOf('financial') >= 0) {
          hasReinstate = true;
          s.value = o.value;
        }
      });
      if (hasReinstate) {
        serviceSelect = s;
        log('✅ Found service dropdown, selected reinstatement option');
      }
    }
  });

  var locationIndex = 0;

  function scanNextLocation() {
    if (locationIndex >= options.length) {
      showResults();
      return;
    }

    var option = options[locationIndex];
    var locationName = option.text.trim();
    var locationValue = option.value;

    log('📍 [' + (locationIndex + 1) + '/' + options.length + '] Checking: <b>' + locationName + '</b>...');

    // Select the location
    locationSelect.value = locationValue;

    // Trigger change events
    var events = ['change', 'input'];
    events.forEach(function(evtName) {
      var evt = new Event(evtName, { bubbles: true });
      locationSelect.dispatchEvent(evt);
    });

    // Also try jQuery trigger if available
    if (window.jQuery || window.$) {
      try { (window.jQuery || window.$)(locationSelect).trigger('change'); } catch(e) {}
    }

    // Wait for calendar/dates to load
    setTimeout(function() {
      var firstAvailable = findFirstAvailableDate();

      if (firstAvailable) {
        results.push({
          location: locationName,
          date: firstAvailable,
          value: locationValue
        });
        log('  ✅ First available: <b style="color:#ffcc00">' + firstAvailable + '</b>');
      } else {
        log('  ❌ No dates found or fully booked');
      }

      locationIndex++;
      setTimeout(scanNextLocation, 1500);
    }, 2500);
  }

  function findFirstAvailableDate() {
    // Strategy 1: Look for calendar cells that are clickable/available
    var calendarCells = document.querySelectorAll(
      'td.available, td:not(.disabled):not(.unavailable):not(.past) a, ' +
      '.calendar-day.available, .calendar-day:not(.disabled), ' +
      '.day.available, .available-day, ' +
      'td[data-available="true"], td.open, ' +
      '.fc-day:not(.fc-disabled-day), ' +
      '.datepicker td:not(.disabled):not(.old):not(.new).day, ' +
      '.ui-datepicker td:not(.ui-state-disabled) a, ' +
      'td.CalendarDay:not(.CalendarDay--blocked), ' +
      '.calendar td.open a, .calendar td.avail a'
    );

    if (calendarCells.length > 0) {
      var firstCell = calendarCells[0];
      var dateText = firstCell.textContent.trim() || firstCell.getAttribute('data-date') || firstCell.getAttribute('title') || firstCell.parentElement.getAttribute('data-date');
      var fullDate = firstCell.getAttribute('data-date') || firstCell.getAttribute('data-full-date') || firstCell.getAttribute('title');
      return fullDate || dateText;
    }

    // Strategy 2: Look for highlighted/selected first available date
    var highlighted = document.querySelector(
      '.first-available, .highlighted, .selected-date, .earliest, ' +
      '.fc-highlight, .ui-datepicker-current-day, ' +
      '.active-date, .today.available, .bg-success, ' +
      '[class*="highlight"], [class*="first-avail"], [class*="earliest"]'
    );
    if (highlighted) {
      return highlighted.textContent.trim() || highlighted.getAttribute('data-date') || highlighted.getAttribute('title');
    }

    // Strategy 3: Look for date text anywhere on the page
    var dateElements = document.querySelectorAll(
      '.next-available, .first-available-date, .available-date, ' +
      '#nextAvailable, #firstAvailable, [id*="vailableDate"], ' +
      '.appointment-date, .slot-date'
    );
    if (dateElements.length > 0) {
      return dateElements[0].textContent.trim();
    }

    // Strategy 4: Look for time slots which indicate date availability
    var timeSlots = document.querySelectorAll(
      '.time-slot, .timeslot, .slot, .available-time, ' +
      'input[type="radio"][name*="time"], input[type="radio"][name*="slot"]'
    );
    if (timeSlots.length > 0) {
      // There are time slots, so dates are available
      var dateHeader = document.querySelector('h3, h4, .date-header, .calendar-header, [class*="date"]');
      if (dateHeader) return dateHeader.textContent.trim();
      return 'Slots available (check calendar)';
    }

    // Strategy 5: Parse any visible date-like text near the calendar
    var calendarArea = document.querySelector(
      '.calendar, #calendar, [id*="calendar"], [id*="Calendar"], ' +
      '.datepicker, #datepicker, .schedule, #schedule'
    );
    if (calendarArea) {
      var dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\w+ \d{1,2},? \d{4})/;
      var match = calendarArea.textContent.match(dateRegex);
      if (match) return match[0];
    }

    // Strategy 6: Check for "no availability" messages
    var noAvail = document.querySelector(
      '.no-availability, .unavailable-message, .alert-warning, .alert-danger, ' +
      '.no-appointments, [class*="no-avail"], [class*="fully-booked"]'
    );
    if (noAvail && noAvail.offsetParent !== null) {
      return null;
    }

    return null;
  }

  function showResults() {
    log('');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📊 <b style="font-size:16px;color:#ffcc00">RESULTS - SORTED BY SOONEST DATE</b>');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (results.length === 0) {
      log('');
      log('⚠️ No available dates found at any location.');
      log('This might mean the calendar uses a different format.');
      log('Try the manual method: select each location in the dropdown');
      log('and look at the calendar for highlighted dates.');
      return;
    }

    // Try to sort by date
    results.sort(function(a, b) {
      var dateA = new Date(a.date);
      var dateB = new Date(b.date);
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
        return a.date.localeCompare(b.date);
      }
      return dateA - dateB;
    });

    results.forEach(function(r, i) {
      var style = i === 0 ? 'color:#00ff88;font-size:16px;font-weight:bold' : 'color:#ffffff';
      var prefix = i === 0 ? '🏆 SOONEST → ' : '  ' + (i + 1) + '. ';
      log('<span style="' + style + '">' + prefix + r.location + ': ' + r.date + '</span>');
    });

    log('');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('👆 <b>SELECT THE TOP RESULT</b> in the dropdown and book it!');
    log('');

    // Auto-select the best result
    if (results[0]) {
      locationSelect.value = results[0].value;
      var evt = new Event('change', { bubbles: true });
      locationSelect.dispatchEvent(evt);
      if (window.jQuery || window.$) {
        try { (window.jQuery || window.$)(locationSelect).trigger('change'); } catch(e) {}
      }
      log('✅ Auto-selected: <b>' + results[0].location + '</b>');
      log('Now pick your time slot and click NEXT!');
    }
  }

  // Start scanning
  scanNextLocation();
}());
