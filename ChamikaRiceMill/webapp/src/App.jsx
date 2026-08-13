import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/login/Login';
import Dashboard from './pages/Dashboard';
import Items from './pages/items/Items';
import Places from './pages/places/Places';
import StockInward from './pages/stock-inward/StockInward';
import Inventory from './pages/inventory/Inventory';
import Settings from './pages/settings/Settings';
import Sales from './pages/sales/Sales';
import Customers from './pages/customers/Customers';
import Cheques from './pages/cheques/Cheques';
import PrintableBill from './pages/sales/PrintableBill';
import PrintableDispatchNote from './pages/sales/PrintableDispatchNote';
import DispatchNotes from './pages/sales/DispatchNotes';
import DirectSale from './pages/sales/DirectSale';
import PriceCalculator from './pages/calculator/PriceCalculator';
import Vehicles from './pages/vehicles/Vehicles';
import Staff from './pages/staff/Staff';
import SalesReturns from './pages/sales/SalesReturns';
import Expenses from './pages/expenses/Expenses';
import BagLabels from './pages/labels/BagLabels';
import TimeTracker from './pages/time-tracker/TimeTracker';
import Cookies from 'js-cookie';
import { hasAnyRole } from './utils/helpers';
import { io } from 'socket.io-client';
import { App as AntdApp } from 'antd';
import { useEffect } from 'react';

// Allowed roles for Mill Web App
const ALLOWED_ROLES = ['admin', 'dev', 'monitor'];

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
    const userCookie = Cookies.get('millUser');
    if (!userCookie) {
        return <Navigate to="/" replace />;
    }
    try {
        const user = JSON.parse(userCookie);
        if (!hasAnyRole(user.ROLE, ALLOWED_ROLES)) {
            return <Navigate to="/" replace />;
        }
    } catch {
        return <Navigate to="/" replace />;
    }
    return children;
};

// Public Route (redirect to dashboard if logged in)
const PublicRoute = ({ children }) => {
    const userCookie = Cookies.get('millUser');
    if (userCookie) {
        try {
            const user = JSON.parse(userCookie);
            if (hasAnyRole(user.ROLE, ALLOWED_ROLES)) {
                return <Navigate to="/dashboard" replace />;
            }
        } catch { /* ignore */ }
    }
    return children;
};

// Notification Listener for WebSockets
const NotificationListener = () => {
    const { notification } = AntdApp.useApp();
    
    useEffect(() => {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const socket = io(apiUrl);
        
        socket.on('transfer_created', (data) => {
            if (data.storeTo === 999) { // Mill ID
                notification.info({
                    message: `New Store Transfer`,
                    description: `Store ${data.storeFrom} sent ${data.mainItemQty}kg of ${data.mainItemName}.`,
                    placement: 'topRight',
                    duration: 10
                });
            }
        });
        
        return () => socket.disconnect();
    }, [notification]);
    
    return null;
};

function App() {
    return (
        <>
            <NotificationListener />
            <Routes>
            <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />

            {/* Protected Routes without Layout */}
            <Route path="/print-bill/:id" element={<ProtectedRoute><PrintableBill /></ProtectedRoute>} />
            <Route path="/print-dispatch/:id" element={<ProtectedRoute><PrintableDispatchNote /></ProtectedRoute>} />

            {/* Protected Routes wrapped in MainLayout */}
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/items" element={<Items />} />
                <Route path="/places" element={<Places />} />
                <Route path="/stock-inward" element={<StockInward />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/quick-pos" element={<DirectSale />} />
                <Route path="/price-calculator" element={<PriceCalculator />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="/staff" element={<Staff />} />
                <Route path="/sales-returns" element={<SalesReturns />} />
                <Route path="/labels" element={<BagLabels />} />
                <Route path="/dispatch" element={<DispatchNotes />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/cheques" element={<Cheques />} />
                <Route path="/time-tracker" element={<TimeTracker />} />
                <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </>
    );
}

export default App;
