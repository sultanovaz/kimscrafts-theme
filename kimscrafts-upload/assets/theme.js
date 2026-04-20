/* KIMSCRAFTS theme JS — vanilla, lean, no dependencies */
(function () {
  'use strict';

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.kc-reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -80px 0px', threshold: 0.1 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Mobile menu ---------- */
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileDrawer = document.querySelector('[data-mobile-drawer]');
  const menuClose = document.querySelector('[data-menu-close]');
  if (menuToggle && mobileDrawer) {
    menuToggle.addEventListener('click', () => {
      mobileDrawer.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  }
  if (menuClose && mobileDrawer) {
    menuClose.addEventListener('click', () => {
      mobileDrawer.classList.remove('is-open');
      document.body.style.overflow = '';
    });
  }

  /* ---------- Product gallery ---------- */
  function initGallery() {
    const gallery = document.querySelector('[data-gallery]');
    if (!gallery) return;
    const thumbs = gallery.querySelectorAll('[data-gallery-thumb]');
    const slides = gallery.querySelectorAll('[data-gallery-slide]');
    thumbs.forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        thumbs.forEach((t) => t.classList.remove('is-active'));
        slides.forEach((s) => s.classList.remove('is-active'));
        thumb.classList.add('is-active');
        if (slides[i]) slides[i].classList.add('is-active');
      });
    });
  }
  initGallery();

  /* ---------- Quantity selector ---------- */
  document.querySelectorAll('[data-qty]').forEach((qty) => {
    const input = qty.querySelector('input');
    const minus = qty.querySelector('[data-qty-minus]');
    const plus = qty.querySelector('[data-qty-plus]');
    if (minus) minus.addEventListener('click', () => {
      const v = Math.max(1, parseInt(input.value, 10) - 1);
      input.value = v;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (plus) plus.addEventListener('click', () => {
      input.value = parseInt(input.value, 10) + 1;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  /* ---------- Product variant selection ---------- */
  function initVariantPicker() {
    const form = document.querySelector('[data-product-form]');
    if (!form) return;
    const dataEl = document.querySelector('[data-product-json]');
    if (!dataEl) return;
    let product;
    try { product = JSON.parse(dataEl.textContent); } catch (e) { return; }

    const optionBtns = form.querySelectorAll('[data-option-btn]');
    const variantIdInput = form.querySelector('[name="id"]');
    const priceEl = document.querySelector('[data-price]');
    const submitBtn = form.querySelector('[data-add-to-cart]');
    const selectedLabels = form.querySelectorAll('[data-option-selected]');

    function updateSelection() {
      const selected = [];
      product.options.forEach((_, idx) => {
        const activeBtn = form.querySelector(`[data-option-idx="${idx}"].is-active`);
        selected.push(activeBtn ? activeBtn.dataset.optionValue : null);
      });

      // Update labels
      selectedLabels.forEach((label) => {
        const idx = parseInt(label.dataset.optionSelected, 10);
        label.textContent = selected[idx] || '';
      });

      // Find matching variant
      const variant = product.variants.find((v) =>
        v.options.every((opt, i) => opt === selected[i])
      );

      if (!variant) {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Unavailable'; }
        return;
      }

      if (variantIdInput) variantIdInput.value = variant.id;

      if (priceEl) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          priceEl.innerHTML = `<del>${formatMoney(variant.compare_at_price)}</del> <span class="on-sale">${formatMoney(variant.price)}</span>`;
        } else {
          priceEl.textContent = formatMoney(variant.price);
        }
      }

      if (submitBtn) {
        if (variant.available) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.labelAdd || 'Add to cart';
        } else {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sold out';
        }
      }

      // Update URL (shallow, for sharing)
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url);
      }
    }

    optionBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.optionIdx;
        form.querySelectorAll(`[data-option-idx="${idx}"]`).forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        updateSelection();
      });
    });

    updateSelection();
  }
  initVariantPicker();

  /* ---------- Money formatting ---------- */
  function formatMoney(cents) {
    const amount = (cents / 100).toFixed(2);
    const symbol = window.Shopify && window.Shopify.currency && window.Shopify.currency.active
      ? currencySymbol(window.Shopify.currency.active)
      : '$';
    return symbol + amount;
  }
  function currencySymbol(code) {
    const map = { USD: '$', CAD: '$', EUR: '€', GBP: '£', AUD: '$' };
    return map[code] || code + ' ';
  }

  /* ---------- Add to cart (AJAX) ---------- */
  const productForm = document.querySelector('[data-product-form]');
  if (productForm) {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = productForm.querySelector('[data-add-to-cart]');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Adding…';

      const formData = new FormData(productForm);
      try {
        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.description || 'Something went wrong');
        }
        await res.json();
        btn.textContent = 'Added ✓';
        await updateCartCount();
        // Go to cart so upsell apps can engage
        setTimeout(() => { window.location.href = '/cart'; }, 350);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = originalText;
        alert(err.message || 'Unable to add to cart');
      }
    });
  }

  async function updateCartCount() {
    try {
      const res = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } });
      const cart = await res.json();
      const el = document.querySelector('[data-cart-count]');
      if (el) {
        if (cart.item_count > 0) {
          el.textContent = cart.item_count;
          el.removeAttribute('hidden');
        } else {
          el.setAttribute('hidden', '');
        }
      }
    } catch (e) { /* noop */ }
  }

  /* ---------- Cart page: update qty / remove ---------- */
  document.querySelectorAll('[data-cart-update]').forEach((row) => {
    const input = row.querySelector('input[type="number"]');
    const key = row.dataset.key;
    if (!input || !key) return;

    let timer;
    input.addEventListener('change', () => {
      clearTimeout(timer);
      timer = setTimeout(() => updateCartItem(key, parseInt(input.value, 10)), 200);
    });
  });

  document.querySelectorAll('[data-cart-remove]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      updateCartItem(link.dataset.key, 0);
    });
  });

  async function updateCartItem(key, quantity) {
    try {
      await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ id: key, quantity })
      });
      window.location.reload();
    } catch (e) { alert('Unable to update cart'); }
  }

  /* ---------- Announcement rotator (if multiple messages) ---------- */
  const announce = document.querySelector('[data-announce-rotator]');
  if (announce) {
    const items = announce.querySelectorAll('.kc-announce__item');
    if (items.length > 1) {
      let current = 0;
      items.forEach((it, i) => { if (i !== 0) it.style.display = 'none'; });
      setInterval(() => {
        items[current].style.display = 'none';
        current = (current + 1) % items.length;
        items[current].style.display = '';
      }, 4000);
    }
  }
})();

