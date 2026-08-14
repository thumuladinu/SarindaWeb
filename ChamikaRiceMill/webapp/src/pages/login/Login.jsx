import React, { useState } from 'react';
import { Card, CardBody } from "@heroui/react";
import { Form, Input, Button, Checkbox, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import { hasAnyRole } from '../../utils/helpers';

const ALLOWED_ROLES = ['admin', 'dev', 'monitor'];

const Login = () => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);

    const onFinish = async (values) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/login', values);

            if (response.status === 200) {
                const { USER_ID, NAME, EMAIL, ROLE, PHOTO, USERNAME } = response.data.user;

                // Enforce role access — supports comma-separated roles
                if (!hasAnyRole(ROLE, ALLOWED_ROLES)) {
                    message.error('Access Denied: This application is restricted to Admin, Dev and Monitor users.');
                    return;
                }

                const cookieUserObj = { USER_ID, NAME, EMAIL, ROLE, PHOTO, USERNAME: USERNAME || values.username || '' };

                if (values.remember) {
                    Cookies.set('millUser', JSON.stringify(cookieUserObj), { expires: 90 });
                } else {
                    Cookies.set('millUser', JSON.stringify(cookieUserObj));
                }

                message.success({ content: 'Welcome back!', key: 'login' });
                window.location.href = "/dashboard";
            } else {
                message.error('Invalid credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
            message.error('Login failed. Server response error.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden login-gradient">

            {/* Ambient Light Orbs */}
            <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />

            <Card className="w-full max-w-[400px] bg-black/40 backdrop-blur-3xl border border-white/5 shadow-2xl z-10 rounded-[24px]">
                <CardBody className="p-8 sm:p-10 flex flex-col gap-2">
                    {/* Header */}
                    <div className="flex flex-col items-center text-center gap-4 mb-4">
                        <div className="w-24 h-24 bg-slate-900/80 rounded-2xl flex items-center justify-center shadow-2xl ring-1 ring-white/10 backdrop-blur-md p-2 overflow-hidden">
                            <img src="/logo-dark.png" alt="Chamika Rice Mill Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-3xl font-bold text-white tracking-tight">
                                Welcome Back
                            </h1>
                            <p className="text-gray-400 text-sm font-medium">
                                Sign in to Chamika Rice Mill Management
                            </p>
                        </div>
                    </div>

                    {/* Ant Design Form */}
                    <Form
                        name="login"
                        initialValues={{ remember: true }}
                        onFinish={onFinish}
                        layout="vertical"
                        size="large"
                        className="login-form mt-4 flex flex-col gap-4"
                    >
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-400 ml-1 uppercase tracking-wider">Username</label>
                            <Form.Item name="user" rules={[{ required: true, message: 'Required' }]} className="mb-0">
                                <Input prefix={<UserOutlined />} placeholder="Enter username" className="!h-12 !text-base" />
                            </Form.Item>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-400 ml-1 uppercase tracking-wider">Password</label>
                            <Form.Item name="password" rules={[{ required: true, message: 'Required' }]} className="mb-0">
                                <Input.Password prefix={<LockOutlined />} placeholder="Enter password" className="!h-12 !text-base" />
                            </Form.Item>
                        </div>

                        <div className="flex justify-between items-center mt-1">
                            <Form.Item name="remember" valuePropName="checked" noStyle>
                                <Checkbox className="text-gray-400 hover:text-blue-400 transition-colors">Remember me</Checkbox>
                            </Form.Item>
                        </div>

                        <Form.Item className="mb-0 mt-2">
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                block
                                className="!h-12 !rounded-xl !text-base !font-bold uppercase tracking-wide !shadow-lg shadow-blue-500/20"
                            >
                                Sign In
                            </Button>
                        </Form.Item>
                    </Form>
                </CardBody>
            </Card>
        </div>
    );
};

export default Login;
