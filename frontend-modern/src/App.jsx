import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/login/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions'; // New Import
import PlaceholderPage from './pages/PlaceholderPage';
import Cookies from 'js-cookie';

import Items from './pages/items/Items';
import Inventory from './pages/inventory/Inventory'; // New Import
import Balance from './pages/balance/Balance'; // New Import
import Customers from './pages/customers/Customers';
import Users from './pages/users/Users';
import Weighting from './pages/weighting/Weighting';
import Reports from './pages/reports/Reports';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
    const user = Cookies.get('rememberedUser');
    if (!user) {
        return <Navigate to="/" replace />;
    }
    return children;
};

// Public Route (redirect to dashboard if logged in)
const PublicRoute = ({ children }) => {
    const user = Cookies.get('rememberedUser');
    if (user) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
};

function App() {
    return (
        <Routes>
            <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />

            {/* Protected Routes wrapped in MainLayout */}
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/balance" element={<Balance />} />
                <Route path="/items" element={<Items />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/users" element={<Users />} />
                <Route path="/weighting" element={<Weighting />} />
                <Route path="/reports" element={<Reports />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