/* =============================================================
   V2 — Qty-aware pricing, sticky ATC, countdown, gift note
   ============================================================= */
(function(){
  'use strict';

  /* ---- Money helpers (uses shop money format) ---- */
  function fmt(cents) {
    var amount = (Math.round(cents) / 100).toFixed(2);
    var sym = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) ? currencySym(window.Shopify.currency.active) : '$';
    return sym + amount;
  }
  function currencySym(code) {
    return ({USD:'$',CAD:'$',EUR:'€',GBP:'£',AUD:'$',NZD:'$',JPY:'¥'}[code] || (code + ' '));
  }

  /* ---- ATC price recomputer (qty × base + upsells) ---- */
  function initAtcPricing() {
    var form = document.querySelector('[data-product-form]');
    if (!form) return;
    var btn = form.querySelector('[data-add-to-cart]');
    if (!btn) return;
    var totalEl = btn.querySelector('[data-atc-total]');
    var qtyInput = form.querySelector('[name="quantity"]');
    var upsellSection = document.querySelector('[data-upsells]');
    var cbs = upsellSection ? upsellSection.querySelectorAll('.kc-upsell__cb') : [];
    var selectedCountEl = upsellSection ? upsellSection.querySelector('[data-upsells-selected]') : null;
    var stickyPrice = document.querySelector('[data-sticky-price]');

    function recompute() {
      var base = parseFloat(btn.dataset.basePrice || '0');
      var qty = parseInt((qtyInput && qtyInput.value) || '1', 10) || 1;
      if (qty < 1) qty = 1;
      var total = base * qty * 100; // cents
      var selected = 0;
      cbs.forEach(function(cb) {
        if (cb.checked) {
          total += parseFloat(cb.dataset.price || '0') * 100;
          selected++;
        }
      });
      if (totalEl) totalEl.textContent = fmt(total);
      if (selectedCountEl) selectedCountEl.textContent = selected;
      if (stickyPrice) stickyPrice.textContent = fmt(base * qty * 100);
    }

    if (qtyInput) {
      qtyInput.addEventListener('change', recompute);
      qtyInput.addEventListener('input', recompute);
    }
    cbs.forEach(function(cb) { cb.addEventListener('change', recompute); });

    // Also recompute on variant change (theme.js updates basePrice via data attribute when variant changes)
    var variantObserver = new MutationObserver(recompute);
    variantObserver.observe(btn, { attributes: true, attributeFilter: ['data-base-price'] });

    // Expose for variant-picker to update base-price
    window.kcUpdateBasePrice = function(newCents) {
      btn.dataset.basePrice = (newCents / 100).toString();
      recompute();
    };

    recompute();
  }

  /* ---- Hook into variant picker: update base-price when variant changes ---- */
  function enhanceVariantPicker() {
    var form = document.querySelector('[data-product-form]');
    if (!form) return;
    var dataEl = document.querySelector('[data-product-json]');
    if (!dataEl) return;
    var product;
    try { product = JSON.parse(dataEl.textContent); } catch(e){ return; }

    var btn = form.querySelector('[data-add-to-cart]');
    var variantInput = form.querySelector('[name="id"]');
    if (!btn || !variantInput) return;

    // Watch the variant id input for changes (theme.js variant picker sets it)
    var lastId = variantInput.value;
    function checkVariantChange() {
      if (variantInput.value !== lastId) {
        lastId = variantInput.value;
        var variant = product.variants.find(function(v){ return String(v.id) === String(lastId); });
        if (variant && window.kcUpdateBasePrice) {
          window.kcUpdateBasePrice(variant.price);
        }
      }
    }
    // Poll on clicks (simpler than MutationObserver for hidden input value)
    document.addEventListener('click', function(e) {
      if (e.target.closest('[data-option-btn]')) {
        setTimeout(checkVariantChange, 50);
      }
    });
  }

  /* ---- Add-to-cart with upsells ---- */
  function initUpsellAdd() {
    var sec = document.querySelector('[data-upsells]');
    var form = document.querySelector('[data-product-form]');
    if (!form) return;
    var cbs = sec ? sec.querySelectorAll('.kc-upsell__cb') : [];

    // Override form submission when upsells are selected OR always (consistent behavior)
    form.addEventListener('submit', async function(e){
      // Don't intercept if there are no upsells or none selected AND we're not overriding
      var checked = sec ? Array.from(cbs).filter(function(cb){ return cb.checked; }) : [];
      if (checked.length === 0) return; // let the base theme.js handle it
      e.preventDefault();
      e.stopImmediatePropagation();

      var btn = form.querySelector('[data-add-to-cart]');
      var labelEl = btn.querySelector('[data-atc-label]');
      var totalEl = btn.querySelector('[data-atc-total]');
      var sepEl = btn.querySelector('[data-atc-sep]');
      btn.disabled = true;
      var origLabel = labelEl ? labelEl.textContent : 'Add to cart';
      if (labelEl) labelEl.textContent = 'Adding…';
      if (totalEl) totalEl.style.display = 'none';
      if (sepEl) sepEl.style.display = 'none';

      var mainId = parseInt(form.querySelector('[name="id"]').value, 10);
      var qty = parseInt(form.querySelector('[name="quantity"]').value || '1', 10) || 1;
      var items = [{ id: mainId, quantity: qty }];

      checked.forEach(function(cb){
        var item = { id: parseInt(cb.dataset.upsellId, 10), quantity: 1 };
        var input = sec.querySelector('[data-upsell-input-for="'+cb.dataset.upsellId+'"]');
        if (input && input.value.trim()) {
          item.properties = {};
          item.properties[input.dataset.inputLabel || 'Custom'] = input.value.trim();
        }
        items.push(item);
      });

      try {
        var res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {'Content-Type':'application/json', 'Accept':'application/json'},
          body: JSON.stringify({ items: items })
        });
        if (!res.ok) throw new Error('Add failed');
        if (labelEl) labelEl.textContent = 'Added ✓';
        setTimeout(function(){ window.location.href = '/cart'; }, 350);
      } catch(err) {
        btn.disabled = false;
        if (labelEl) labelEl.textContent = origLabel;
        if (totalEl) totalEl.style.display = '';
        if (sepEl) sepEl.style.display = '';
        alert('Unable to add to cart. Try again.');
      }
    }, true);
  }

  /* ---- Sticky mobile ATC bar ---- */
  function initStickyAtc() {
    var bar = document.querySelector('[data-sticky-atc]');
    if (!bar) return;
    var form = document.querySelector('[data-product-form]');
    if (!form) return;
    var mainBtn = form.querySelector('[data-add-to-cart]');
    var stickyBtn = bar.querySelector('[data-sticky-atc-btn]');

    if (stickyBtn && mainBtn) {
      stickyBtn.addEventListener('click', function() {
        // Scroll main ATC into view and click it
        mainBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function(){ mainBtn.click(); }, 400);
      });
    }

    // Show when main ATC is scrolled out of view
    if ('IntersectionObserver' in window && mainBtn) {
      document.body.classList.add('has-sticky-atc');
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if (!entry.isIntersecting) {
            bar.classList.add('is-visible');
          } else {
            bar.classList.remove('is-visible');
          }
        });
      }, { rootMargin: '0px' });
      io.observe(mainBtn);
    }
  }

  /* ---- Countdown ---- */
  function initCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach(function(el){
      var deadline = new Date(el.dataset.deadline).getTime();
      if (isNaN(deadline)) return;
      var d = el.querySelector('[data-d]'),
          h = el.querySelector('[data-h]'),
          m = el.querySelector('[data-m]'),
          s = el.querySelector('[data-s]');
      function pad(n){ return n < 10 ? '0' + n : String(n); }
      function tick() {
        var now = Date.now();
        var diff = deadline - now;
        if (diff <= 0) {
          if (d) d.textContent = '00';
          if (h) h.textContent = '00';
          if (m) m.textContent = '00';
          if (s) s.textContent = '00';
          return;
        }
        var days = Math.floor(diff / (1000*60*60*24));
        var hours = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
        var mins = Math.floor((diff % (1000*60*60)) / (1000*60));
        var secs = Math.floor((diff % (1000*60)) / 1000);
        if (d) d.textContent = pad(days);
        if (h) h.textContent = pad(hours);
        if (m) m.textContent = pad(mins);
        if (s) s.textContent = pad(secs);
      }
      tick();
      setInterval(tick, 1000);
    });
  }

  /* ---- Gift note toggle ---- */
  function initGiftNote() {
    var wrap = document.querySelector('.kc-gift-note');
    if (!wrap) return;
    var toggle = wrap.querySelector('[data-gift-toggle]');
    var field = wrap.querySelector('.kc-gift-note__field');
    if (!toggle || !field) return;
    // If a note already exists, open by default
    if (field.value && field.value.trim()) {
      toggle.checked = true;
      wrap.classList.add('is-open');
    }
    toggle.addEventListener('change', function() {
      if (toggle.checked) {
        wrap.classList.add('is-open');
        field.focus();
      } else {
        wrap.classList.remove('is-open');
      }
    });
    // Save note on blur
    var saveTimer;
    field.addEventListener('input', function() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function() {
        fetch('/cart/update.js', {
          method: 'POST',
          headers: {'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify({ note: field.value })
        });
      }, 500);
    });
  }

  /* ---- Init ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initAtcPricing();
      enhanceVariantPicker();
      initUpsellAdd();
      initStickyAtc();
      initCountdowns();
      initGiftNote();
    });
  } else {
    initAtcPricing();
    enhanceVariantPicker();
    initUpsellAdd();
    initStickyAtc();
    initCountdowns();
    initGiftNote();
  }
})();

/* =============================================================
   Cart drawer
   ============================================================= */
