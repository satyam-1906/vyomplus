const API_BASE = 'https://vyomplus.onrender.com';
const tabs = document.querySelectorAll('.module-tab');
const panels = document.querySelectorAll('.console-content');
const titleEl = document.getElementById('page-title');
let availableUnits = [];
let availableStockItems = [];

function activateTab(key){
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === key));
    panels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + key));
    const label = document.querySelector('.module-tab[data-tab="'+key+'"]').textContent.trim();
    titleEl.textContent = 'Inventory • ' + label;
    if (key === 'godowns') {
        fetchGodowns();
    }
    // Save tab selection to localStorage
    localStorage.setItem('activeInventoryTab', key);
    window.scrollTo({top:0,behavior:'smooth'});
}

tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', (e)=>{ e.preventDefault(); activateTab(el.dataset.goto); }));

const godownForm = document.getElementById('godown-form');
const godownItems = document.getElementById('godown-items');
const addGodownItem = document.getElementById('add-godown-item');
const godownReset = document.getElementById('godown-reset');
const godownsTbody = document.getElementById('godowns-tbody');
const unitForm = document.getElementById('unit-form');
const unitTypeButtons = document.querySelectorAll('.tag[data-unit-type]');
const unitSymbolInput = document.getElementById('unit-symbol');
const unitNameInput = document.getElementById('unit-name');
const unitConversionBase = document.getElementById('unit-conversion-base');
const unitConversionQty = document.getElementById('unit-conversion-qty');
const unitDecimalsInput = document.getElementById('unit-decimals');
const unitReset = document.getElementById('unit-reset');
const unitsTbody = document.getElementById('units-tbody');
const stockForm = document.getElementById('stock-form');
const stockItemName = document.getElementById('stock-item-name');
const stockItemQuantity = document.getElementById('stock-item-quantity');
const stockItemUnit = document.getElementById('stock-item-unit');
const stockItemRate = document.getElementById('stock-item-rate');
const stockGodownRows = document.getElementById('stock-godown-rows');
const addStockGodownButton = document.getElementById('add-stock-godown');
const stockQuantityStatus = document.getElementById('stock-quantity-status');
const stockGstRate = document.getElementById('stock-gst-rate');
const stockHsnCode = document.getElementById('stock-hsn-code');
const stockReset = document.getElementById('stock-reset');
const stockItemsTbody = document.getElementById('stock-items-tbody');
let selectedUnitType = 'simple';
let availableGodowns = [];

let activeDropdownId = null;

function openRowDropdown(id, event) {
    event.stopPropagation();
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.classList.contains('show');
    // Close any currently open dropdown
    if (activeDropdownId && activeDropdownId !== id) {
        const prev = document.getElementById(activeDropdownId);
        if (prev) prev.classList.remove('show');
    }
    el.classList.toggle('show', !isOpen);
    activeDropdownId = !isOpen ? id : null;
}

document.addEventListener('click', () => {
    if (activeDropdownId) {
        const el = document.getElementById(activeDropdownId);
        if (el) el.classList.remove('show');
        activeDropdownId = null;
    }
});

