import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeroUIProvider } from '@heroui/react'
import { App } from 'antd'
import { AntdProvider } from './components/ui/AntdProvider'
import { ThemeProvider } from './components/ui/ThemeProvider'
import { BrowserRouter } from 'react-router-dom'
import RootApp from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <HeroUIProvider>
                <ThemeProvider>
                    <AntdProvider>
                        <App className="h-full">
                            <RootApp />
                        </App>
                    </AntdProvider>
                </ThemeProvider>
            </HeroUIProvider>
        </BrowserRouter>
    </React.StrictMode>,
)
