// /js/admin-orders.js
import {
  parseJsonResponseSafely,
  formatDateTime,
  formatCurrencyFromCents,
  getStatusBadgeClass,
  prettyOrderStatus,
  isHistoryOrderStatus,
  isActiveOrderStatus,
  prettyProductType
} from './admin-shared.js';

let ordersModuleInitialized = false;
let allOrders = [];

function setStatus(statusEl, message = '', color = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = color;
}

function hasShippingDetails(order) {
  return !!(
    order?.shipping_name ||
    order?.shipping_line1 ||
    order?.shipping_line2 ||
    order?.shipping_city ||
    order?.shipping_state ||
    order?.shipping_postal_code ||
    order?.shipping_country ||
    order?.shipping_phone
  );
}

function getCustomerDisplay(order) {
  const profileEmail = order?.profiles?.email || null;
  const orderEmail = order?.customer_email || null;
  const email = profileEmail || orderEmail || 'Unknown email';

  const profileUsername = order?.profiles?.username || null;
  const customerName = order?.customer_name || null;
  const name = profileUsername || customerName || 'No name available';

  return { email, name };
}

function renderShippingBlock(order) {
  if (!hasShippingDetails(order)) {
    return '';
  }

  const addressLine1 = order.shipping_line1 || '';
  const addressLine2 = order.shipping_line2 || '';
  const city = order.shipping_city || '';
  const state = order.shipping_state || '';
  const postal = order.shipping_postal_code || '';
  const country = order.shipping_country || '';
  const cityLine = [city, state, postal].filter(Boolean).join(', ');

  return `
    <div class="order-shipping-box">
      <h4>Shipping Details</h4>
      <div class="order-meta"><strong>Name:</strong> ${order.shipping_name || '—'}</div>
      <div class="order-meta"><strong>Line 1:</strong> ${addressLine1 || '—'}</div>
      ${addressLine2 ? `<div class="order-meta"><strong>Line 2:</strong> ${addressLine2}</div>` : ''}
      <div class="order-meta"><strong>City / State / Postal:</strong> ${cityLine || '—'}</div>
      <div class="order-meta"><strong>Country:</strong> ${country || '—'}</div>
      <div class="order-meta"><strong>Phone:</strong> ${order.shipping_phone || '—'}</div>
    </div>
  `;
}

function renderOrderCard(order, { history = false } = {}) {
  const orderId = order.id;
  const { email: customerEmail, name: customerName } = getCustomerDisplay(order);
  const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
  const noteValue = order.fulfillment_notes || '';
  const historyClass = history ? 'history-card' : '';

  const itemsHtml = orderItems.length
    ? `
      <ul class="order-items-list">
        ${orderItems.map((item) => {
          const product = item.products || {};
          const storyTitle = product.stories?.title || '';

          return `
            <li>
              <strong>${product.name || 'Unnamed product'}</strong>
              <div class="order-meta"><strong>Type:</strong> ${prettyProductType(product.product_type || 'merch')}</div>
              <div class="order-meta"><strong>Quantity:</strong> ${item.quantity ?? 1}</div>
              <div class="order-meta"><strong>Unit Price:</strong> ${formatCurrencyFromCents(item.unit_price_cents)}</div>
              ${storyTitle ? `<div class="order-meta"><strong>Story:</strong> ${storyTitle}</div>` : ''}
            </li>
          `;
        }).join('')}
      </ul>
    `
    : '<p class="order-meta">No order items found.</p>';

  return `
    <article class="order-card ${historyClass}" data-order-id="${orderId}">
      <div class="order-card-header">
        <div class="order-card-header-main">
          <span class="${getStatusBadgeClass(order.status)}">${prettyOrderStatus(order.status)}</span>
          <strong>Order</strong>
          <div class="order-id-text">${orderId}</div>
        </div>
      </div>

      <div class="order-meta"><strong>Customer:</strong> ${customerEmail}</div>
      <div class="order-meta"><strong>Name:</strong> ${customerName}</div>
      <div class="order-meta"><strong>Fulfillment Type:</strong> ${order.fulfillment_type || 'Unknown'}</div>
      <div class="order-meta"><strong>Total:</strong> ${formatCurrencyFromCents(order.total_cents)}</div>
      <div class="order-meta"><strong>Bonus Votes Granted:</strong> ${Number(order.total_votes_granted) || 0}</div>
      <div class="order-meta"><strong>Created:</strong> ${formatDateTime(order.created_at)}</div>
      <div class="order-meta"><strong>Paid:</strong> ${formatDateTime(order.paid_at)}</div>
      <div class="order-meta"><strong>Fulfilled:</strong> ${formatDateTime(order.fulfilled_at)}</div>

      ${itemsHtml}
      ${renderShippingBlock(order)}

      <div class="field-group" style="margin-top:0.75rem;">
        <label for="order-status-${orderId}">Order Status</label>
        <select id="order-status-${orderId}" class="order-status-select" data-order-id="${orderId}">
          <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Paid</option>
          <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
          <option value="fulfilled" ${order.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
          <option value="canceled" ${order.status === 'canceled' ? 'selected' : ''}>Canceled</option>
          <option value="failed" ${order.status === 'failed' ? 'selected' : ''}>Failed</option>
        </select>
      </div>

      <div class="order-note-box">
        <label for="order-notes-${orderId}">Fulfillment Notes</label>
        <textarea id="order-notes-${orderId}" class="order-notes-input" data-order-id="${orderId}" placeholder="Add packing / fulfillment notes...">${noteValue}</textarea>
      </div>

      <div class="action-row">
        <button type="button" class="save-order-btn" data-order-id="${orderId}">
          Save Order Update
        </button>
      </div>
    </article>
  `;
}