(function(){
  var drawer = document.querySelector('[data-cart-drawer]');
  if (!drawer) return;
  var openers = document.querySelectorAll('[data-cart-drawer-open]');
  var closers = drawer.querySelectorAll('[data-drawer-close]');

  function open() {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    refresh();
  }
  function close() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  openers.forEach(function(b){ b.addEventListener('click', function(e){ e.preventDefault(); open(); }); });
  closers.forEach(function(b){ b.addEventListener('click', close); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });

  async function refresh() {
    try {
      var res = await fetch('/?sections=cart-drawer');
      var data = await res.json();
      if (data['cart-drawer']) {
        var temp = document.createElement('div');
        temp.innerHTML = data['cart-drawer'];
        var newBody = temp.querySelector('[data-drawer-body]');
        var currBody = drawer.querySelector('[data-drawer-body]');
        if (newBody && currBody) currBody.innerHTML = newBody.innerHTML;
        var newCount = temp.querySelector('[data-drawer-count]');
        var currCount = drawer.querySelector('[data-drawer-count]');
        if (newCount && currCount) currCount.textContent = newCount.textContent;
        var newFoot = temp.querySelector('.kc-drawer__foot');
        var currFoot = drawer.querySelector('.kc-drawer__foot');
        var newPanel = drawer.querySelector('.kc-drawer__panel');
        if (newFoot && currFoot) currFoot.outerHTML = newFoot.outerHTML;
        else if (newFoot && !currFoot && newPanel) newPanel.insertAdjacentHTML('beforeend', newFoot.outerHTML);
        else if (!newFoot && currFoot) currFoot.remove();
        bindQtyButtons();
      }
    } catch(e) { /* fail silently */ }
  }

  function bindQtyButtons() {
    drawer.querySelectorAll('[data-drawer-decrease], [data-drawer-increase]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        var key = btn.dataset.key;
        var row = btn.closest('.kc-drawer-item');
        var currQty = parseInt(row.querySelector('.kc-qty--sm span').textContent, 10);
        var newQty = btn.hasAttribute('data-drawer-decrease') ? currQty - 1 : currQty + 1;
        if (newQty < 0) newQty = 0;
        try {
          await fetch('/cart/change.js', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ id: key, quantity: newQty })
          });
          refresh();
        } catch(e){}
      });
    });
  }
  bindQtyButtons();
})();

