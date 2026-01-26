import React, { useEffect, useState, useRef } from 'react';
import { Drawer, Form, Input, Button, App, Select, Switch, Row, Col, Modal } from 'antd';
import { CameraOutlined, LoadingOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';

const { Option } = Select;

// imgBB API key
const IMGBB_API_KEY = 'a94bb5679f1add2d50baee0220cc7926';

const UserForm = ({ open, onClose, onSuccess, initialValues, mode = 'add' }) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const [uploading, setUploading] = useState(false);

    // Username validation state
    const [usernameStatus, setUsernameStatus] = useState(''); // 'validating', 'success', 'error', ''
    const [usernameHelp, setUsernameHelp] = useState('');
    const debounceRef = useRef(null);

    const handleUsernameChange = (e) => {
        const value = e.target.value;
        form.setFieldValue('USERNAME', value);

        // Clear previous timeout
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!value) {
            setUsernameStatus('');
            setUsernameHelp('');
            return;
        }

        // Set validating state immediately
        setUsernameStatus('validating');
        setUsernameHelp('Checking availability...');

        // Debounce API call
        debounceRef.current = setTimeout(async () => {
            try {
                // If editing, and value hasn't changed from initial, it's valid (own username)
                if (mode === 'edit' && initialValues && value === initialValues.USERNAME) {
                    setUsernameStatus('success');
                    setUsernameHelp('');
                    return;
                }

                const response = await axios.post('/api/checkUsername', { USERNAME: value });
                if (response.data.exists) {
                    setUsernameStatus('error');
                    setUsernameHelp('Username already taken');
                } else {
                    setUsernameStatus('success');
                    setUsernameHelp('Username available');
                }
            } catch (error) {
                console.error("Username check failed", error);
                setUsernameStatus('');
                setUsernameHelp('');
            }
        }, 500); // 500ms debounce
    };

    // Camera states
    const [cameraOpen, setCameraOpen] = useState(false);
    const [stream, setStream] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // Get current user
    const getCurrentUser = () => {
        const userStr = Cookies.get('rememberedUser');
        return userStr ? JSON.parse(userStr) : null;
    };
    const currentUser = getCurrentUser();
    // const isDev = currentUser?.ROLE === 'DEV'; // Removed per request

    useEffect(() => {
        if (open) {
            if (mode === 'edit' && initialValues) {
                const { PASSWORD, ...rest } = initialValues;
                form.setFieldsValue({
                    ...rest,
                    IS_ACTIVE: initialValues.IS_ACTIVE === 1,
                    PASSWORD: ''
                });
                setImageUrl(initialValues.PHOTO || '');
            } else {
                form.resetFields();
                form.setFieldsValue({
                    ROLE: 'USER',
                    IS_ACTIVE: true
                });
                setImageUrl('');
            }
        }
    }, [open, mode, initialValues, form]);

    // Clean up camera when modal closes
    useEffect(() => {
        if (!cameraOpen && stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    }, [cameraOpen]);

    // Open camera
    const openCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            setStream(mediaStream);
            setCameraOpen(true);

            // Wait for modal to open then attach stream
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            }, 100);
        } catch (error) {
            console.error('Camera error:', error);
            message.error('Could not access camera. Please check permissions.');
        }
    };

    // Capture photo from video stream
    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
                    uploadToImgBB(file);
                    closeCamera();
                }
            }, 'image/jpeg', 0.8);
        }
    };

    // Close camera
    const closeCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setCameraOpen(false);
    };

    // Upload to imgBB
    const uploadToImgBB = async (file) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                const url = data.data.display_url;
                setImageUrl(url);
                form.setFieldValue('PHOTO', url);
                message.success('Photo uploaded!');
            } else {
                message.error('Failed to upload image');
            }
        } catch (error) {
            console.error('Upload error:', error);
            message.error('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                message.error('Please select an image file');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                message.error('Image must be smaller than 5MB');
                return;
            }
            uploadToImgBB(file);
        }
        e.target.value = '';
    };

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const apiEndpoint = mode === 'edit' ? '/api/updateUser' : '/api/addUser';

            const payload = {
                ...values,
                IS_ACTIVE: values.IS_ACTIVE ? 1 : 0,
                PHOTO: imageUrl || null
            };

            if (mode === 'edit' && !values.PASSWORD) {
                delete payload.PASSWORD;
            }

            if (mode === 'edit') {
                payload.USER_ID = initialValues.USER_ID;
            }

            const response = await axios.post(apiEndpoint, payload);

            if (response.data.success) {
                message.success(`User ${mode === 'edit' ? 'updated' : 'added'} successfully`);
                onSuccess();
                onClose();
                form.resetFields();
                setImageUrl('');
            } else {
                message.error(response.data.message || 'Operation failed');
            }
        } catch (error) {
            console.error('User save error:', error);
            message.error('Failed to save user');
        } finally {
            setLoading(false);
        }
    };

    const userInitial = form.getFieldValue('NAME')?.charAt(0)?.toUpperCase() || 'U';

    return (
        <>
            <Drawer
                title={mode === 'edit' ? "Edit User" : "Add New User"}
                open={open}
                onClose={onClose}
                width={500}
                maskClosable={false}
                styles={{ body: { paddingBottom: 80 } }}
                className="glass-drawer"
                closeIcon={<span className="text-gray-500 text-lg">×</span>}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    className="flex flex-col gap-4"
                >
                    {/* Profile Image Upload */}
                    <div className="flex flex-col items-center mb-6">
                        {/* Profile Picture */}
                        <div className="relative mb-3">
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt="Profile"
                                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-zinc-700 shadow-xl"
                                />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white text-3xl font-bold shadow-xl">
                                    {userInitial}
                                </div>
                            )}
                            {uploading && (
                                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                                    <LoadingOutlined className="text-white text-xl" />
                                </div>
                            )}
                        </div>

                        {/* Upload Buttons */}
                        {/* Upload Buttons */}
                        <div className="flex gap-3 w-full max-w-[320px]">
                            {/* Take Photo - Opens camera directly */}
                            <Button
                                icon={<CameraOutlined />}
                                onClick={openCamera}
                                disabled={uploading}
                                type="primary"
                                className="flex-1 !h-[42px] bg-emerald-600 hover:bg-emerald-500 border-none !rounded-xl shadow-md font-medium"
                            >
                                Take Photo
                            </Button>

                            {/* Choose File */}
                            <Button
                                onClick={() => document.getElementById('profile-file-input').click()}
                                disabled={uploading}
                                className="flex-1 !h-[42px] !rounded-xl border border-gray-300 dark:border-gray-600 hover:border-blue-500 hover:text-blue-500 font-medium"
                            >
                                Choose File
                            </Button>
                        </div>

                        <input
                            id="profile-file-input"
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />

                        {uploading && <span className="text-xs text-emerald-500 mt-2">Uploading...</span>}

                        <Form.Item name="PHOTO" style={{ display: 'none' }}>
                            <Input />
                        </Form.Item>
                    </div>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="NAME"
                                label="Display Name"
                                rules={[{ required: true, message: 'Display Name is required' }]}
                            >
                                <Input placeholder="Enter display name" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="USERNAME"
                                label="Username"
                                hasFeedback
                                validateStatus={usernameStatus}
                                help={usernameHelp}
                                rules={[{ required: true, message: 'Username is required' }]}
                            >
                                <Input
                                    placeholder="Enter username (for login)"
                                    onChange={handleUsernameChange}
                                    // disabled={mode === 'edit'} // Allow editing if needed, logic handles it. But usually usernames are immutable. Keeping disabled for edit if that was intent, checking code...
                                    // User previously had disabled={mode === 'edit'}. Let's keep it if that's the rule, but then real-time check is moot for edit.
                                    // If user wants check, they probably want to allow editing or create new.
                                    // Let's enable it but maybe keep disabled logic if strictly required. 
                                    // Actually, for "create" it's critical. For "edit" checking if they change it.
                                    disabled={mode === 'edit'}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="ROLE"
                                label="User Role"
                                rules={[{ required: true, message: 'Please select a role' }]}
                            >
                                <Select placeholder="Select role">
                                    <Option value="ADMIN">Admin</Option>
                                    <Option value="USER">User</Option>
                                    <Option value="MONITOR">Monitor</Option>
                                    {currentUser?.ROLE === 'DEV' && <Option value="DEV">Developer</Option>}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="PASSWORD"
                                label={mode === 'edit' ? "New Password (Leave empty to keep current)" : "Password"}
                                rules={[{ required: mode === 'add', message: 'Password is required' }]}
                            >
                                <Input.Password placeholder={mode === 'edit' ? "Enter new password" : "Enter password"} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="IS_ACTIVE"
                                valuePropName="checked"
                                label="Status"
                            >
                                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100 dark:border-white/10">
                        <Button onClick={onClose} size="large" className="rounded-xl" disabled={loading}>
                            Cancel
                        </Button>
                        {currentUser?.ROLE !== 'MONITOR' && (
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                size="large"
                                className="rounded-xl px-8 bg-emerald-600 hover:bg-emerald-500 border-none shadow-lg shadow-emerald-500/30"
                            >
                                {mode === 'edit' ? 'Update User' : 'Add User'}
                            </Button>
                        )}
                    </div>
                </Form>
            </Drawer>

            {/* Camera Modal */}
            <Modal
                open={cameraOpen}
                onCancel={closeCamera}
                footer={null}
                title="Take Photo"
                width={400}
                centered
                destroyOnClose
            >
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                        />
                    </div>

                    <canvas ref={canvasRef} style={{ display: 'none' }} />

                    <div className="flex gap-3">
                        <Button onClick={closeCamera}>
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            icon={<CameraOutlined />}
                            onClick={capturePhoto}
                            className="bg-emerald-600 hover:bg-emerald-500 border-none"
                            size="large"
                        >
                            Capture
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default UserForm;