// ---- Godown delete / edit ----
async function deleteGodown(name) {
    if (!confirm(`Delete godown "${name}"? This will deduct its quantities from all stock items.`)) return;
    try {
        const res = await fetch(`${API_BASE}/godown/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.detail || `Server returned ${res.status}`);
        }
        notify(`Godown "${name}" deleted.`, 'success');
        await Promise.all([fetchGodowns(), fetchStockItems()]);
    } catch (err) {
        console.error(err);
        notify('Unable to delete godown. ' + (err.message || 'Please try again.'), 'error');
    }
}

async function openGodownEditModal(name) {
    try {
        const res = await fetch(`${API_BASE}/godown/${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();

        // Populate the form
        const nameInput = document.getElementById('godown-name');
        const locationInput = document.getElementById('godown-location');
        nameInput.value = data.godown_name || '';
        locationInput.value = data.location || '';

        // Rebuild item rows
        godownItems.innerHTML = '';
        const normalized = normalizeGodownItems(data.items);
        if (normalized.length > 0) {
            normalized.forEach(({ itemName, quantity, unit }) => {
                godownItems.appendChild(createItemRow(itemName, quantity, unit));
            });
        } else {
            godownItems.appendChild(createItemRow());
        }

        // Switch submit to PUT
        godownForm._editingName = name;

        // Scroll to form
        nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInput.focus();
    } catch (err) {
        console.error(err);
        showToast('Unable to load godown details. ' + (err.message || 'Please try again.'), 'error');
    }
}

// ---- Stock delete / edit ----
async function deleteStockItem(itemName) {
    if (!confirm(`Delete stock item "${itemName}"? This will remove it from all godowns.`)) return;
    try {
        const res = await fetch(`${API_BASE}/stock/${encodeURIComponent(itemName)}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.detail || `Server returned ${res.status}`);
        }
        notify(`Stock item "${itemName}" deleted.`, 'success');
        await Promise.all([fetchStockItems(), fetchGodowns()]);
    } catch (err) {
        console.error(err);
        notify('Unable to delete stock item. ' + (err.message || 'Please try again.'), 'error');
    }
}

async function openStockEditModal(record) {
    // Populate New Stock Item form
    stockItemName.value = record.item || '';
    stockItemQuantity.value = record.quantity ?? '';
    stockItemUnit.value = record.unit || '';
    stockItemRate.value = record.rate ?? '';
    stockGstRate.value = record.gst_rate ?? '';
    stockHsnCode.value = record.hsn_code ?? '';

    // Rebuild godown rows
    stockGodownRows.innerHTML = '';
    const godownsDict = record.godowns || {};
    if (Object.keys(godownsDict).length > 0) {
        Object.entries(godownsDict).forEach(([gdName, gdQty]) => {
            stockGodownRows.appendChild(createStockGodownRow(gdName, gdQty));
        });
    } else {
        stockGodownRows.appendChild(createStockGodownRow());
    }
    validateStockQuantities();

    // Tag this form as editing
    stockForm._editingName = record.item;

    // Scroll to form
    stockItemName.scrollIntoView({ behavior: 'smooth', block: 'center' });
    stockItemName.focus();
}

function buildUnitOptions(selectedUnit = '') {
    const options = ['<option value="">Select unit</option>'];
    availableUnits.forEach((unit) => {
        const value = unit.symbol || '';
        const label = unit.name ? `${unit.symbol} (${unit.name})` : unit.symbol;
        const isSelected = value && value === selectedUnit;
        options.push(`<option value="${value}" ${isSelected ? 'selected' : ''}>${label}</option>`);
    });
    return options.join('');
}

function populateSimpleUnitOptions() {
    if (!unitConversionBase) return;
    const simpleUnits = availableUnits.filter((unit) => unit.type === 'simple');
    unitConversionBase.innerHTML = '<option value="">Select base unit</option>' + simpleUnits.map((unit) => {
        const value = unit.symbol || '';
        const label = unit.name ? `${unit.symbol} (${unit.name})` : unit.symbol;
        return `<option value="${value}">${label}</option>`;
    }).join('');
}

function setUnitType(type) {
    selectedUnitType = type;
    unitTypeButtons.forEach((button) => {
        button.classList.toggle('selected', button.dataset.unitType === type);
    });

    const conversionDisabled = type !== 'compound';
    document.querySelectorAll('.unit-conversion-field').forEach((field) => {
        field.disabled = conversionDisabled;
        if (conversionDisabled) {
            field.value = '';
        }
    });
}

function resetUnitForm() {
    if (!unitForm) return;
    unitForm.reset();
    if (unitDecimalsInput) unitDecimalsInput.value = '0';
    setUnitType('simple');
}

function populateStockUnitOptions() {
    if (!stockItemUnit) return;
    stockItemUnit.innerHTML = '<option value="">Select unit</option>' + availableUnits.map((unit) => {
        const value = unit.symbol || '';
        const label = unit.name ? `${unit.symbol} (${unit.name})` : unit.symbol;
        return `<option value="${value}">${label}</option>`;
    }).join('');
}

function createStockGodownRow(godownName = '', qty = '') {
    const row = document.createElement('div');
    row.className = 'stock-godown-row';
    row.innerHTML = `
        <div class="form-group">
            <label>Godown</label>
            <select class="stock-godown-name" required>
                <option value="">Select godown</option>
                ${availableGodowns.map((godown) => `<option value="${godown.godown_name}" ${godown.godown_name === godownName ? 'selected' : ''}>${godown.godown_name}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Quantity</label>
            <input type="number" class="stock-godown-qty" min="0" step="0.01" value="${qty}" placeholder="0" required>
        </div>
        <button type="button" class="mini-btn remove-item" title="Remove godown"><i class="ti ti-minus"></i></button>
    `;

    row.querySelector('.remove-item').addEventListener('click', () => {
        stockGodownRows.removeChild(row);
        validateStockQuantities();
    });

    return row;
}

function resetStockForm() {
    if (!stockForm) return;
    stockForm._editingName = null;
    stockForm.reset();
    stockGodownRows.innerHTML = '';
    stockGodownRows.appendChild(createStockGodownRow());
    if (stockQuantityStatus) {
        stockQuantityStatus.textContent = 'Enter the total quantity and distribute it across godowns.';
        stockQuantityStatus.className = 'stock-quantity-status';
    }
}

function validateStockQuantities() {
    if (!stockItemQuantity || !stockQuantityStatus) return;
    const totalQty = Number(stockItemQuantity.value);
    const rows = Array.from(stockGodownRows.querySelectorAll('.stock-godown-row'));
    const sum = rows.reduce((acc, row) => {
        const qtyValue = Number(row.querySelector('.stock-godown-qty').value);
        return acc + (Number.isNaN(qtyValue) ? 0 : qtyValue);
    }, 0);

    if (Number.isNaN(totalQty) || totalQty <= 0) {
        stockQuantityStatus.textContent = 'Enter a valid total quantity first.';
        stockQuantityStatus.className = 'stock-quantity-status error';
        return;
    }

    if (Math.abs(sum - totalQty) < 0.000001) {
        stockQuantityStatus.textContent = 'Godown quantities match the total item quantity.';
        stockQuantityStatus.className = 'stock-quantity-status success';
    } else {
        stockQuantityStatus.textContent = `Godown quantities must total ${totalQty}.`;
        stockQuantityStatus.className = 'stock-quantity-status error';
    }
}

function formatConversion(conversion) {
    if (!conversion || typeof conversion !== 'object') return '—';
    const entries = Object.entries(conversion);
    if (entries.length === 0) return '—';
    return entries.map(([baseUnit, qty]) => `1 ${baseUnit} = ${qty}`).join('<br>');
}

function renderUnits(records) {
    if (!unitsTbody) return;
    unitsTbody.innerHTML = '';
    if (!records || records.length === 0) {
        unitsTbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--color-text-muted);">No units found.</td></tr>';
        return;
    }

    records.forEach((record) => {
        const row = document.createElement('tr');
        const conversionText = record.type === 'compound' ? formatConversion(record.conversion) : '—';
        row.innerHTML = `
            <td class="mono">${record.symbol || ''}</td>
            <td>${record.name || ''}</td>
            <td>${record.type === 'compound' ? '<span class="badge badge-purple">Compound</span>' : '<span class="badge badge-blue">Simple</span>'}</td>
            <td>${conversionText}</td>
            <td>${record.decimals ?? 0}</td>
            <td>${record.used ?? 0}</td>
        `;
        unitsTbody.appendChild(row);
    });
}

function normalizeGodownItems(items) {
    if (!Array.isArray(items)) return [];

    return items
        .filter(Boolean)
        .map((entry) => ({
            itemName: entry.itemName || '',
            quantity: entry.quantity ?? '',
            unit: entry.unit || ''
        }))
        .filter((entry) => entry.itemName || entry.quantity !== '' || entry.unit);
}

function getItemCount(items) {
    return normalizeGodownItems(items).length;
}

function buildStockItemOptions(selectedName = '') {
    const options = ['<option value="">Select stock item</option>'];
    availableStockItems.forEach((itemObj) => {
        const name = itemObj.item || '';
        const isSelected = name && name === selectedName;
        options.push(`<option value="${name}" ${isSelected ? 'selected' : ''}>${name}</option>`);
    });
    return options.join('');
}

function createItemRow(name = '', qty = '', unit = '') {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
        <div class="form-group">
            <label>Item Name</label>
            <select class="item-name" required>${buildStockItemOptions(name)}</select>
        </div>
        <div class="form-group">
            <label>Quantity</label>
            <input type="number" class="item-qty" placeholder="0" min="0" value="${qty}" required>
        </div>
        <div class="form-group">
            <label>Unit</label>
            <select class="item-unit">${buildUnitOptions(unit)}</select>
        </div>
        <button type="button" class="mini-btn remove-item" title="Remove item"><i class="ti ti-minus"></i></button>
    `;

    row.querySelector('.remove-item').addEventListener('click', () => {
        godownItems.removeChild(row);
    });

    return row;
}

function resetGodownForm() {
    if (!godownForm || !godownItems) return;
    godownForm._editingName = null;
    godownForm.reset();
    godownItems.innerHTML = '';
    godownItems.appendChild(createItemRow());
}

addGodownItem.addEventListener('click', () => {
    godownItems.appendChild(createItemRow());
});

godownReset.addEventListener('click', () => {
    resetGodownForm();
});

async function fetchUnits() {
    try {
        const response = await fetch(API_BASE + '/units');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        const data = await response.json();
        availableUnits = Array.isArray(data) ? data : [];
        populateSimpleUnitOptions();
        populateStockUnitOptions();
        renderUnits(availableUnits);
    } catch (err) {
        console.error('[Inventory] Failed to load units', err);
        availableUnits = [];
        populateSimpleUnitOptions();
        populateStockUnitOptions();
        renderUnits([]);
    }
}

async function fetchGodownsList() {
    try {
        const response = await fetch(API_BASE + '/godown');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        const data = await response.json();
        availableGodowns = Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('[Inventory] Failed to load godowns list', err);
        availableGodowns = [];
    }
}

async function createStockItemDetailsRow(godownsDict, unitSymbol) {
    const detailRow = document.createElement('tr');
    detailRow.className = 'godown-details-row hidden';
    const detailCell = document.createElement('td');
    detailCell.colSpan = 5;
    const panel = document.createElement('div');
    panel.className = 'godown-detail-panel';

    const entriesList = Object.entries(godownsDict || {});

    if (entriesList.length === 0) {
        panel.innerHTML = '<div class="detail-empty">No godown details available.</div>';
    } else {
        const list = document.createElement('div');
        list.className = 'detail-list';
        const conversion = unitSymbol ? await getUnitConversion(unitSymbol) : null;
        
        const entries = await Promise.all(entriesList.map(async ([godownName, quantity]) => {
            const entry = document.createElement('div');
            entry.className = 'detail-entry';
            const qtyValue = Number(quantity);
            const displayText = conversion && !Number.isNaN(qtyValue)
                ? `${quantity} ${unitSymbol} → ${qtyValue * conversion.factor} ${conversion.baseUnit}`
                : `${quantity}${unitSymbol ? ` ${unitSymbol}` : ''}`;
            entry.innerHTML = `<span class="detail-name">${godownName}</span><span class="detail-qty">${displayText}</span>`;
            return entry;
        }));
        entries.forEach((entry) => list.appendChild(entry));
        panel.appendChild(list);
    }

    detailCell.appendChild(panel);
    detailRow.appendChild(detailCell);
    return detailRow;
}

async function renderStockItems(records) {
    if (!stockItemsTbody) return;
    stockItemsTbody.innerHTML = '';
    if (!records || records.length === 0) {
        stockItemsTbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--color-text-muted);">No stock items found.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const record of records) {
        const dropId = `si-drop-${record.id || record.item.replace(/\s+/g, '-')}`;
        const row = document.createElement('tr');
        row.className = 'godown-row';
        row.innerHTML = `
            <td><div class="item-name-cell" style="display:flex; flex-direction:row; align-items:center; gap:10px;"><span class="expand-toggle">+</span><span style="font-weight:600;">${record.item || ''}</span></div></td>
            <td>${record.unit || ''}</td>
            <td style="text-align:right;">₹${Number(record.rate || 0).toLocaleString('en-IN')}</td>
            <td style="text-align:right;">${record.quantity ?? 0}</td>
            <td>${record.hsn_code ?? ''}</td>
            <td class="row-action-cell">
                <button class="row-action-btn" title="Actions" onclick="openRowDropdown('${dropId}', event)"><i class="ti ti-dots-vertical"></i></button>
                <div class="row-dropdown" id="${dropId}">
                    <div class="row-dropdown-item" id="edit-si-${dropId}"><i class="ti ti-edit"></i> Edit</div>
                    <div class="row-dropdown-item danger" id="del-si-${dropId}"><i class="ti ti-trash"></i> Delete</div>
                </div>
            </td>
        `;

        const detailRow = await createStockItemDetailsRow(record.godowns, record.unit);
        detailRow.querySelector('td').colSpan = 6;

        // Attach edit/delete listeners after inserting into DOM to capture record
        row.querySelector(`#edit-si-${dropId}`).addEventListener('click', (e) => {
            e.stopPropagation();
            openStockEditModal(record);
        });
        row.querySelector(`#del-si-${dropId}`).addEventListener('click', (e) => {
            e.stopPropagation();
            deleteStockItem(record.item);
        });

        row.addEventListener('click', (e) => {
            if (e.target.closest('.row-action-cell')) return;
            const toggle = row.querySelector('.expand-toggle');
            const isHidden = detailRow.classList.contains('hidden');
            detailRow.classList.toggle('hidden', !isHidden);
            toggle.textContent = isHidden ? '−' : '+';
        });

        fragment.appendChild(row);
        fragment.appendChild(detailRow);
    }

    stockItemsTbody.appendChild(fragment);
}

async function fetchStockItems() {
    try {
        const response = await fetch(API_BASE + '/stock');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        const data = await response.json();
        availableStockItems = Array.isArray(data) ? data : [];
        await renderStockItems(availableStockItems);
    } catch (err) {
        console.error('[Inventory] Failed to load stock items', err);
        availableStockItems = [];
        await renderStockItems([]);
    }
}

async function getUnitConversion(unitSymbol) {
    if (!unitSymbol) return null;
    const unitDef = availableUnits.find((unit) => (unit.symbol || '').toLowerCase() === unitSymbol.toLowerCase());
    if (!unitDef || unitDef.type !== 'compound') return null;

    try {
        const response = await fetch(`${API_BASE}/units/${encodeURIComponent(unitSymbol)}`);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        const conversion = await response.json();
        const entries = Object.entries(conversion || {});
        if (!entries.length) return null;

        const [[baseUnit, factor]] = entries;
        const numericFactor = Number(factor);
        if (Number.isNaN(numericFactor) || numericFactor <= 0) return null;

        return { baseUnit, factor: numericFactor };
    } catch (err) {
        console.error('[Inventory] Failed to resolve unit conversion', err);
        return null;
    }
}

async function createDetailsRow(items) {
    const detailRow = document.createElement('tr');
    detailRow.className = 'godown-details-row hidden';
    const detailCell = document.createElement('td');
    detailCell.colSpan = 3;
    const panel = document.createElement('div');
    panel.className = 'godown-detail-panel';
    const normalizedItems = normalizeGodownItems(items);

    if (normalizedItems.length === 0) {
        panel.innerHTML = '<div class="detail-empty">No item details available.</div>';
    } else {
        const list = document.createElement('div');
        list.className = 'detail-list';
        const entries = await Promise.all(normalizedItems.map(async ({ itemName, quantity, unit }) => {
            const entry = document.createElement('div');
            entry.className = 'detail-entry';
            const conversion = unit ? await getUnitConversion(unit) : null;
            const qtyValue = Number(quantity);
            const displayText = conversion && !Number.isNaN(qtyValue)
                ? `${quantity} ${unit} → ${qtyValue * conversion.factor} ${conversion.baseUnit}`
                : `${quantity}${unit ? ` ${unit}` : ''}`;
            entry.innerHTML = `<span class="detail-name">${itemName}</span><span class="detail-qty">${displayText}</span>`;
            return entry;
        }));
        entries.forEach((entry) => list.appendChild(entry));
        panel.appendChild(list);
    }

    detailCell.appendChild(panel);
    detailRow.appendChild(detailCell);
    return detailRow;
}

async function renderGodowns(records) {
    if (!records || records.length === 0) {
        godownsTbody.innerHTML = '';
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="3" style="padding:24px;text-align:center;color:var(--color-text-muted);">No godowns found.</td>';
        godownsTbody.appendChild(tr);
        return;
    }

    // Build rows in a document fragment and append once all details are prepared
    const fragment = document.createDocumentFragment();

    for (const record of records) {
        const row = document.createElement('tr');
        row.className = 'godown-row';
        const itemCount = getItemCount(record.items);
        const dropId = `gd-drop-${record.godown_name.replace(/\s+/g, '-')}`;
        row.innerHTML = `
            <td><span class="expand-toggle">+</span> ${record.godown_name}</td>
            <td>${record.location || ''}</td>
            <td>${itemCount}</td>
            <td class="row-action-cell">
                <button class="row-action-btn" title="Actions" onclick="openRowDropdown('${dropId}', event)"><i class="ti ti-dots-vertical"></i></button>
                <div class="row-dropdown" id="${dropId}">
                    <div class="row-dropdown-item" onclick="event.stopPropagation(); openGodownEditModal('${record.godown_name}')"><i class="ti ti-edit"></i> Edit</div>
                    <div class="row-dropdown-item danger" onclick="event.stopPropagation(); deleteGodown('${record.godown_name}')"><i class="ti ti-trash"></i> Delete</div>
                </div>
            </td>
        `;

        const detailRow = await createDetailsRow(record.items);
        detailRow.querySelector('td').colSpan = 4;

        row.addEventListener('click', (e) => {
            if (e.target.closest('.row-action-cell')) return;
            const toggle = row.querySelector('.expand-toggle');
            const isHidden = detailRow.classList.contains('hidden');
            detailRow.classList.toggle('hidden', !isHidden);
            toggle.textContent = isHidden ? '−' : '+';
        });

        fragment.appendChild(row);
        fragment.appendChild(detailRow);
    }

    // replace spinner (or previous content) with the built fragment atomically
    godownsTbody.innerHTML = '';
    godownsTbody.appendChild(fragment);
}

async function fetchGodowns() {
    if (!godownsTbody) return;
    // show spinner row while we prepare the entire list
    godownsTbody.innerHTML = '<tr class="loading-row"><td colspan="4" style="padding:24px;text-align:center;color:var(--color-text-muted);"><div style="display:flex;flex-direction:column;align-items:center;gap:8px;"><div class="spinner" aria-hidden="true"></div><div>Loading godowns...</div></div></td></tr>';
    try {
        const response = await fetch(API_BASE + '/godown');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        const data = await response.json();
        // renderGodowns will build the table rows and append them atomically
        await renderGodowns(data);
    } catch (err) {
        console.error('[Inventory] Failed to load godowns', err);
        godownsTbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--color-text-muted);">Unable to load godowns.</td></tr>';
    }
}

godownForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('godown-name').value.trim();
    const location = document.getElementById('godown-location').value.trim();
    const items = [];
    const rows = Array.from(godownItems.querySelectorAll('.item-row'));

    for (const row of rows) {
        const itemName = row.querySelector('.item-name').value.trim();
        const qtyValue = row.querySelector('.item-qty').value;
        const unit = row.querySelector('.item-unit').value.trim();
        const qty = Number(qtyValue);
        if (!itemName) continue;
        if (Number.isNaN(qty)) continue;
        if (!unit) {
            showToast('Please select a unit for each item.', 'warning');
            return;
        }
        items.push({ itemName, quantity: qty, unit });
    }

    if (!name || !location) {
        showToast('Please provide godown name and location.', 'warning');
        return;
    }

    // If no items were provided, send `items: null` so backend will create an empty godown
    const payloadItems = items.length > 0 ? items : null;

    try {
        const isEditing = !!godownForm._editingName;
        const url = isEditing
            ? `${API_BASE}/godown/${encodeURIComponent(godownForm._editingName)}`
            : `${API_BASE}/godown`;
        const method = isEditing ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ godown_name: name, location, items: payloadItems })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.detail || `Server returned ${response.status}`);
        }

        notify(isEditing ? 'Godown updated successfully' : 'Godown created successfully', 'success');
        godownForm._editingName = null;
        resetGodownForm();
        await Promise.all([fetchGodowns(), fetchStockItems()]);
    } catch (err) {
        console.error(err);
        notify('Unable to save godown. ' + (err.message || 'Please try again.'), 'error');
    }
});

