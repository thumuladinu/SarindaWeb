import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Tag, Avatar, message, Tooltip, Select } from 'antd';
import { 
    KeyOutlined, UserOutlined, LockOutlined, 
    WifiOutlined, DisconnectOutlined, ArrowRightOutlined,
    LeftOutlined, SyncOutlined, SwapOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import syncService from '../../services/syncService';

export default function Login() {
    const { 
        savedUsername, 
        authenticateUser, 
        findUserByUsername, 
        getAllStaffFromDb, 
        syncStaffToIndexedDB 
    } = useAuth();

    // Step: 1 = Username Input, 2 = PIN / Password Verification
    const [step, setStep] = useState(1);
    const [usernameInput, setUsernameInput] = useState('');
    const [selectedUser, setSelectedUser] = useState(null); // Found user object from IndexedDB
    const [availableStaff, setAvailableStaff] = useState([]);

    // Auth mode: 'pin' or 'password'
    const [mode, setMode] = useState('pin');
    const [pin, setPin] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [syncingStaff, setSyncingStaff] = useState(false);

    // Network status
    const [isOnline, setIsOnline] = useState(syncService.isOnline);
    const [latency, setLatency] = useState(syncService.latency);

    useEffect(() => {
        loadStaffAndInit();

        const unsub = syncService.subscribe((event, data) => {
            if (event === 'connectionStatus') {
                setIsOnline(data.online);
                setLatency(data.latency);
            }
            if (event === 'syncComplete') {
                loadStaffAndInit();
            }
        });
        return unsub;
    }, []);

    const loadStaffAndInit = async () => {
        await syncStaffToIndexedDB();
        const staff = await getAllStaffFromDb();
        setAvailableStaff(staff);

        // If a username was saved from previous session, automatically load them into Step 2
        if (savedUsername) {
            setUsernameInput(savedUsername);
            const found = await findUserByUsername(savedUsername);
            if (found) {
                setSelectedUser(found);
                setStep(2);
            }
        }
    };

    const handleSyncUsers = async () => {
        setSyncingStaff(true);
        try {
            await syncStaffToIndexedDB();
            const staff = await getAllStaffFromDb();
            setAvailableStaff(staff);
            message.success(`Synced ${staff.length} staff accounts from server!`);
            
            if (usernameInput) {
                const found = await findUserByUsername(usernameInput);
                if (found) setSelectedUser(found);
            }
        } catch (e) {
            message.error('Failed to sync users with backend.');
        } finally {
            setSyncingStaff(false);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // STEP 1: VERIFY USERNAME & PROCEED TO STEP 2
    // ─────────────────────────────────────────────────────────────
    const handleProceedToStep2 = async (customUsername) => {
        const targetUsername = (customUsername || usernameInput || '').trim();
        if (!targetUsername) {
            message.warning('Please enter or select a username');
            return;
        }

        setLoading(true);
        let found = await findUserByUsername(targetUsername);

        // If not found locally, try online sync
        if (!found && isOnline) {
            await syncStaffToIndexedDB();
            found = await findUserByUsername(targetUsername);
        }
        setLoading(false);

        if (found) {
            setSelectedUser(found);
            setUsernameInput(found.USERNAME);
            setPin('');
            setPassword('');
            setStep(2);
        } else {
            message.error(`User "${targetUsername}" not found. Ensure the user is registered in Staff Management.`);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // STEP 2: VERIFY PIN OR PASSWORD
    // ─────────────────────────────────────────────────────────────
    const handlePinInput = (digit) => {
        if (pin.length < 8) {
            setPin(prev => prev + digit);
        }
    };

    const handlePinDelete = () => {
        setPin(prev => prev.slice(0, -1));
    };

    const handlePinSubmit = async () => {
        if (!pin) {
            message.warning('Please enter your PIN');
            return;
        }
        setLoading(true);
        const res = await authenticateUser(selectedUser.USERNAME, pin, true);
        setLoading(false);

        if (res.success) {
            message.success(`Welcome back, ${res.user.NAME}!`);
        } else {
            message.error(res.message || 'Invalid PIN');
            setPin('');
        }
    };

    const handlePasswordSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!password) {
            message.warning('Please enter your password');
            return;
        }
        setLoading(true);
        const res = await authenticateUser(selectedUser.USERNAME, password, false);
        setLoading(false);

        if (res.success) {
            message.success(`Welcome back, ${res.user.NAME}!`);
        } else {
            message.error(res.message || 'Invalid password');
        }
    };

    const handleSwitchUser = () => {
        setSelectedUser(null);
        setPin('');
        setPassword('');
        setStep(1);
    };

    // Keyboard support for PIN entry
    useEffect(() => {
        if (step !== 2 || mode !== 'pin') return;
        const handleKeyDown = (e) => {
            if (e.key >= '0' && e.key <= '9') {
                handlePinInput(e.key);
            } else if (e.key === 'Backspace') {
                handlePinDelete();
            } else if (e.key === 'Enter') {
                handlePinSubmit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, mode, pin, selectedUser]);

    const userInitials = (selectedUser?.NAME || selectedUser?.USERNAME || 'MO')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4 font-sans relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

            {/* Top Right: Connection & Sync Buttons */}
            <div className="absolute top-6 right-6 flex items-center gap-2">
                <Tag 
                    color={isOnline ? 'success' : 'warning'} 
                    className="px-3 py-1 text-xs font-bold rounded-xl shadow-lg border-0 flex items-center gap-1.5"
                >
                    {isOnline ? <WifiOutlined /> : <DisconnectOutlined />}
                    <span>{isOnline ? `Server Online (${latency || 0}ms)` : 'Offline Ready'}</span>
                </Tag>
                
                {isOnline && (
                    <Tooltip title="Sync users and latest PINs from web app">
                        <button
                            type="button"
                            onClick={handleSyncUsers}
                            disabled={syncingStaff}
                            className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-xl text-xs font-bold border border-white/20 transition-all cursor-pointer flex items-center gap-1"
                        >
                            <SyncOutlined spin={syncingStaff} />
                            <span>Sync Users</span>
                        </button>
                    </Tooltip>
                )}
            </div>

            <Card 
                className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-2 sm:p-4"
                bordered={false}
            >
                {/* Header Branding (Light Version Logo) */}
                <div className="text-center mb-5">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200 mb-2 overflow-hidden">
                        <img src="/logo-light.png" alt="Chamika Rice Mill Logo" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight m-0">
                        Chamika Rice Mill
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                        Officer POS & Mill Management
                    </p>
                </div>

                {/* ═══════════════════════════════════════════════════════════
                    STEP 1: ENTER OR SELECT USERNAME
                    ═══════════════════════════════════════════════════════════ */}
                {step === 1 && (
                    <div className="space-y-4">
                        <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3.5 text-center">
                            <div className="text-xs font-bold text-blue-950">Step 1: Enter Your Username</div>
                            <div className="text-[11px] text-blue-600 mt-0.5">
                                Type your username or choose from registered staff accounts
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">
                                Officer Username
                            </label>
                            <Input
                                size="large"
                                prefix={<UserOutlined className="text-slate-400" />}
                                placeholder="Enter username (e.g. chamika, officer)"
                                value={usernameInput}
                                onChange={(e) => setUsernameInput(e.target.value)}
                                onPressEnter={() => handleProceedToStep2()}
                                className="rounded-xl font-medium"
                                autoFocus
                            />
                        </div>

                        {/* Autocomplete Suggestions — ONLY shown after user types at least 2 characters to prevent exposing usernames */}
                        {usernameInput.trim().length >= 2 && (() => {
                            const q = usernameInput.trim().toLowerCase();
                            const matches = availableStaff.filter(staff => 
                                (staff.USERNAME && staff.USERNAME.toLowerCase().includes(q)) ||
                                (staff.NAME && staff.NAME.toLowerCase().includes(q))
                            );
                            if (matches.length === 0) return null;
                            return (
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                                        Matching Accounts ({matches.length})
                                    </div>
                                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                                        {matches.map(staff => (
                                            <div
                                                key={staff.STAFF_ID}
                                                onClick={() => handleProceedToStep2(staff.USERNAME || staff.NAME)}
                                                className="p-2 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-all flex items-center justify-between cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <Avatar size={26} className="bg-blue-600 text-white text-xs font-bold">
                                                        {(staff.NAME || staff.USERNAME || 'U')[0].toUpperCase()}
                                                    </Avatar>
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                                                            {staff.NAME}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-mono">
                                                            @{staff.USERNAME || `user${staff.STAFF_ID}`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <ArrowRightOutlined className="text-xs text-slate-300 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        <Button
                            type="primary"
                            size="large"
                            onClick={() => handleProceedToStep2()}
                            loading={loading}
                            block
                            className="bg-blue-600 hover:bg-blue-700 font-bold rounded-xl h-11 flex items-center justify-center gap-2"
                        >
                            <span>Next: Enter PIN</span>
                            <ArrowRightOutlined />
                        </Button>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STEP 2: USER IS SELECTED -> ENTER PIN OR PASSWORD
                    ═══════════════════════════════════════════════════════════ */}
                {step === 2 && selectedUser && (
                    <div className="space-y-4">
                        {/* Saved Officer Profile Card with Change Account button */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <Avatar size={40} className="bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-sm shadow-sm">
                                    {userInitials}
                                </Avatar>
                                <div>
                                    <div className="text-xs font-bold text-slate-800 leading-tight">
                                        {selectedUser.NAME}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        @{selectedUser.USERNAME} • <span className="uppercase text-blue-600 font-semibold">{selectedUser.ROLE || 'Officer'}</span>
                                    </div>
                                </div>
                            </div>

                            <Tooltip title="Log in as a different user">
                                <button
                                    type="button"
                                    onClick={handleSwitchUser}
                                    className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                >
                                    <SwapOutlined className="text-blue-600" />
                                    <span>Switch</span>
                                </button>
                            </Tooltip>
                        </div>

                        {/* Toggle between Quick PIN & Password */}
                        <div className="flex justify-center">
                            <div className="bg-slate-100 p-1 rounded-2xl flex gap-1 border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setMode('pin')}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === 'pin' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                    <KeyOutlined className="mr-1" />
                                    Quick PIN
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('password')}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === 'password' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                    <LockOutlined className="mr-1" />
                                    Password
                                </button>
                            </div>
                        </div>

                        {mode === 'pin' ? (
                            <div className="space-y-3">
                                {/* PIN Dots Display */}
                                <div className="flex justify-center items-center gap-2.5 py-2 bg-slate-50 border border-slate-200 rounded-2xl">
                                    {[0, 1, 2, 3].map(index => (
                                        <div
                                            key={index}
                                            className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${pin.length > index ? 'bg-blue-600 scale-110 shadow-sm' : 'bg-slate-300'}`}
                                        />
                                    ))}
                                </div>

                                {/* Keypad Grid */}
                                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => handlePinInput(num)}
                                            className="h-13 rounded-2xl text-xl font-bold bg-slate-50 hover:bg-blue-50 hover:text-blue-600 active:scale-95 border border-slate-200/80 transition-all text-slate-800 shadow-xs cursor-pointer"
                                        >
                                            {num}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={handlePinDelete}
                                        className="h-13 rounded-2xl text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 border border-rose-100 transition-all shadow-xs cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePinInput('0')}
                                        className="h-13 rounded-2xl text-xl font-bold bg-slate-50 hover:bg-blue-50 hover:text-blue-600 active:scale-95 border border-slate-200/80 transition-all text-slate-800 shadow-xs cursor-pointer"
                                    >
                                        0
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePinSubmit}
                                        disabled={loading}
                                        className="h-13 rounded-2xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 border border-blue-600 transition-all shadow-md cursor-pointer flex items-center justify-center"
                                    >
                                        {loading ? '...' : <ArrowRightOutlined className="text-base" />}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handlePasswordSubmit} className="space-y-3 pt-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">
                                        Password for @{selectedUser.USERNAME}
                                    </label>
                                    <Input.Password
                                        size="large"
                                        prefix={<LockOutlined className="text-slate-400" />}
                                        placeholder="Enter password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="rounded-xl font-medium"
                                        autoFocus
                                    />
                                </div>
                                <Button
                                    type="primary"
                                    size="large"
                                    htmlType="submit"
                                    block
                                    loading={loading}
                                    className="bg-blue-600 hover:bg-blue-700 font-bold rounded-xl h-11"
                                >
                                    Log In
                                </Button>
                            </form>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}
