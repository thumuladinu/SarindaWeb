import React, { useEffect, useState } from 'react';
import { ConfigProvider, theme } from 'antd';

// This component detects changes to the 'dark' class on the HTML element
// and updates the Ant Design theme accordingly.
export const AntdProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        // Check initial state
        const html = document.documentElement;
        setIsDarkMode(html.classList.contains('dark'));

        // Observer for changes
        const observer = new MutationObserver(() => {
            setIsDarkMode(html.classList.contains('dark'));
        });

        observer.observe(html, { attributes: true, attributeFilter: ['class'] });

        return () => observer.disconnect();
    }, []);

    return (
        <ConfigProvider
            theme={{
                algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
                token: {
                    colorPrimary: '#10B981', // Emerald 500
                    borderRadius: 12, // Match HeroUI rounded-medium (usually 12px)
                    wireframe: false,
                    fontFamily: "Inter, sans-serif",
                    colorBgContainer: isDarkMode ? '#18181b' : '#ffffff', // Match Zinc-950/White
                },
                components: {
                    Button: {
                        borderRadius: 12,
                        controlHeight: 40,
                        algorithm: true, // Enable algorithm for button
                    },
                    Input: {
                        borderRadius: 12,
                        controlHeight: 44,
                        activeBorderColor: '#10B981',
                        hoverBorderColor: '#34D399',
                    }
                }
            }}
        >
            {children}
        </ConfigProvider>
    );
};
