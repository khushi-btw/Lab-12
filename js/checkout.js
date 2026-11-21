/**
 * checkout.js — Petal & Pixel Checkout Page
 * Validates form, renders order summary from XML, places demo order.
 * Depends on: main.js, products.js
 */

(function () {
  'use strict';

  /* ─── Init ──────────────────────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', async function () {
    // Guard: redirect if cart is empty
    var cart = getCart();
    if (Object.keys(cart).length === 0) {
      window.location.replace('./cart.html');
      return;
    }

    try {
      var xmlDoc = await loadXML();
      renderOrderSummary(xmlDoc, cart);
      bindFormSubmit(xmlDoc, cart);
    } catch (err) {
      console.error('[Petal & Pixel] Checkout XML error:', err);
      var listEl = document.getElementById('checkout-items-list');
      if (listEl) listEl.innerHTML = '<li>Could not load order details.</li>';
    }
  });

  /* ─── Order Summary Sidebar ─────────────────────────────────────────────── */

  function renderOrderSummary(xmlDoc, cart) {
    var listEl    = document.getElementById('checkout-items-list');
    var subtotalEl = document.getElementById('co-subtotal');
    var shippingEl = document.getElementById('co-shipping');
    var totalEl    = document.getElementById('co-total');

    var ids      = Object.keys(cart);
    var subtotal = 0;
    var itemsHTML = '';

    ids.forEach(function (id) {
      var product = findProductById(xmlDoc, id);
      if (!product) return;

      var qty       = Math.max(1, Math.min(parseInt(cart[id], 10) || 1, product.stock));
      var lineTotal = product.price * qty;
      subtotal     += lineTotal;

      itemsHTML +=
        '<li class="checkout-item-row">' +
          '<span class="checkout-item-name">' + esc(product.name) + '</span>' +
          '<span class="checkout-item-qty">× ' + qty + '</span>' +
          '<span class="checkout-item-price">' + formatINR(lineTotal) + '</span>' +
        '</li>';
    });

    if (listEl) listEl.innerHTML = itemsHTML || '<li>No items found.</li>';

    var shipping = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_CHARGE;
    var total    = subtotal + shipping;

    if (subtotalEl) subtotalEl.textContent = formatINR(subtotal);
    if (shippingEl) shippingEl.innerHTML   = shipping === 0
      ? '<span class="free-delivery-label">Free</span>'
      : formatINR(shipping);
    if (totalEl)    totalEl.textContent    = formatINR(total);

    // Store computed values for form submission
    window._checkoutData = { xmlDoc: xmlDoc, cart: cart, subtotal: subtotal, shipping: shipping, total: total };
  }

  /* ─── Form Submission ────────────────────────────────────────────────────── */

  function bindFormSubmit(xmlDoc, cart) {
    var form = document.getElementById('checkout-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!validateForm(form)) return;

      var cd = window._checkoutData || {};
      placeOrder(form, cd.xmlDoc || xmlDoc, cd.cart || cart, cd.subtotal || 0, cd.shipping || 0, cd.total || 0);
    });
  }

  /* ─── Validation ─────────────────────────────────────────────────────────── */

  function validateForm(form) {
    clearAllErrors();
    var valid = true;

    // Full Name
    var name = form.querySelector('#field-name');
    if (!name || name.value.trim().length < 2) {
      showError('error-name', 'Please enter your full name (at least 2 characters).');
      valid = false;
    }

    // Email
    var email = form.querySelector('#field-email');
    var emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRE.test(email.value.trim())) {
      showError('error-email', 'Please enter a valid email address.');
      valid = false;
    }

    // Mobile — 10-digit Indian number starting with 6/7/8/9
    var mobile = form.querySelector('#field-mobile');
    var mobileRE = /^[6-9]\d{9}$/;
    if (!mobile || !mobileRE.test(mobile.value.trim())) {
      showError('error-mobile', 'Please enter a valid 10-digit Indian mobile number.');
      valid = false;
    }

    // Address
    var address = form.querySelector('#field-address');
    if (!address || address.value.trim().length < 5) {
      showError('error-address', 'Please enter your complete delivery address.');
      valid = false;
    }

    // City
    var city = form.querySelector('#field-city');
    if (!city || city.value.trim().length < 2) {
      showError('error-city', 'Please enter your city.');
      valid = false;
    }

    // PIN code — exactly 6 digits
    var pin = form.querySelector('#field-pin');
    var pinRE = /^\d{6}$/;
    if (!pin || !pinRE.test(pin.value.trim())) {
      showError('error-pin', 'Please enter a valid 6-digit PIN code.');
      valid = false;
    }

    // State
    var state = form.querySelector('#field-state');
    if (!state || !state.value) {
      showError('error-state', 'Please select your state.');
      valid = false;
    }

    // If invalid, focus the first error field
    if (!valid) {
      var firstError = form.querySelector('.form-input.input-error');
      if (firstError) firstError.focus();
    }

    return valid;
  }

  function showError(errorId, message) {
    var el = document.getElementById(errorId);
    if (el) {
      el.textContent = message;
      el.style.display = 'block';
    }
    // Mark the associated input
    var fieldId = errorId.replace('error-', 'field-');
    var input = document.getElementById(fieldId);
    if (input) input.classList.add('input-error');
  }

  function clearAllErrors() {
    document.querySelectorAll('.form-error').forEach(function (el) {
      el.textContent = '';
      el.style.display = 'none';
    });
    document.querySelectorAll('.form-input.input-error').forEach(function (el) {
      el.classList.remove('input-error');
    });
  }

  /* ─── Place Order ────────────────────────────────────────────────────────── */

  function placeOrder(form, xmlDoc, cart, subtotal, shipping, total) {
    var btn = document.getElementById('place-order-btn');
    if (btn) {
      btn.disabled     = true;
      btn.textContent  = 'Placing order…';
    }

    // Build items list with live XML prices
    var items = [];
    Object.keys(cart).forEach(function (id) {
      var product = findProductById(xmlDoc, id);
      if (!product) return;
      var qty       = Math.max(1, Math.min(parseInt(cart[id], 10) || 1, product.stock));
      var lineTotal = product.price * qty;
      items.push({
        name     : product.name,
        qty      : qty,
        lineTotal: formatINR(lineTotal),
      });
    });

    // Generate order number
    var now      = new Date();
    var suffix   = String(Date.now()).slice(-8);
    var dateStr  = now.toLocaleString('en-IN', {
      day  : '2-digit', month: 'short', year: 'numeric',
      hour : '2-digit', minute: '2-digit', hour12: true
    });

    var customerName = (form.querySelector('#field-name')?.value || '').trim();

    var orderData = {
      orderSuffix      : suffix,
      customerName     : customerName,
      dateFormatted    : dateStr,
      items            : items,
      subtotal         : subtotal,
      subtotalFormatted: formatINR(subtotal),
      shipping         : shipping,
      shippingFormatted: shipping === 0 ? 'Free' : formatINR(shipping),
      total            : total,
      totalFormatted   : formatINR(total),
    };

    // Save to sessionStorage, clear cart, redirect
    try {
      sessionStorage.setItem('morrow_order', JSON.stringify(orderData));
    } catch (e) {
      console.error('sessionStorage error:', e);
    }

    saveCart({});               // clear cart
    updateCartCount();

    window.location.href = './order-success.html';
  }

  /* ─── Utility ─────────────────────────────────────────────────────────────── */

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
