
// Helper logic ported from POS PrintService to generate exact receipt HTML
export const generateReceiptHTML = (data) => {
  const { billId, date, time, items, total, mode, cashTendered, change, s2BillId } = data;

  // Helper to identify deduction items (Container/Return)
  const isDeduction = (item) => {
    return item.code === 'CONTAINER' || item.code === 'RETURN' ||
      item.productCode === 'CONTAINER' || item.productCode === 'RETURN' ||
      item.name?.toLowerCase().includes('container') || item.name?.toLowerCase().includes('return');
  };

  // Separate regular items from deduction items
  const regularItems = (items || []).filter(item => !isDeduction(item));

  // Pre-calculate valid IDs for robust matching (ensure no deduction vanishes if parent missing)
  const validIds = new Set((items || []).map(i => String(i.id)));

  let combinedRows = '';

  // Process each regular item
  regularItems.forEach((item, itemIndex) => {
    const hasLotEntries = item.isLot && item.lotEntries && item.lotEntries.length > 0;
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const itemTotal = parseFloat(item.total) || 0;

    if (hasLotEntries) {
      // LOT ITEM - show name, entries with +, deductions with −, net weight

      // Calculate gross from lot entries
      const grossWeight = item.lotEntries.reduce((sum, entry) => sum + (parseFloat(entry.kilos) || 0), 0);

      // Item name with divider
      combinedRows += `
          <tr class="item-divider">
            <td colspan="4" style="border-bottom: 1px dashed #000; padding-bottom: 3px;"></td>
          </tr>
          <tr>
            <td colspan="4" style="font-weight: bold; padding-top: 5px;">${item.name || item.productName}</td>
          </tr>
        `;

      // Lot entries with + prefix
      item.lotEntries.forEach((entry, idx) => {
        combinedRows += `
            <tr class="lot-entry">
              <td colspan="4" style="padding-left: 8px; font-size: 11px;">
                ${entry.bags || 0} bags +${(entry.kilos || 0).toFixed(2)} kg
              </td>
            </tr>
          `;
      });

      // Show Deductions (Product Splits + Containers + Returns)
      // 1. Children: Any item split from this item
      const children = items.filter(d =>
        d.splitFrom != null && item.id != null && String(d.splitFrom) === String(item.id)
      );

      // 2. Orphans (for first item only to catch unmatched deductions)
      const orphans = (itemIndex === 0)
        ? items.filter(d => isDeduction(d) && (!d.splitFrom || !validIds.has(String(d.splitFrom))))
        : [];

      const allDeductions = [...children, ...orphans];

      if (allDeductions.length > 0) {
        allDeductions.forEach(dedItem => {
          let deductionText = '';
          const dedQty = parseFloat(dedItem.grossWeight) || parseFloat(dedItem.quantity) || 0;

          if (isDeduction(dedItem)) {
            const deductionType = (dedItem.name?.toLowerCase().includes('container') || dedItem.code === 'CONTAINER')
              ? 'Container'
              : 'Return';
            const unitWeight = dedItem.unitWeight || dedQty;
            const containerCount = dedItem.containerCount || 1;

            deductionText = containerCount > 1
              ? `${deductionType} −${unitWeight.toFixed(2)} kg × ${containerCount} = −${dedQty.toFixed(2)} kg`
              : `${deductionType} −${dedQty.toFixed(2)} kg`;
          } else {
            deductionText = `${dedItem.name || dedItem.productName} −${dedQty.toFixed(2)} kg`;
          }

          combinedRows += `
              <tr class="deduction-entry">
                <td colspan="4" style="padding-left: 8px; font-size: 11px;">
                  ${deductionText}
                </td>
              </tr>
            `;
        });
      }

      // Calculate net weight
      const totalDeductions = allDeductions.reduce((sum, d) => sum + (parseFloat(d.grossWeight) || parseFloat(d.quantity) || 0), 0);
      const netWeight = grossWeight - totalDeductions;

      combinedRows += `
          <tr>
            <td style="padding-top: 4px;"></td>
            <td style="padding-top: 4px; text-align: right;">${netWeight.toFixed(2)}</td>
            <td style="padding-top: 4px; text-align: right;">${price.toFixed(2)}</td>
            <td style="padding-top: 4px; text-align: right; font-weight: bold;">${itemTotal.toFixed(2)}</td>
          </tr>
        `;
    } else {
      // NORMAL ITEM
      combinedRows += `
          <tr class="item-divider">
            <td colspan="4" style="border-bottom: 1px dashed #000; padding-bottom: 3px;"></td>
          </tr>
          <tr>
            <td colspan="4" style="font-weight: bold; padding-top: 5px;">${item.name || item.productName}</td>
          </tr>
        `;

      // Store 2 items: Show Gross, Tare, Net weights
      if (item.storeSource === 2 && item.grossWeight > 0) {
        const grossWt = parseFloat(item.grossWeight) || 0;
        const tareWt = parseFloat(item.tareWeight) || 0;
        const netWt = qty;

        combinedRows += `
            <tr>
              <td colspan="4" style="padding-left: 8px; font-size: 11px;">
                Gross: ${grossWt.toFixed(2)} kg - Tare: ${tareWt.toFixed(2)} kg = Net: ${netWt.toFixed(2)} kg
              </td>
            </tr>
          `;
      }

      const children = items.filter(d =>
        d.splitFrom != null && item.id != null && String(d.splitFrom) === String(item.id)
      );
      const orphans = (itemIndex === 0)
        ? items.filter(d => isDeduction(d) && (!d.splitFrom || !validIds.has(String(d.splitFrom))))
        : [];

      const allDeductions = [...children, ...orphans];

      if (allDeductions.length > 0) {
        let totalDeductions = 0;
        allDeductions.forEach(dedItem => {
          totalDeductions += parseFloat(dedItem.grossWeight) || parseFloat(dedItem.quantity) || 0;
        });

        const grossWeight = qty + totalDeductions;

        combinedRows += `
            <tr>
              <td colspan="4" style="padding-left: 8px; font-size: 11px;">
                +${grossWeight.toFixed(2)} kg
              </td>
            </tr>
          `;

        allDeductions.forEach(dedItem => {
          let deductionText = '';
          const dedQty = parseFloat(dedItem.grossWeight) || parseFloat(dedItem.quantity) || 0;

          if (isDeduction(dedItem)) {
            const deductionType = (dedItem.name?.toLowerCase().includes('container') || dedItem.code === 'CONTAINER')
              ? 'Container'
              : 'Return';
            const unitWeight = dedItem.unitWeight || dedQty;
            const containerCount = dedItem.containerCount || 1;

            deductionText = containerCount > 1
              ? `${deductionType} −${unitWeight.toFixed(2)} kg × ${containerCount} = −${dedQty.toFixed(2)} kg`
              : `${deductionType} −${dedQty.toFixed(2)} kg`;
          } else {
            deductionText = `${dedItem.name || dedItem.productName} −${dedQty.toFixed(2)} kg`;
          }

          combinedRows += `
              <tr class="deduction-entry">
                <td colspan="4" style="padding-left: 8px; font-size: 11px;">
                  ${deductionText}
                </td>
              </tr>
            `;
        });

        combinedRows += `
            <tr>
              <td style="padding-top: 4px;"></td>
              <td style="padding-top: 4px; text-align: right;">${qty.toFixed(2)}</td>
              <td style="padding-top: 4px; text-align: right;">${price.toFixed(2)}</td>
              <td style="padding-top: 4px; text-align: right; font-weight: bold;">${itemTotal.toFixed(2)}</td>
            </tr>
          `;
      } else {
        combinedRows += `
            <tr>
              <td style="padding-top: 4px;"></td>
              <td style="padding-top: 4px; text-align: right;">${qty.toFixed(2)}</td>
              <td style="padding-top: 4px; text-align: right;">${price.toFixed(2)}</td>
              <td style="padding-top: 4px; text-align: right; font-weight: bold;">${itemTotal.toFixed(2)}</td>
            </tr>
          `;
      }
    }
  });

  // Header content - different for sell mode
  let headerContent = `
      <div class="code">${billId || data.code}</div>
      ${s2BillId ? `<div style="font-weight:bold; font-size:12px; margin-bottom:2px">QR Ref: ${s2BillId}</div>` : ''}
      <div class="date-time">${date || ''} ${time || ''}</div>
    `;

  // Sell mode: Big S box on left, bill info aligned left after box
  if (mode === 'sell') {
    headerContent = `
      <div class="sell-header">
        <div class="sell-box">S</div>
        <div class="sell-info">
          <div class="code">${billId || data.code}</div>
          ${s2BillId ? `<div style="font-weight:bold; font-size:12px;">QR: ${s2BillId}</div>` : ''}
          <div class="date-time">${date || ''} ${time || ''}</div>
        </div>
      </div>
    `;
  }

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Source+Sans+Pro&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Source Sans Pro', sans-serif; }
      .container { display: block; width: 100%; background: #fff; padding: 10px; }
      .receipt_header { padding-bottom: 10px; border-bottom: 1px dashed #000; text-align: center; }
      .receipt_header h1 { font-size: 20px; margin-bottom: 5px; text-transform: uppercase; }
      .receipt_header h2 { font-size: 14px; color: #000; font-weight: 300; }
      .date_time_con { text-align: center; padding-bottom: 10px; padding-top: 5px; }
      .date_time_con .code { font-weight: bold; font-size: 15px; }
      .date_time_con .date-time { font-size: 13px; }
      .items { margin-top: 5px; border-top: 1px dashed #000; }
      .total { margin-top: 5px; padding-top: 5px; text-align: right; }
      h3 { border-top: 1px dashed #000; padding-top: 5px; margin-top: 5px; text-align: center; text-transform: uppercase; font-size: 24px; }
      table { width: 100%; }
      thead th { text-align: left; border-bottom: 1px dashed #000; }
      thead th:last-child { text-align: right; }
      tbody td { text-align: right; }
      tbody td:first-child { text-align: left; }
      /* Sell mode header - Big S box with bill info aligned left */
      .sell-header { display: flex; align-items: stretch; gap: 8px; margin-bottom: 5px; }
      .sell-box { width: 40%; min-height: 50px; background: #000; color: #fff; font-size: 40px; font-weight: bold; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .sell-info { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: left; padding-left: 2px; }
      .sell-info .code { font-weight: bold; font-size: 14px; }
      .sell-info .date-time { font-size: 12px; }
    </style>
  </head>
  <body>
  <div class="container">
    <div class="receipt_header">
      <h1><span>Ishanka Stores</span></h1>
      <h2>K.A.Anurarathna Stores<br>Market Road<br>Sooriyawewa.<br>TP: 077 367 7084</h2>
    </div>
    <div class="date_time_con">${headerContent}</div>
    <div class="items">
      <table>
        <thead>
          <tr><th>ITEM</th><th>QTY</th><th>PRICE</th><th>AMT</th></tr>
        </thead>
        <tbody>${combinedRows}</tbody>
      </table>
      <div class="total">
        <h3>Total: රු ${typeof total === 'number' ? Math.floor(total) : total}</h3>
        ${(parseFloat(cashTendered) > 0) ? `
          <div style="font-size: 14px; margin-top: 5px;">Given: Rs. ${parseFloat(cashTendered).toFixed(2)}</div>
          <div style="font-size: 14px; margin-top: 2px; font-weight: bold;">Change: Rs. ${parseFloat(change).toFixed(2)}</div>
        ` : ''}
      </div>
    </div>
    <h3>ස්තුතියි!</h3>
  </div>
  </body>
  </html>
    `;
};
