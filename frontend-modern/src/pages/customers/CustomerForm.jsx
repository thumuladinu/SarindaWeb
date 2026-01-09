import React, { useEffect, useState } from 'react';
import { Drawer, Form, Input, Button, App, Spin, Row, Col } from 'antd';
import axios from 'axios';
import Cookies from 'js-cookie';

const CustomerForm = ({ open, onClose, onSuccess, initialValues, mode = 'add' }) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();

    // Get user from cookies
    const getUser = () => {
        const userStr = Cookies.get('rememberedUser');
        return userStr ? JSON.parse(userStr) : null;
    };
    const user = getUser();

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            if (mode === 'edit' && initialValues) {
                form.setFieldsValue(initialValues);
            } else {
                form.resetFields();
            }
        }
    }, [open, mode, initialValues, form]);

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const apiEndpoint = mode === 'edit'
                ? '/api/updateCustomer'
                : '/api/addCustomer';

            const payload = {
                ...values,
                CREATED_BY: user?.USER_ID,
                IS_ACTIVE: 1
            };

            if (mode === 'edit') {
                payload.CUSTOMER_ID = initialValues.CUSTOMER_ID;
            }

            const response = await axios.post(apiEndpoint, payload);

            if (response.data.success) {
                message.success(`Customer ${mode === 'edit' ? 'updated' : 'added'} successfully`);
                onSuccess();
                onClose();
                form.resetFields();
            } else {
                message.error(response.data.message || 'Operation failed');
            }
        } catch (error) {
            console.error('Customer save error:', error);
            message.error('Failed to save customer');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            title={mode === 'edit' ? "Edit Customer" : "Add New Customer"}
            open={open}
            onClose={onClose}
            width={500}
            maskClosable={false}
            styles={{ body: { paddingBottom: 80 } }}
            className="glass-drawer"
            closeIcon={<span className="text-gray-500 text-lg">×</span>}
        >
            <Spin spinning={loading}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{}}
                    className="flex flex-col gap-4"
                >
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="NAME"
                                label="Customer Name"
                                rules={[{ required: true, message: 'Customer name is required' }]}
                            >
                                <Input placeholder="Enter customer name" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="PHONE_NUMBER"
                                label="Phone Number"
                            >
                                <Input placeholder="Phone number" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="NIC"
                                label="NIC Number"
                            >
                                <Input placeholder="NIC number" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="COMPANY"
                                label="Company"
                            >
                                <Input placeholder="Company name (Optional)" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="ADDRESS"
                                label="Address"
                            >
                                <Input.TextArea rows={4} placeholder="Enter address" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100 dark:border-white/10">
                        <Button onClick={onClose} size="large" className="rounded-xl" disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            size="large"
                            className="rounded-xl px-8 bg-blue-600 hover:bg-blue-500 border-none shadow-lg shadow-blue-500/30"
                        >
                            {mode === 'edit' ? 'Update Customer' : 'Add Customer'}
                        </Button>
                    </div>
                </Form>
            </Spin>
        </Drawer>
    );
};

export default CustomerForm;
