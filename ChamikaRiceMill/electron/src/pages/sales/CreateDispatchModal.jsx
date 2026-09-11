import React, { useState, useEffect } from 'react';
import { Modal, Form, DatePicker, Select, InputNumber, Button, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import printService from '../../services/printService';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

export default function CreateDispatchModal({ visible, onClose, selectedBills, onSuccess }) {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [staffList, setStaffList] = useState([]);

    useEffect(() => {
        if (visible) {
            loadDropdowns();
            const currentVals = form.getFieldsValue();
            const hasBagValues = currentVals.TOTAL_5KG !== undefined && currentVals.TOTAL_5KG !== null;
            if (!hasBagValues) {
                let b5 = 0, b10 = 0, b25 = 0;
                if (Array.isArray(selectedBills)) {
                    selectedBills.forEach(b => {
                        let items = b.ITEMS || b.ITEMS_JSON || [];
                        if (typeof items === 'string') {
                            try { items = JSON.parse(items); } catch(e) { items = []; }
                        }
                        if (Array.isArray(items)) {
                            items.forEach(i => {
                                const w = Number(i.BAG_WEIGHT || i.bagWeight || i.WEIGHT || i.weight || 0);
                                let qty = Number(i.BAG_COUNT || i.bagCount || i.QTY || i.qty || 0);
                                if (!qty && w > 0 && i.QUANTITY) {
                                    qty = Number(i.QUANTITY) / w;
                                }
                                if (w === 5) b5 += qty;
                                else if (w === 10) b10 += qty;
                                else if (w === 25) b25 += qty;
                            });
                        }
                    });
                }
                const bTotal = b5 + b10 + b25;
                form.setFieldsValue({
                    DATE: dayjs(),
                    TOTAL_5KG: b5,
                    TOTAL_10KG: b10,
                    TOTAL_25KG: b25,
                    TOTAL_BAGS: bTotal
                });
            }
        } else {
            form.resetFields();
        }
    }, [visible]);

    const loadDropdowns = async () => {
        const [vList, sList] = await Promise.all([
            db.vehicles.toArray(),
            db.staff.toArray()
        ]);
        setVehicles(vList || []);
        setStaffList(sList || []);
    };

    const handleVehicleChange = (val) => {
        const vObj = vehicles.find(v => v.VEHICLE_NO === val);
        if (vObj && vObj.DRIVER_NAME) {
            form.setFieldsValue({ DRIVER_NAME: vObj.DRIVER_NAME });
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

    const generateSequentialDispatchNo = async (terminalCode) => {
        const todayStr = dayjs().format('YYYYMMDD');
        const prefix = `MDN-${todayStr}-${terminalCode}-`;
        const allNotes = await db.dispatch_notes.toArray();
        let maxSeq = 0;
        allNotes.forEach(n => {
            if (n.DISPATCH_NO && n.DISPATCH_NO.startsWith(prefix)) {
                const parts = n.DISPATCH_NO.split('-');
                const last = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(last) && last > maxSeq) {
                    maxSeq = last;
                }
            }
        });
        const nextSeq = maxSeq + 1;
        return `${prefix}${String(nextSeq).padStart(4, '0')}`;
    };

    const handleFinish = async (values) => {
        if (!selectedBills || selectedBills.length === 0) {
            message.error('No sales bills selected');
            return;
        }

        setLoading(true);
        try {
            const billIds = selectedBills.map(b => b.BILL_ID || b.LOCAL_ID);
            const invoiceNos = selectedBills.map(b => b.INVOICE_NO).filter(Boolean);
            const dateStr = values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
            const terminalCode = getTerminalDeviceCode();
            const userName = getCurrentUserName();
            const dispatchNo = await generateSequentialDispatchNo(terminalCode);

            const driverNameStr = Array.isArray(values.DRIVER_NAME) ? values.DRIVER_NAME.join(', ') : (values.DRIVER_NAME || 'Main Driver');

            const payload = {
                DISPATCH_NO: dispatchNo,
                BILL_IDS_JSON: billIds,
                INVOICE_NOS_JSON: invoiceNos,
                DATE: dateStr,
                CREATED_DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                DRIVER_NAME: driverNameStr,
                LORRY_NO: values.LORRY_NO,
                STAFF_NAME: values.STAFF_NAME || 'Officer',
                TOTAL_5KG: values.TOTAL_5KG !== undefined ? Number(values.TOTAL_5KG) : undefined,
                TOTAL_10KG: values.TOTAL_10KG !== undefined ? Number(values.TOTAL_10KG) : undefined,
                TOTAL_25KG: values.TOTAL_25KG !== undefined ? Number(values.TOTAL_25KG) : undefined,
                TOTAL_BAGS: values.TOTAL_BAGS !== undefined ? Number(values.TOTAL_BAGS) : undefined,
                STATUS: 'PENDING',
                BILLS_COUNT: selectedBills.length,
                DEVICE_ID: terminalCode,
                ADDED_BY: userName,
                CREATED_BY_NAME: userName,
                IS_SYNCED: 0
            };

            const localDispatchId = await db.dispatch_notes.add(payload);
            const createdNote = { ...payload, LOCAL_ID: localDispatchId };

            // Update sales bills locally with DISPATCH_ID & DISPATCH_NO
            for (const b of selectedBills) {
                await db.sales_bills.update(b.LOCAL_ID, {
                    DISPATCH_ID: localDispatchId,
                    DISPATCH_NO: dispatchNo,
                    IS_SYNCED: 0
                });
            }

            message.success(`Dispatch Note ${dispatchNo} created for ${selectedBills.length} bills!`);
            form.resetFields();
            if (onSuccess) onSuccess();
            onClose();

            // Automatically navigate to Dispatch Notes page without auto-printing
            navigate('/dispatch-notes');

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error creating dispatch note:', e);
            message.error('Failed to create dispatch note');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={<span className="font-bold text-slate-800">🚚 Create Dispatch Note ({selectedBills?.length || 0} Bills Selected)</span>}
            open={visible}
            onCancel={onClose}
            footer={null}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={handleFinish} onValuesChange={handleValuesChange}>
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

                {/* BAG COUNTS SUMMARY SECTION */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-4 space-y-2">
                    <div className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-1">
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

                <div className="flex justify-end gap-2 pt-2">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="primary" htmlType="submit" loading={loading} className="!bg-blue-600 font-bold">
                        Generate Dispatch Note
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
