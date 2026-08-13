import React, { useState, useEffect } from 'react';
import { Modal, Form, DatePicker, Select, Button, message } from 'antd';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

export default function CreateDispatchModal({ visible, onClose, selectedBills, onSuccess }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [staffList, setStaffList] = useState([]);

    useEffect(() => {
        if (visible) {
            loadDropdowns();
            form.setFieldsValue({
                DATE: dayjs()
            });
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

    const handleFinish = async (values) => {
        if (!selectedBills || selectedBills.length === 0) {
            message.error('No sales bills selected');
            return;
        }

        setLoading(true);
        try {
            const billIds = selectedBills.map(b => b.BILL_ID || b.LOCAL_ID);
            const dateStr = values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
            const terminalCode = getTerminalDeviceCode();
            const userName = getCurrentUserName();
            const dispatchNo = `MDN-${dayjs().format('YYYYMMDD')}-${terminalCode}-${Math.floor(100 + Math.random() * 900)}`;

            const payload = {
                DISPATCH_NO: dispatchNo,
                BILL_IDS_JSON: billIds,
                DATE: dateStr,
                CREATED_DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                DRIVER_NAME: values.DRIVER_NAME || 'Main Driver',
                LORRY_NO: values.LORRY_NO,
                STAFF_NAME: values.STAFF_NAME || 'Officer',
                STATUS: 'PENDING',
                BILLS_COUNT: selectedBills.length,
                DEVICE_ID: terminalCode,
                ADDED_BY: userName,
                CREATED_BY_NAME: userName,
                IS_SYNCED: 0
            };

            const localDispatchId = await db.dispatch_notes.add(payload);

            // Update sales bills locally with DISPATCH_ID
            for (const b of selectedBills) {
                await db.sales_bills.update(b.LOCAL_ID, {
                    DISPATCH_ID: localDispatchId,
                    IS_SYNCED: 0
                });
            }

            message.success(`Dispatch Note ${dispatchNo} created for ${selectedBills.length} bills!`);
            form.resetFields();
            if (onSuccess) onSuccess();
            onClose();

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
            <Form form={form} layout="vertical" onFinish={handleFinish}>
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
