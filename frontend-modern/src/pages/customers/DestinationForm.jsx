import React, { useEffect } from 'react';
import { Modal, Form, Input, Button, App } from 'antd';
import axios from 'axios';

const DestinationForm = ({ open, onClose, onSuccess, mode, initialValues }) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = React.useState(false);

    useEffect(() => {
        if (open) {
            if (mode === 'edit' && initialValues) {
                form.setFieldsValue(initialValues);
            } else {
                form.resetFields();
            }
        }
    }, [open, mode, initialValues, form]);

    const onFinish = async (values) => {
        setLoading(true);
        try {
            let response;
            if (mode === 'add') {
                response = await axios.post('/api/addDestination', values);
            } else {
                response = await axios.post('/api/updateDestination', {
                    ...values,
                    DESTINATION_ID: initialValues.DESTINATION_ID
                });
            }

            if (response.data.success) {
                message.success(`Destination ${mode === 'add' ? 'added' : 'updated'} successfully`);
                onSuccess();
                onClose();
            } else {
                message.error(response.data.message || `Failed to ${mode} destination`);
            }
        } catch (error) {
            console.error('Form submit error:', error);
            message.error(error.response?.data?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={mode === 'add' ? 'Add New Destination' : 'Edit Destination'}
            open={open}
            onCancel={onClose}
            footer={null}
            destroyOnClose
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{ IS_ACTIVE: 1 }}
                className="mt-4"
            >
                <Form.Item
                    name="CODE"
                    label="Destination Code"
                    rules={[
                        { required: true, message: 'Please input the destination code!' },
                        { whitespace: true, message: 'Code cannot be empty' }
                    ]}
                >
                    <Input placeholder="e.g. COL-01" />
                </Form.Item>

                <Form.Item
                    name="NAME"
                    label="Destination Name"
                    rules={[
                        { required: true, message: 'Please input the destination name!' },
                        { whitespace: true, message: 'Name cannot be empty' }
                    ]}
                >
                    <Input placeholder="e.g. Colombo Main Office" />
                </Form.Item>

                <div className="flex justify-end gap-2 mt-6">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="primary" htmlType="submit" loading={loading} className="bg-blue-600">
                        {mode === 'add' ? 'Add Destination' : 'Save Changes'}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default DestinationForm;