/* =============================================================
   V3 — Reviews engine (filter, sort, paginate, photo lightbox)
   ============================================================= */
(function(){
  var sec = document.querySelector('[data-reviews-section]');
  if (!sec) return;
  var dataEl = sec.querySelector('[data-reviews-data]');
  if (!dataEl) return;
  var reviews;
  try { reviews = JSON.parse(dataEl.textContent); } catch(e){ reviews = []; }
  if (!reviews.length) return;

  var listEl = sec.querySelector('[data-review-list]');
  var emptyEl = sec.querySelector('[data-empty]');
  var loadMoreWrap = sec.querySelector('[data-loadmore-wrap]');
  var loadMoreBtn = sec.querySelector('[data-load-more]');
  var shownEl = sec.querySelector('[data-shown]');
  var filteredEl = sec.querySelector('[data-filtered]');
  var filterBtns = sec.querySelectorAll('[data-filter]');
  var sortSel = sec.querySelector('[data-sort]');
  var photoStrip = sec.querySelector('[data-photo-strip]');
  var lightbox = sec.querySelector('[data-lightbox]');
  var lightboxImg = sec.querySelector('[data-lightbox-img]');
  var lightboxClose = sec.querySelector('[data-lightbox-close]');
  var perPage = parseInt(sec.dataset.perPage || '8', 10);

  var currentFilter = 'all';
  var currentSort = 'recent';
  var visibleCount = perPage;

  // Compute summary
  function renderSummary() {
    var total = reviews.length;
    var sum = 0;
    var dist = {1:0, 2:0, 3:0, 4:0, 5:0};
    reviews.forEach(function(r){ sum += r.r; dist[r.r] = (dist[r.r]||0) + 1; });
    var avg = sum / total;
    var avgRounded = Math.round(avg * 10) / 10;
    var avgStr = avgRounded.toFixed(1);
    sec.querySelector('[data-avg-num]').textContent = avgStr;
    sec.querySelector('[data-total-count]').textContent = total;
    // Stars: fill partial based on avg
    var starsEl = sec.querySelector('[data-avg-stars]');
    var pct = (avgRounded / 5) * 100;
    starsEl.style.background = 'linear-gradient(90deg, var(--kc-tan) ' + pct + '%, var(--kc-line-dark) ' + pct + '%)';
    starsEl.style.webkitBackgroundClip = 'text';
    starsEl.style.backgroundClip = 'text';
    starsEl.style.color = 'transparent';
    // Bars
    for (var i = 1; i <= 5; i++) {
      var pct2 = total ? (dist[i] / total) * 100 : 0;
      var fill = sec.querySelector('[data-bar-fill="'+i+'"]');
      var cnt = sec.querySelector('[data-bar-count="'+i+'"]');
      if (fill) setTimeout(function(f,p){ return function(){ f.style.width = p + '%'; }; }(fill, pct2), 150);
      if (cnt) cnt.textContent = dist[i];
    }
  }

  function renderPhotoStrip() {
    if (!photoStrip) return;
    var withImg = reviews.filter(function(r){ return r.img; });
    photoStrip.innerHTML = withImg.slice(0, 12).map(function(r){
      return '<button type="button" class="kc-rv__photo" data-photo-open="'+escapeAttr(r.img)+'"><img src="'+escapeAttr(r.img)+'" alt="Customer photo" loading="lazy"></button>';
    }).join('');
    photoStrip.querySelectorAll('[data-photo-open]').forEach(function(btn){
      btn.addEventListener('click', function(){ openLightbox(btn.dataset.photoOpen); });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function starsHtml(r) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += i <= r ? '★' : '<span class="kc-rv-card__star-empty">★</span>';
    }
    return html;
  }

  function cardHtml(r) {
    var initial = (r.n || '?').charAt(0);
    return '<article class="kc-rv-card">' +
      '<header class="kc-rv-card__head">' +
        '<div class="kc-rv-card__who">' +
          '<div class="kc-rv-card__avatar" aria-hidden="true">' + escapeHtml(initial) + '</div>' +
          '<div>' +
            '<div class="kc-rv-card__name">' + escapeHtml(r.n) + ' <span class="kc-rv-card__verified">✓ Verified</span></div>' +
            '<div class="kc-rv-card__meta">' + escapeHtml(r.l) + ' · ' + escapeHtml(r.v) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="kc-rv-card__right">' +
          '<div class="kc-rv-card__stars">' + starsHtml(r.r) + '</div>' +
          '<div class="kc-rv-card__date">' + escapeHtml(r.d) + '</div>' +
        '</div>' +
      '</header>' +
      (r.t ? '<h4 class="kc-rv-card__title">' + escapeHtml(r.t) + '</h4>' : '') +
      '<p class="kc-rv-card__body">' + escapeHtml(r.b) + '</p>' +
      (r.img ? '<div class="kc-rv-card__img"><img src="'+escapeAttr(r.img)+'" alt="Customer photo" loading="lazy" data-card-img></div>' : '') +
      '<footer class="kc-rv-card__foot">' +
        '<button type="button" class="kc-rv-card__helpful" data-helpful-btn>' +
          '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M7 11v8h10l3-7v-2h-7l1-5c0-1-1-2-2-2l-4 8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>' +
          '<span>Helpful (<span data-helpful-count>' + (r.h || 0) + '</span>)</span>' +
        '</button>' +
      '</footer>' +
    '</article>';
  }

  function getFiltered() {
    var out = reviews.slice();
    if (currentFilter === 'photos') out = out.filter(function(r){ return r.img; });
    else if (currentFilter === '5' || currentFilter === '4' || currentFilter === '3' || currentFilter === '2' || currentFilter === '1') {
      var n = parseInt(currentFilter, 10);
      out = out.filter(function(r){ return r.r === n; });
    }
    // Sort
    out.sort(function(a, b){
      if (currentSort === 'recent') return (a.o || 0) - (b.o || 0);
      if (currentSort === 'helpful') return (b.h || 0) - (a.h || 0);
      if (currentSort === 'high') return (b.r || 0) - (a.r || 0) || (a.o || 0) - (b.o || 0);
      if (currentSort === 'low') return (a.r || 0) - (b.r || 0) || (a.o || 0) - (b.o || 0);
      return 0;
    });
    return out;
  }

  function render() {
    var filtered = getFiltered();
    var toShow = filtered.slice(0, visibleCount);
    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      loadMoreWrap.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = toShow.map(cardHtml).join('');
    // Bind helpful buttons
    listEl.querySelectorAll('[data-helpful-btn]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if (btn.classList.contains('is-voted')) return;
        btn.classList.add('is-voted');
        var cntEl = btn.querySelector('[data-helpful-count]');
        if (cntEl) cntEl.textContent = (parseInt(cntEl.textContent, 10) || 0) + 1;
      });
    });
    // Bind card images to lightbox
    listEl.querySelectorAll('[data-card-img]').forEach(function(img){
      img.addEventListener('click', function(){ openLightbox(img.src); });
    });
    // Load more
    if (filtered.length > visibleCount) {
      loadMoreWrap.hidden = false;
      shownEl.textContent = visibleCount;
      filteredEl.textContent = filtered.length;
    } else {
      loadMoreWrap.hidden = true;
    }
  }

  function openLightbox(src) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) lightbox.addEventListener('click', function(e){ if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeLightbox(); });

  // Filter chips
  filterBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      filterBtns.forEach(function(b){ b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      currentFilter = btn.dataset.filter;
      visibleCount = perPage;
      render();
    });
  });
  // Star bar filters
  sec.querySelectorAll('[data-filter-star]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var star = btn.dataset.filterStar;
      var chip = sec.querySelector('[data-filter="'+star+'"]');
      if (chip) chip.click();
    });
  });
  // Sort
  if (sortSel) sortSel.addEventListener('change', function(){
    currentSort = sortSel.value;
    visibleCount = perPage;
    render();
  });
  // Load more
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', function(){
    visibleCount += perPage;
    render();
  });

  // Initial
  renderSummary();
  renderPhotoStrip();
  render();

  // Scroll-to-reviews from product rating
  document.addEventListener('click', function(e){
    var link = e.target.closest('[data-scroll-reviews]');
    if (!link) return;
    e.preventDefault();
    var anchor = document.getElementById('reviews');
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();

/* =============================================================
   V3 — Delivery date estimator
   ============================================================= */
(function(){
  var el = document.querySelector('[data-delivery]');
  if (!el) return;
  var cutoffEl = el.querySelector('[data-delivery-cutoff]');
  var dateEl = el.querySelector('[data-delivery-date]');
  var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function update() {
    var now = new Date();
    var cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);
    var past = now > cutoff;
    // Delivery range: 4-6 business days from now
    var ship = new Date(now);
    if (past) ship.setDate(ship.getDate() + 1);
    // Skip weekends on ship date
    while (ship.getDay() === 0 || ship.getDay() === 6) ship.setDate(ship.getDate() + 1);
    // Add 4 business days
    var arrive = new Date(ship);
    var added = 0;
    while (added < 4) {
      arrive.setDate(arrive.getDate() + 1);
      if (arrive.getDay() !== 0 && arrive.getDay() !== 6) added++;
    }
    dateEl.textContent = dayNames[arrive.getDay()] + ', ' + monthNames[arrive.getMonth()] + ' ' + arrive.getDate();

    // Countdown to cutoff
    if (past) {
      if (cutoffEl.parentNode) {
        el.innerHTML = el.innerHTML.replace(/Order in the next <strong[^>]*><\/strong> for delivery by/, 'Get it by');
      }
      return;
    }
    var diff = cutoff - now;
    var h = Math.floor(diff / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    cutoffEl.textContent = h + 'h ' + m + 'm';
  }
  update();
  setInterval(update, 60000);
})();

/* =============================================================
   V3 — Installments update on variant change
   ============================================================= */
(function(){
  var el = document.querySelector('[data-installments]');
  if (!el) return;
  var btn = document.querySelector('[data-add-to-cart]');
  if (!btn) return;
  var basePriceEl = btn.dataset.basePrice ? parseFloat(btn.dataset.basePrice) : null;

  function money(n) {
    return '$' + n.toFixed(2);
  }
  function update(price) {
    el.textContent = money(price / 4);
  }
  // Watch ATC total for updates
  var obs = new MutationObserver(function(){
    var priceEl = btn.querySelector('[data-atc-total]');
    if (!priceEl) return;
    var match = priceEl.textContent.match(/[\d,.]+/);
    if (!match) return;
    var num = parseFloat(match[0].replace(/,/g, ''));
    if (!isNaN(num)) update(num);
  });
  var priceEl = btn.querySelector('[data-atc-total]');
  if (priceEl) obs.observe(priceEl, { childList: true, characterData: true, subtree: true });
})();