unitTypeButtons.forEach((button) => {
    button.addEventListener('click', () => setUnitType(button.dataset.unitType));
});

if (addStockGodownButton) {
    addStockGodownButton.addEventListener('click', () => {
        stockGodownRows.appendChild(createStockGodownRow());
        validateStockQuantities();
    });
}

[stockItemQuantity, stockItemRate, stockGstRate, stockHsnCode].forEach((element) => {
    if (element) {
        element.addEventListener('input', validateStockQuantities);
    }
});

stockGodownRows.addEventListener('input', (event) => {
    if (event.target.classList.contains('stock-godown-qty')) {
        validateStockQuantities();
    }
});

stockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const itemName = stockItemName.value.trim();
    const quantity = Number(stockItemQuantity.value);
    const unit = stockItemUnit.value.trim();
    const rate = Number(stockItemRate.value);
    const gstRate = Number(stockGstRate.value);
    const hsnCode = Number(stockHsnCode.value);
    const godowns = {};
    const rows = Array.from(stockGodownRows.querySelectorAll('.stock-godown-row'));

    for (const row of rows) {
        const godownName = row.querySelector('.stock-godown-name').value.trim();
        const godownQty = Number(row.querySelector('.stock-godown-qty').value);
        if (!godownName) continue;
        if (Number.isNaN(godownQty) || godownQty < 0) {
            showToast('Please enter valid quantities for each godown.', 'warning');
            return;
        }
        godowns[godownName] = godownQty;
    }

    const totalGodownQty = Object.values(godowns).reduce((sum, value) => sum + Number(value), 0);
    if (!itemName || Number.isNaN(quantity) || quantity <= 0 || !unit || Number.isNaN(rate) || rate < 0 || Number.isNaN(gstRate) || Number.isNaN(hsnCode) || Object.keys(godowns).length === 0 || Math.abs(totalGodownQty - quantity) > 0.000001) {
        showToast('Please provide a valid item, unit, rate, GST rate, HSN code, and matching godown quantities.', 'warning');
        return;
    }

    try {
        const isEditing = !!stockForm._editingName;
        const url = isEditing
            ? `${API_BASE}/stock/${encodeURIComponent(stockForm._editingName)}`
            : `${API_BASE}/stock`;
        const method = isEditing ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item: itemName, quantity, unit, rate, godowns, gst_rate: gstRate, hsn_code: hsnCode })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.detail || `Server returned ${response.status}`);
        }

        notify(isEditing ? 'Stock item updated successfully' : 'Stock item created successfully', 'success');
        stockForm._editingName = null;
        resetStockForm();
        await Promise.all([fetchStockItems(), fetchGodowns()]);
    } catch (err) {
        console.error(err);
        notify('Unable to save stock item. ' + (err.message || 'Please try again.'), 'error');
    }
});

