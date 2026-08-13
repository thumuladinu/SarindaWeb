import React from 'react';
import { ConfigProvider, theme } from 'antd';

export const AntdProvider = ({ children }) => {
    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#3B82F6', // Blue-500
                    borderRadius: 12,
                    wireframe: false,
                    fontFamily: "Inter, sans-serif",
                    colorBgContainer: '#18181b',
                    colorBgElevated: '#27272a',
                    colorBgLayout: '#09090b',
                    colorText: '#f4f4f5',
                    colorTextHeading: '#ffffff',
                    colorTextSecondary: '#a1a1aa',
                    colorBorder: '#3f3f46',
                    colorBorderSecondary: '#27272a',
                },
                components: {
                    Button: {
                        borderRadius: 12,
                        controlHeight: 40,
                        algorithm: true,
                    },
                    Input: {
                        borderRadius: 12,
                        controlHeight: 44,
                        activeBorderColor: '#3B82F6',
                        hoverBorderColor: '#60A5FA',
                    },
                    Select: {
                        borderRadius: 12,
                        controlHeight: 44,
                    },
                    DatePicker: {
                        borderRadius: 12,
                        controlHeight: 44,
                    },
                    Card: {
                        colorBgContainer: '#18181b',
                    },
                    Modal: {
                        colorBgElevated: '#18181b',
                    },
                    Drawer: {
                        colorBgElevated: '#18181b',
                    },
                    Table: {
                        colorBgContainer: '#18181b',
                        headerBg: '#27272a',
                        headerColor: '#ffffff',
                    }
                }
            }}
        >
            {children}
        </ConfigProvider>
    );
};
