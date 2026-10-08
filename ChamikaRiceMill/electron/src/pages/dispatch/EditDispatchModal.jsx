import React, { useState, useEffect } from 'react';
import { Modal, Form, DatePicker, Select, InputNumber, Button, Table, Tag, message, Space } from 'antd';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import printService from '../../services/printService';
import { formatSLDateTime } from '../../utils/terminalHelper';

export default function EditDispatchModal({ visible, record, onClose, onSuccess }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [allBills, setAllBills] = useState([]);
    const [selectedBillIds, setSelectedBillIds] = useState([]);

    useEffect(() => {
        if (visible && record) {
            loadDropdownsAndBills();
        }
    }, [visible, record]);

    // A bill belongs to the note when it carries the note's DISPATCH_NO or its INVOICE_NO is in the note.
    // Older notes without an invoice list fall back to real server BILL_IDs only (never local row numbers).
    const checkIsBillLinked = (b, rec) => {
        if (!b || !rec) return false;
        const rNo = rec.DISPATCH_NO ? String(rec.DISPATCH_NO).trim() : null;
        if (rNo && b.DISPATCH_NO && String(b.DISPATCH_NO).trim() === rNo) return true;

        const toList = (v) => {
            let list = v || [];
            if (typeof list === 'string') {
                try { list = JSON.parse(list); } catch (e) { list = list.split(','); }
            }
            return Array.isArray(list) ? list.map(x => String(x).trim()).filter(Boolean) : [];
        };
        const invNos = toList(rec.INVOICE_NOS_JSON || rec.INVOICE_NOS);
        if (invNos.length > 0) return !!b.INVOICE_NO && invNos.includes(String(b.INVOICE_NO).trim());

        const serverIds = toList(rec.BILL_IDS_JSON || rec.BILL_IDS);
        return !!b.BILL_ID && serverIds.includes(String(b.BILL_ID));
    };

    const loadDropdownsAndBills = async () => {
        try {
            const [vList, sList, bills] = await Promise.all([
                db.vehicles.toArray(),
                db.staff.toArray(),
                db.sales_bills.toArray()
            ]);
            setVehicles(vList || []);
            setStaffList(sList || []);

            // All bills in database sorted newest first
            const sortedBills = [...(bills || [])].sort((a, b) => {
                const dateA = a.CREATED_DATE || a.CREATED_AT || a.DATE || '';
                const dateB = b.CREATED_DATE || b.CREATED_AT || b.DATE || '';
                if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
                return (Number(b.LOCAL_ID || b.BILL_ID || 0)) - (Number(a.LOCAL_ID || a.BILL_ID || 0));
            });

            setAllBills(sortedBills);

            const initialSelectedKeys = sortedBills
                .filter(b => checkIsBillLinked(b, record))
                .map(getBillRowKey);

            setSelectedBillIds(initialSelectedKeys);

            form.setFieldsValue({
                DATE: record.DATE ? dayjs(record.DATE) : dayjs(),
                LORRY_NO: record.LORRY_NO || record.VEHICLE_NO,
                DRIVER_NAME: record.DRIVER_NAME ? (record.DRIVER_NAME.includes(',') ? record.DRIVER_NAME.split(',').map(s => s.trim()) : [record.DRIVER_NAME]) : [],
                STAFF_NAME: record.STAFF_NAME || 'Officer',
                TOTAL_5KG: record.TOTAL_5KG !== undefined ? record.TOTAL_5KG : 0,
                TOTAL_10KG: record.TOTAL_10KG !== undefined ? record.TOTAL_10KG : 0,
                TOTAL_25KG: record.TOTAL_25KG !== undefined ? record.TOTAL_25KG : 0,
                TOTAL_BAGS: record.TOTAL_BAGS !== undefined ? record.TOTAL_BAGS : 0,
            });
        } catch (e) {
            console.error('Error loading bills for edit dispatch:', e);
        }
    };

    const handleVehicleChange = (val) => {
        const vObj = vehicles.find(v => v.VEHICLE_NO === val);
        if (vObj && vObj.DRIVER_NAME) {
            form.setFieldsValue({ DRIVER_NAME: [vObj.DRIVER_NAME] });
        }
    };

    const handleValuesChange = (changedValues, allValues) => {
        if ('TOTAL_5KG' in changedValues || 'TOTAL_10KG' in changedValues || 'TOTAL_25KG' in changedValues) {
            const n5 = Number(allValues.TOTAL_5KG || 0);
            const n10 = Number(allValues.TOTAL_10KG || 0);
            const n25 = Number(allValues.TOTAL_25KG || 0);
            form.setFieldsValue({
                TOTAL_BAGS: n5 + n10 + n25
            });
        }
    };

    const getBillRowKey = (b) => {
        if (b.LOCAL_ID) return `loc_${b.LOCAL_ID}`;
        if (b.INVOICE_NO) return `inv_${b.INVOICE_NO}`;
        return `bill_${b.BILL_ID}`;
    };

    const handleBillSelectionChange = (newSelectedRowKeys) => {
        setSelectedBillIds(newSelectedRowKeys);

        // Recalculate bag totals from newly selected bills
        const selectedObjs = allBills.filter(b => newSelectedRowKeys.includes(getBillRowKey(b)));
        let n5 = 0, n10 = 0, n25 = 0, nTot = 0;
        selectedObjs.forEach(b => {
            let itemsArr = b.ITEMS || b.ITEMS_JSON || [];
            if (typeof itemsArr === 'string') {
                try { itemsArr = JSON.parse(itemsArr); } catch(e) { itemsArr = []; }
            }
            if (Array.isArray(itemsArr)) {
                itemsArr.forEach(i => {
                    const w = Number(i.BAG_WEIGHT);
                    const qty = Number(i.BAG_COUNT || (i.QUANTITY ? i.QUANTITY / w : 0)) || 0;
                    if (w === 5) n5 += qty;
                    else if (w === 10) n10 += qty;
                    else if (w === 25) n25 += qty;
                    nTot += qty;
                });
            }
        });

        form.setFieldsValue({
            TOTAL_5KG: n5,
            TOTAL_10KG: n10,
            TOTAL_25KG: n25,
            TOTAL_BAGS: nTot
        });
    };

    const handleSave = async (andPrint = false) => {
        try {
            const values = await form.validateFields();
            if (!selectedBillIds || selectedBillIds.length === 0) {
                message.error('Please select at least one sales bill for this dispatch note.');
                return;
            }

            setLoading(true);

            if (String(record.STATUS || '').toUpperCase() === 'SETTLED') {
                message.error('This dispatch note is settled and cannot be edited.');
                return;
            }
            const selectedObjs = allBills.filter(b => selectedBillIds.includes(getBillRowKey(b)));
            const otherNote = selectedObjs.find(b => b.DISPATCH_NO && String(b.DISPATCH_NO) !== String(record.DISPATCH_NO));
            if (otherNote) {
                message.error(`Bill ${otherNote.INVOICE_NO} is already on dispatch note ${otherNote.DISPATCH_NO}.`);
                return;
            }
            // Server ids only; the link itself is made by INVOICE_NO
            const rawBillIds = selectedObjs.map(b => b.BILL_ID).filter(Boolean);
            const rawInvoiceNos = selectedObjs.map(b => b.INVOICE_NO).filter(Boolean);

            const dateStr = values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
            const driverNameStr = Array.isArray(values.DRIVER_NAME) ? values.DRIVER_NAME.join(', ') : (values.DRIVER_NAME || 'Main Driver');

            // Find target dispatch_note in Dexie
            let targetNote = null;
            if (record.DISPATCH_NO) {
                targetNote = await db.dispatch_notes.where('DISPATCH_NO').equals(String(record.DISPATCH_NO).trim()).first();
            }
            if (!targetNote && record.DISPATCH_ID) {
                targetNote = await db.dispatch_notes.where('DISPATCH_ID').equals(record.DISPATCH_ID).first();
            }
            if (!targetNote && record.LOCAL_ID) {
                const numId = Number(record.LOCAL_ID);
                if (!isNaN(numId)) targetNote = await db.dispatch_notes.get(numId);
            }

            const updatedPayload = {
                DATE: dateStr,
                LORRY_NO: values.LORRY_NO,
                DRIVER_NAME: driverNameStr,
                STAFF_NAME: values.STAFF_NAME,
                BILL_IDS_JSON: rawBillIds,
                INVOICE_NOS_JSON: rawInvoiceNos,
                INVOICE_NOS: JSON.stringify(rawInvoiceNos),
                BILLS_COUNT: rawInvoiceNos.length,
                TOTAL_5KG: Number(values.TOTAL_5KG || 0),
                TOTAL_10KG: Number(values.TOTAL_10KG || 0),
                TOTAL_25KG: Number(values.TOTAL_25KG || 0),
                TOTAL_BAGS: Number(values.TOTAL_BAGS || 0),
                NEEDS_PUSH: true,
                IS_SYNCED: 0
            };

            if (targetNote && targetNote.LOCAL_ID) {
                await db.dispatch_notes.update(targetNote.LOCAL_ID, updatedPayload);
            } else {
                await db.dispatch_notes.put({
                    ...record,
                    ...updatedPayload,
                    DISPATCH_NO: record.DISPATCH_NO
                });
            }
            const updatedRecord = { ...record, ...(targetNote || {}), ...updatedPayload };

            const dispatchNoVal = updatedRecord.DISPATCH_NO || record.DISPATCH_NO || null;
            const selectedLocalIds = new Set(selectedObjs.map(b => b.LOCAL_ID));

            // Local link only (DISPATCH_NO). The server link is rebuilt from INVOICE_NOS when the note syncs.
            const updates = [];
            for (const b of allBills) {
                if (!b.LOCAL_ID) continue;
                if (selectedLocalIds.has(b.LOCAL_ID)) {
                    updates.push(db.sales_bills.update(b.LOCAL_ID, { DISPATCH_NO: dispatchNoVal }));
                } else if (dispatchNoVal && b.DISPATCH_NO && String(b.DISPATCH_NO) === String(dispatchNoVal)) {
                    updates.push(db.sales_bills.update(b.LOCAL_ID, { DISPATCH_NO: null, DISPATCH_ID: null }));
                }
            }

            await Promise.all(updates);

            // Notify UI subscribers to reload dispatch & sales lists
            syncService.notify('dispatchUpdated');
            syncService.notify('salesUpdated');
            syncService.notify('syncComplete');

            message.success(`Dispatch Note ${record.DISPATCH_NO} updated successfully!`);
            
            if (onSuccess) onSuccess();
            onClose();

            if (andPrint) {
                await printService.printDispatchNote(updatedRecord, selectedObjs, { forceSilent: printService.isAutoPrintEnabled() });
            }

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error updating dispatch note:', e);
            message.error('Failed to update dispatch note');
        } finally {
            setLoading(false);
        }
    };

    const billColumns = [
        {
            title: 'Invoice No',
            dataIndex: 'INVOICE_NO',
            key: 'INVOICE_NO',
            render: (val, r) => (
                <span className="font-mono font-bold text-xs text-blue-900">
                    {val || `MIV-${r.LOCAL_ID}`}
                </span>
            )
        },
        {
            title: 'Customer',
            dataIndex: 'CUSTOMER_NAME',
            key: 'CUSTOMER_NAME',
            render: (val, r) => (
                <div>
                    <div className="font-semibold text-xs text-slate-800">{val || 'Walk-in Customer'}</div>
                    {r.CUSTOMER_PHONE && <div className="text-[10px] text-gray-500">{r.CUSTOMER_PHONE}</div>}
                </div>
            )
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            width: 100,
            render: val => val ? dayjs(val).format('YYYY-MM-DD') : '-'
        },
        {
            title: 'Status',
            dataIndex: 'IS_SETTLED',
            key: 'IS_SETTLED',
            width: 90,
            render: val => val === 1 ? <Tag color="success">SETTLED</Tag> : <Tag color="warning">PENDING</Tag>
        }
    ];

    return (
        <Modal
            title={<span className="font-bold text-slate-800">✏️ Edit Dispatch Note: {record?.DISPATCH_NO}</span>}
            open={visible}
            onCancel={onClose}
            footer={null}
            destroyOnClose
            width={750}
            className="top-6"
        >
            <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
                <div className="grid grid-cols-2 gap-3">
                    <Form.Item label="Dispatch Date" name="DATE" rules={[{ required: true }]}>
                        <DatePicker className="w-full" format="YYYY-MM-DD" />
                    </Form.Item>

                    <Form.Item label="Lorry / Vehicle" name="LORRY_NO" rules={[{ required: true, message: 'Please select lorry' }]}>
                        <Select 
                            placeholder="Select Lorry No" 
                            showSearch 
                            optionFilterProp="children"
                            onChange={handleVehicleChange}
                        >
                            {vehicles.map(v => (
                                <Select.Option key={v.VEHICLE_ID || v.VEHICLE_NO} value={v.VEHICLE_NO}>
                                    {v.VEHICLE_NO} {v.DRIVER_NAME ? `(${v.DRIVER_NAME})` : ''}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Form.Item label="Driver Name" name="DRIVER_NAME" rules={[{ required: true, message: 'Please enter driver name' }]}>
                        <Select 
                            placeholder="Select Driver" 
                            mode="tags" 
                            maxTagCount={1}
                            showSearch
                        >
                            {staffList.filter(s => (s.ROLE || '').toLowerCase() === 'driver').map(s => (
                                <Select.Option key={s.STAFF_ID} value={s.NAME}>
                                    {s.NAME}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="Staff / Assistant" name="STAFF_NAME">
                        <Select placeholder="Select Assisting Staff" allowClear showSearch>
                            {staffList.map(s => (
                                <Select.Option key={s.STAFF_ID} value={s.NAME}>
                                    {s.NAME} ({s.ROLE || 'Staff'})
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </div>

                {/* BAG COUNTS SUMMARY SECTION */}
                <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-100 mb-4 space-y-2">
                    <div className="font-bold text-xs text-blue-900 uppercase tracking-wider mb-1">
                        📦 Dispatch Bag Counts to Print
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        <Form.Item label="5 kg Bags" name="TOTAL_5KG" className="!mb-0">
                            <InputNumber min={0} className="w-full" placeholder="0" />
                        </Form.Item>
                        <Form.Item label="10 kg Bags" name="TOTAL_10KG" className="!mb-0">
                            <InputNumber min={0} className="w-full" placeholder="0" />
                        </Form.Item>
                        <Form.Item label="25 kg Bags" name="TOTAL_25KG" className="!mb-0">
                            <InputNumber min={0} className="w-full" placeholder="0" />
                        </Form.Item>
                        <Form.Item label="Total Bags" name="TOTAL_BAGS" className="!mb-0">
                            <InputNumber min={0} className="w-full font-bold text-blue-600" placeholder="0" />
                        </Form.Item>
                    </div>
                </div>

                {/* SALES BILLS SELECTION TABLE */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4">
                    <div className="flex justify-between items-center mb-2">
                        <div className="font-bold text-xs text-slate-700 uppercase tracking-wider">
                            📜 Loaded Sales Bills ({selectedBillIds.length} Selected)
                        </div>
                        <div className="text-[11px] text-slate-500">
                            Check / Uncheck bills to add or remove from this dispatch note
                        </div>
                    </div>
                    <Table
                        columns={billColumns}
                        dataSource={allBills}
                        rowKey={getBillRowKey}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        scroll={{ y: 320 }}
                        size="small"
                        rowSelection={{
                            type: 'checkbox',
                            selectedRowKeys: selectedBillIds,
                            onChange: handleBillSelectionChange
                        }}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button onClick={() => handleSave(false)} loading={loading} className="font-semibold">
                        Save Changes
                    </Button>
                    <Button type="primary" onClick={() => handleSave(true)} loading={loading} className="!bg-blue-600 font-bold">
                        Save &amp; Print
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