function buildHistoryOrderLabel(order) {
  const statusText = prettyOrderStatus(order.status);
  const createdText = formatDateTime(order.created_at);
  const { email, name } = getCustomerDisplay(order);
  const shortId = String(order.id || '').slice(0, 8) || 'order';

  return `${statusText} • ${name} • ${email} • ${createdText} • ${shortId}`;
}

function renderOrderHistoryEmptyState(orderHistoryDetail, message = 'Select a historical order to view its details.') {
  if (!orderHistoryDetail) return;
  orderHistoryDetail.innerHTML = `<p class="empty-orders-state">${message}</p>`;
}

function renderSelectedHistoryOrder(ctx) {
  const { orderHistorySelect, orderHistoryDetail } = ctx;
  if (!orderHistorySelect || !orderHistoryDetail) return;

  const selectedOrderId = orderHistorySelect.value;

  if (!selectedOrderId) {
    renderOrderHistoryEmptyState(orderHistoryDetail, 'Select a historical order to view its details.');
    return;
  }

  const selectedOrder = allOrders.find((order) => String(order.id) === String(selectedOrderId));

  if (!selectedOrder) {
    renderOrderHistoryEmptyState(orderHistoryDetail, 'That historical order could not be found.');
    return;
  }

  orderHistoryDetail.innerHTML = renderOrderCard(selectedOrder, { history: true });
}

function updateOrderHistorySelect(historyOrders, ctx) {
  const { orderHistorySelect, orderHistorySummary, orderHistoryDetail } = ctx;
  if (!orderHistorySelect || !orderHistorySummary) return;

  const safeHistoryOrders = Array.isArray(historyOrders) ? historyOrders : [];
  const previousValue = orderHistorySelect.value || '';

  orderHistorySelect.innerHTML =
    '<option value="">-- Select a fulfilled, canceled, or failed order --</option>';

  if (!safeHistoryOrders.length) {
    orderHistorySelect.disabled = true;
    orderHistorySummary.textContent = 'No historical orders yet.';
    renderOrderHistoryEmptyState(orderHistoryDetail, 'No historical orders yet.');
    return;
  }

  safeHistoryOrders.forEach((order) => {
    const option = document.createElement('option');
    option.value = order.id;
    option.textContent = buildHistoryOrderLabel(order);
    orderHistorySelect.appendChild(option);
  });

  orderHistorySelect.disabled = false;
  orderHistorySummary.textContent = `${safeHistoryOrders.length} historical order${safeHistoryOrders.length === 1 ? '' : 's'} available. Select one to inspect it.`;

  const stillExists = safeHistoryOrders.some((order) => String(order.id) === String(previousValue));

  if (stillExists) {
    orderHistorySelect.value = previousValue;
  } else {
    orderHistorySelect.value = '';
  }

  renderSelectedHistoryOrder(ctx);
}

function renderOrdersPreview(orders, ctx) {
  const { activeOrdersPreview } = ctx;
  if (!activeOrdersPreview) return;

  const safeOrders = Array.isArray(orders) ? orders : [];

  const activeOrders = safeOrders.filter((order) => isActiveOrderStatus(order.status));
  const historyOrders = safeOrders.filter((order) => isHistoryOrderStatus(order.status));

  if (!activeOrders.length) {
    activeOrdersPreview.innerHTML = '<p class="empty-orders-state">No active orders right now.</p>';
  } else {
    activeOrdersPreview.innerHTML = activeOrders
      .map((order) => renderOrderCard(order, { history: false }))
      .join('');
  }

  updateOrderHistorySelect(historyOrders, ctx);
}