stockReset.addEventListener('click', resetStockForm);

unitForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const symbol = unitSymbolInput.value.trim();
    const name = unitNameInput.value.trim();
    const decimals = Number(unitDecimalsInput.value);
    const payload = {
        symbol,
        name,
        conversion: {},
        decimals: Number.isNaN(decimals) ? 0 : decimals,
        type: selectedUnitType,
        used: 0
    };

    if (!symbol || !name) {
        showToast('Please provide a unit symbol and name.', 'warning');
        return;
    }

    if (selectedUnitType === 'compound') {
        const baseUnit = unitConversionBase.value.trim();
        const conversionQty = Number(unitConversionQty.value);
        if (!baseUnit || Number.isNaN(conversionQty) || conversionQty <= 0) {
            showToast('Please select a base unit and enter a valid conversion quantity for compound units.', 'warning');
            return;
        }
        payload.conversion = { [baseUnit]: conversionQty };
    }

    try {
        const response = await fetch(API_BASE + '/units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.detail || `Server returned ${response.status}`);
        }

        notify('Unit created successfully', 'success');
        resetUnitForm();
        fetchUnits();
    } catch (err) {
        console.error(err);
        notify('Unable to create unit. ' + (err.message || 'Please try again.'), 'error');
    }
});

unitReset.addEventListener('click', resetUnitForm);

Promise.all([fetchUnits(), fetchGodownsList()]).then(() => {
    resetGodownForm();
    resetUnitForm();
    resetStockForm();
    fetchStockItems();
    
    // Restore tab from localStorage or default to dashboard
    const savedTab = localStorage.getItem('activeInventoryTab') || 'dashboard';
    activateTab(savedTab);
});

// ambient particle background
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener('resize', resize);
const dots = Array.from({length:50}, () => ({
    x: Math.random()*innerWidth, y: Math.random()*innerHeight,
    r: Math.random()*1.4+0.3, vx:(Math.random()-0.5)*0.15, vy:(Math.random()-0.5)*0.15
}));
function frame(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    dots.forEach(d=>{
        d.x+=d.vx; d.y+=d.vy;
        if(d.x<0||d.x>canvas.width) d.vx*=-1;
        if(d.y<0||d.y>canvas.height) d.vy*=-1;
        ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2);
        ctx.fillStyle='rgba(148,163,184,0.35)'; ctx.fill();
    });
    requestAnimationFrame(frame);
}
frame();
