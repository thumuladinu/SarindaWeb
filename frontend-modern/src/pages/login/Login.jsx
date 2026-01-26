import React, { useState } from 'react';
import { Card, CardBody } from "@heroui/react";
import { Form, Input, Button, Checkbox, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import logo from "../../assets/images/logo.png";

const Login = () => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);

    const onFinish = async (values) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/login', values);

            if (response.status === 200) {
                const { USER_ID, NAME, EMAIL, ROLE, PHOTO } = response.data.user;

                // Enforce Admin/Dev/Monitor Access
                const allowedRoles = ['admin', 'dev', 'monitor'];
                if (!allowedRoles.includes((ROLE || '').toLowerCase())) {
                    message.error('Access Denied: Application restricted to Admins.');
                    return;
                }

                if (values.remember) {
                    Cookies.set('rememberedUser', JSON.stringify({ USER_ID, NAME, EMAIL, ROLE, PHOTO }), { expires: 2 });
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
            <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-green-500/10 rounded-full blur-[100px] pointer-events-none" />

            <Card className="w-full max-w-[400px] bg-black/40 backdrop-blur-3xl border border-white/5 shadow-2xl z-10 rounded-[24px]">
                <CardBody className="p-8 sm:p-10 flex flex-col gap-2">
                    {/* Header */}
                    <div className="flex flex-col items-center text-center gap-4 mb-4">
                        <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 rounded-2xl flex items-center justify-center shadow-inner ring-1 ring-white/10 backdrop-blur-md">
                            <img src={logo} alt="Logo" className="w-12 h-12 object-contain drop-shadow-lg" onError={(e) => e.target.style.display = 'none'} />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-3xl font-bold text-white tracking-tight">
                                Welcome Back
                            </h1>
                            <p className="text-gray-400 text-sm font-medium">
                                Sign in to Ishanka Stores Management System
                            </p>
                        </div>
                    </div>

                    {/* Ant Design Form with Custom Styles */}
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
                            <Form.Item
                                name="user"
                                rules={[{ required: true, message: 'Required' }]}
                                className="mb-0"
                            >
                                <Input
                                    prefix={<UserOutlined />}
                                    placeholder="Enter username"
                                    className="!h-12 !text-base"
                                />
                            </Form.Item>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-400 ml-1 uppercase tracking-wider">Password</label>
                            <Form.Item
                                name="password"
                                rules={[{ required: true, message: 'Required' }]}
                                className="mb-0"
                            >
                                <Input.Password
                                    prefix={<LockOutlined />}
                                    placeholder="Enter password"
                                    className="!h-12 !text-base"
                                />
                            </Form.Item>
                        </div>

                        <div className="flex justify-between items-center mt-1">
                            <Form.Item name="remember" valuePropName="checked" noStyle>
                                <Checkbox className="text-gray-400 hover:text-emerald-400 transition-colors">Remember me</Checkbox>
                            </Form.Item>
                            <a className="text-sm font-medium text-emerald-500 hover:text-emerald-400 transition-colors" href="#">
                                Forgot password?
                            </a>
                        </div>

                        <Form.Item className="mb-0 mt-2">
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                block
                                className="!h-12 !rounded-xl !text-base !font-bold uppercase tracking-wide !shadow-lg shadow-emerald-500/20"
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