export async function loadOrdersPreview(ctx) {
  const {
    activeOrdersPreview,
    orderHistorySummary,
    orderHistorySelect,
    orderHistoryDetail,
    ordersStatusMsg,
    getAccessToken,
    setAllOrders
  } = ctx;

  try {
    if (activeOrdersPreview) {
      activeOrdersPreview.innerHTML = '<p class="empty-orders-state">Loading active orders.</p>';
    }

    if (orderHistorySummary) {
      orderHistorySummary.textContent = 'Loading order history.';
    }

    if (orderHistorySelect) {
      orderHistorySelect.innerHTML =
        '<option value="">-- Select a fulfilled, canceled, or failed order --</option>';
      orderHistorySelect.disabled = true;
    }

    renderOrderHistoryEmptyState(orderHistoryDetail, 'Loading order history.');

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const res = await fetch('/.netlify/functions/get-orders', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to load orders');
    }

    allOrders = Array.isArray(result.orders) ? result.orders : [];

    if (typeof setAllOrders === 'function') {
      setAllOrders(allOrders);
    }

    renderOrdersPreview(allOrders, ctx);
    setStatus(ordersStatusMsg, '', '');
  } catch (error) {
    console.error('Error loading orders:', error);

    if (activeOrdersPreview) {
      activeOrdersPreview.innerHTML = '<p class="empty-orders-state">Failed to load active orders.</p>';
    }

    if (orderHistorySummary) {
      orderHistorySummary.textContent = 'Failed to load order history.';
    }

    if (orderHistorySelect) {
      orderHistorySelect.innerHTML =
        '<option value="">-- Select a fulfilled, canceled, or failed order --</option>';
      orderHistorySelect.disabled = true;
    }

    renderOrderHistoryEmptyState(orderHistoryDetail, 'Failed to load order history.');
    setStatus(ordersStatusMsg, error.message || 'Failed to load orders.', 'red');
  }
}

async function handleSaveOrder(button, ctx) {
  const { ordersStatusMsg, getAccessToken } = ctx;

  const orderId = button.dataset.orderId;
  if (!orderId) return;

  const statusSelect = document.querySelector(`.order-status-select[data-order-id="${orderId}"]`);
  const notesInput = document.querySelector(`.order-notes-input[data-order-id="${orderId}"]`);

  const nextStatus = statusSelect?.value || '';
  const fulfillmentNotes = notesInput?.value || '';
  const originalText = button.textContent;

  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    button.disabled = true;
    button.textContent = 'Saving...';

    const res = await fetch('/.netlify/functions/update-order-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        order_id: orderId,
        status: nextStatus,
        fulfillment_notes: fulfillmentNotes
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to update order');
    }

    setStatus(ordersStatusMsg, `Order ${orderId} updated successfully.`, 'green');
    await loadOrdersPreview(ctx);
  } catch (error) {
    console.error('Error updating order:', error);
    setStatus(ordersStatusMsg, error.message || 'Failed to update order.', 'red');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function attachOrderHistorySelectHandler(ctx) {
  const { orderHistorySelect } = ctx;
  if (!orderHistorySelect || orderHistorySelect.dataset.listenerAttached === 'true') return;

  orderHistorySelect.dataset.listenerAttached = 'true';

  orderHistorySelect.addEventListener('change', () => {
    renderSelectedHistoryOrder(ctx);
  });
}

function attachOrderClickDelegation(ctx) {
  const { activeOrdersPreview, orderHistoryDetail } = ctx;

  const clickHandler = async (event) => {
    const button = event.target.closest('.save-order-btn');
    if (!button) return;

    await handleSaveOrder(button, ctx);
  };

  if (activeOrdersPreview && activeOrdersPreview.dataset.listenerAttached !== 'true') {
    activeOrdersPreview.dataset.listenerAttached = 'true';
    activeOrdersPreview.addEventListener('click', clickHandler);
  }

  if (orderHistoryDetail && orderHistoryDetail.dataset.listenerAttached !== 'true') {
    orderHistoryDetail.dataset.listenerAttached = 'true';
    orderHistoryDetail.addEventListener('click', clickHandler);
  }
}

export function initAdminOrders(ctx) {
  if (ordersModuleInitialized) return;
  ordersModuleInitialized = true;

  attachOrderHistorySelectHandler(ctx);
  attachOrderClickDelegation(ctx);
}