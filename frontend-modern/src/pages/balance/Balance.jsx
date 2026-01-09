import React, { useState, useEffect } from 'react';
import { Card, InputNumber, Button, Select, DatePicker, message, Statistic, Spin, Divider } from 'antd';
import { WalletOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import Cookies from 'js-cookie';

const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export default function Balance() {
    const userStr = Cookies.get('rememberedUser');
    const user = userStr ? JSON.parse(userStr) : null;

    console.log("Balance Page Loaded. User:", user?.NAME, "Role:", user?.ROLE);

    // State
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [users, setUsers] = useState([]);

    // Selection
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [selectedUser, setSelectedUser] = useState(user?.USER_ID);

    // Opening Float State
    const [notes, setNotes] = useState({});
    const [openingTotal, setOpeningTotal] = useState(0);
    const [isFloatSet, setIsFloatSet] = useState(false);

    // Real-time Data
    const [balanceData, setBalanceData] = useState({
        opening: 0,
        sales: 0,
        buying: 0,
        expenses: 0,
        balance: 0
    });

    // Helper: Calculate Total from Notes
    useEffect(() => {
        let total = 0;
        Object.keys(notes).forEach(denom => {
            total += (parseInt(denom) * (notes[denom] || 0));
        });
        setOpeningTotal(total);
    }, [notes]);

    // Fetch Users
    useEffect(() => {
        axios.post('/api/getAllUsers')
            .then(res => {
                if (res.data.users) setUsers(res.data.users);
            })
            .catch(err => {
                console.error("Error fetching users:", err);
                message.error("Failed to load user list");
            });
    }, []);

    // Fetch Data on Date/User Change
    useEffect(() => {
        if (selectedDate && selectedUser) {
            fetchBalanceData();
        }
    }, [selectedDate, selectedUser]);

    const fetchBalanceData = async () => {
        setPageLoading(true);
        try {
            const dateStr = selectedDate.format('YYYY-MM-DD');
            const res = await axios.post('/api/getDailyBalance', {
                DATE: dateStr,
                USER_ID: selectedUser
            });

            if (res.data.success) {
                const data = res.data.data;
                setBalanceData(data);

                // If opening float exists, pre-fill notes
                if (data.opening > 0) {
                    setIsFloatSet(true);
                    setNotes(data.notes || {});
                } else {
                    setIsFloatSet(false);
                    setNotes({});
                }
            }
        } catch (error) {
            console.error("Error fetching balance:", error);
            message.error("Failed to load balance data");
        } finally {
            setPageLoading(false);
        }
    };

    const handleSaveFloat = async () => {
        if (openingTotal <= 0) {
            message.warning("Opening amount must be greater than 0");
            return;
        }

        setLoading(true);
        try {
            await axios.post('/api/saveOpeningFloat', {
                DATE: selectedDate.format('YYYY-MM-DD'),
                USER_ID: selectedUser,
                AMOUNT: openingTotal,
                NOTES: notes
            });
            message.success("Opening float saved!");
            fetchBalanceData(); // Refresh to update status
        } catch (error) {
            console.error("Error saving float:", error);
            message.error("Failed to save opening float");
        } finally {
            setLoading(false);
        }
    };

    const handleNoteChange = (denom, count) => {
        setNotes(prev => ({ ...prev, [denom]: count }));
    };

    return (
        <div className="animate-fade-in p-4 pb-32 md:pb-8 max-w-7xl mx-auto">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="hidden md:block">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <WalletOutlined /> Balance & Cash
                    </h2>
                    <p className="text-gray-500 text-sm">Manage daily floats and track real-time cash.</p>
                </div>

                <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3 bg-white dark:bg-white/5 p-3 rounded-2xl shadow-sm">
                    <DatePicker
                        value={selectedDate}
                        onChange={setSelectedDate}
                        allowClear={false}
                        className="w-full sm:w-36 h-10"
                    />
                    <Select
                        value={selectedUser}
                        onChange={setSelectedUser}
                        className="w-full sm:w-40 h-10"
                        placeholder="Select User"
                        popupMatchSelectWidth={false}
                    >
                        <Select.Option value={user?.USER_ID}>Me ({user?.NAME})</Select.Option>
                        {users
                            .filter(u => u.USER_ID !== user?.USER_ID && u.ROLE?.toLowerCase() !== 'dev')
                            .map(u => (
                                <Select.Option key={u.USER_ID} value={u.USER_ID}>{u.NAME}</Select.Option>
                            ))}
                    </Select>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchBalanceData}
                        loading={pageLoading}
                        className="h-10 w-full sm:w-auto"
                    />
                </div>
            </div>

            {pageLoading ? (
                <div className="flex justify-center py-20"><Spin size="large" /></div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* LEFT COLUMN: Opening Float (Note Counter) */}
                    <div className="lg:col-span-1">
                        <div className={`glass-card p-5 rounded-2xl h-full border-t-4 ${isFloatSet ? 'border-emerald-500' : 'border-orange-500'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-700 dark:text-gray-200">
                                    {isFloatSet ? '✅ Opening Float Set' : '⚠️ Set Opening Float'}
                                </h3>
                                <div className="text-xl font-mono font-bold text-emerald-600">
                                    Rs. {openingTotal.toLocaleString()}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {DENOMINATIONS.map(denom => (
                                    <div key={denom} className="flex items-center gap-2 bg-gray-50 dark:bg-white/5 rounded-lg p-2">
                                        <div className="w-14 sm:w-16 text-right font-bold text-gray-600 dark:text-gray-300 text-sm">{denom}</div>
                                        <span className="text-gray-300">×</span>
                                        <InputNumber
                                            min={0}
                                            value={notes[denom]}
                                            onChange={(val) => handleNoteChange(denom, val)}
                                            className="flex-1"
                                            placeholder="0"
                                            controls={false}
                                        />
                                    </div>
                                ))}
                            </div>

                            <Button
                                type="primary"
                                block
                                size="large"
                                icon={<SaveOutlined />}
                                onClick={handleSaveFloat}
                                loading={loading}
                                className="bg-emerald-500 hover:bg-emerald-600 border-none h-12 text-lg"
                            >
                                {isFloatSet ? 'Update Float' : 'Set Opening Float'}
                            </Button>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Real-time Dashboard */}
                    <div className="lg:col-span-2 flex flex-col gap-6">

                        {/* BIG BALANCE CARD */}
                        <div className="glass-card p-8 rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                            <span className="text-gray-400 uppercase tracking-widest text-xs sm:text-sm mb-2">Current Cash In Hand</span>
                            <span className={`text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black font-mono tracking-tight break-all ${balanceData.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                Rs. {balanceData.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-gray-500 text-xs mt-4">
                                Based on Opening Float + Sales - Buying - Expenses
                            </span>
                        </div>

                        {/* Breakdown Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                            <Card className="glass-card border-none shadow-sm !p-3 sm:!p-4">
                                <Statistic
                                    title={<span className="text-gray-500 font-semibold text-xs sm:text-sm">Opening</span>}
                                    value={balanceData.opening}
                                    precision={2}
                                    prefix="+"
                                    valueStyle={{ color: '#3f8600', fontWeight: 'bold', fontSize: 'clamp(14px, 4vw, 24px)' }}
                                />
                            </Card>
                            <Card className="glass-card border-none shadow-sm !p-3 sm:!p-4">
                                <Statistic
                                    title={<span className="text-gray-500 font-semibold text-xs sm:text-sm">Sales (Cash)</span>}
                                    value={balanceData.sales}
                                    precision={2}
                                    prefix="+"
                                    valueStyle={{ color: '#3f8600', fontWeight: 'bold', fontSize: 'clamp(14px, 4vw, 24px)' }}
                                />
                            </Card>
                            <Card className="glass-card border-none shadow-sm !p-3 sm:!p-4">
                                <Statistic
                                    title={<span className="text-gray-500 font-semibold text-xs sm:text-sm">Buying (Cash)</span>}
                                    value={balanceData.buying}
                                    precision={2}
                                    prefix="-"
                                    valueStyle={{ color: '#cf1322', fontWeight: 'bold', fontSize: 'clamp(14px, 4vw, 24px)' }}
                                />
                            </Card>
                            <Card className="glass-card border-none shadow-sm !p-3 sm:!p-4">
                                <Statistic
                                    title={<span className="text-gray-500 font-semibold text-xs sm:text-sm">Expenses (Cash)</span>}
                                    value={balanceData.expenses}
                                    precision={2}
                                    prefix="-"
                                    valueStyle={{ color: '#d46b08', fontWeight: 'bold', fontSize: 'clamp(14px, 4vw, 24px)' }}
                                />
                            </Card>
                        </div>

                        {/* Summary Details */}
                        <div className="glass-card p-6 rounded-2xl">
                            <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-4">Summary Calculation</h4>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                                    <span className="text-gray-500">Opening Float</span>
                                    <span className="font-mono font-bold">Rs. {balanceData.opening.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                                    <span className="text-gray-500">Total Sales (Cash)</span>
                                    <span className="font-mono text-emerald-600">+ Rs. {balanceData.sales.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                                    <span className="text-gray-500">Total Buying (Cash)</span>
                                    <span className="font-mono text-red-500">- Rs. {balanceData.buying.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                                    <span className="text-gray-500">Total Expenses (Cash)</span>
                                    <span className="font-mono text-orange-500">- Rs. {balanceData.expenses.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between pt-2">
                                    <span className="font-bold text-gray-800 dark:text-white">Expected Cash Balance</span>
                                    <span className="font-mono font-black text-lg">Rs. {balanceData.balance.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
