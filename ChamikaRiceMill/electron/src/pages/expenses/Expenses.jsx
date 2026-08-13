import React, { useState, useEffect, useMemo } from 'react';
import {
    Table, Button, Input, Form, Modal, Tag, Select, Card, Row, Col,
    InputNumber, DatePicker, Tabs, Space, Divider, Typography, Drawer, message
} from 'antd';
import {
    PlusOutlined, SearchOutlined, DollarOutlined, EyeOutlined,
    FileTextOutlined, CalculatorOutlined, HistoryOutlined, DeleteOutlined, EditOutlined,
    CheckCircleOutlined, CarOutlined, InboxOutlined, FireOutlined, AppstoreOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

const { Option } = Select;

const LOCAL_STORAGE_RATES_KEY = 'chamika_expenses_calculator_rates_electron_v1';

const defaultRateState = {
    lorryLoadUpRate: 0.40,     // Rs / kg for loading lorry
    lorryLoadDownRate: 0.35,   // Rs / kg for unloading lorry
    dryerLoadUpRate: 0.30,     // Rs / kg for loading into dryer
    dryerLoadDownRate: 0.25,   // Rs / kg for unloading out of dryer
    fuelRatePerLiter: 370,     // Rs / Liter
};

export default function Expenses() {
    const [activeTab, setActiveTab] = useState('log');
    const [loading, setLoading] = useState(false);
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [staffList, setStaffList] = useState([]);

    // Filter states
    const [searchText, setSearchText] = useState('');
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
    const [dateRange, setDateRange] = useState(null);

    // Create / Edit Expense Modal/Drawer
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Calculator Saved Rates (Persisted in localStorage)
    const [rates, setRates] = useState(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_RATES_KEY);
            return saved ? JSON.parse(saved) : defaultRateState;
        } catch {
            return defaultRateState;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(rates));
        } catch (e) {
            console.error('Failed to save calculator rates:', e);
        }
    }, [rates]);

    const updateRate = (field, val) => {
        setRates(prev => ({ ...prev, [field]: val === null || val === undefined ? 0 : val }));
    };

    // ─── DRIVER TRIP CALCULATOR STATE ──────────────────────────────
    const [tripCalc, setTripCalc] = useState({
        driverName: '',
        tripFee: 2500,
        fuelLiters: 20,
        extraCost: 500,
        notes: 'Delivery trip allowance & fuel'
    });

    // ─── LORRY HANDLING CALCULATOR STATE ───────────────────────────
    const [lorryCalc, setLorryCalc] = useState({
        weightKg: 10000,
        paidTo: 'Lorry Loading Crew',
        notes: 'Paddy / Rice lorry handling'
    });

    // ─── DRYER HANDLING CALCULATOR STATE ───────────────────────────
    const [dryerCalc, setDryerCalc] = useState({
        weightKg: 10000,
        paidTo: 'Dryer Machine Operations Crew',
        notes: 'Wet Paddy Dryer loading and unloading'
    });

    // Category Modal State
    const [catModalVisible, setCatModalVisible] = useState(false);
    const [newCatName, setNewCatName] = useState('');

    const [form] = Form.useForm();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [expList, catList, stfList] = await Promise.all([
                db.expenses.orderBy('DATE').reverse().toArray().catch(() => []),
                db.expense_categories.toArray().catch(() => []),
                db.staff.toArray().catch(() => [])
            ]);

            const defaultCats = [
                { CATEGORY_ID: 1, NAME: 'Driver Trip & Fuel' },
                { CATEGORY_ID: 2, NAME: 'Lorry Handling (Load Up/Down)' },
                { CATEGORY_ID: 3, NAME: 'Dryer Labor (Load Up/Down)' },
                { CATEGORY_ID: 4, NAME: 'Fuel & Transportation' },
                { CATEGORY_ID: 5, NAME: 'Electricity & Utilities' },
                { CATEGORY_ID: 6, NAME: 'Machinery Maintenance' },
                { CATEGORY_ID: 7, NAME: 'Office & Supplies' },
                { CATEGORY_ID: 8, NAME: 'Miscellaneous' }
            ];

            setExpenses(expList || []);
            setCategories(catList.length > 0 ? catList : defaultCats);
            setStaffList(stfList || []);
        } catch (e) {
            console.error('Error loading expenses offline data:', e);
        } finally {
            setLoading(false);
        }
    };

    // Filter staff list for mill registered roles ONLY: officers, drivers, and laborers
    const millStaffList = useMemo(() => {
        return (staffList || []).filter(s => {
            const r = String(s.ROLE || s.role || '').toLowerCase();
            const isActive = s.IS_ACTIVE !== 0 && s.is_active !== 0;
            return isActive && (r === 'officer' || r === 'driver' || r === 'labor' || r === 'labour' || r === 'worker' || r === 'operator');
        });
    }, [staffList]);

    const driversList = useMemo(() => {
        const list = millStaffList.filter(s => {
            const r = String(s.ROLE || s.role || '').toLowerCase();
            return r === 'driver' || r === 'officer';
        });
        return list.length > 0 ? list : millStaffList;
    }, [millStaffList]);

    const laborList = useMemo(() => {
        const list = millStaffList.filter(s => {
            const r = String(s.ROLE || s.role || '').toLowerCase();
            return r === 'labor' || r === 'labour' || r === 'worker' || r === 'operator' || r === 'officer';
        });
        return list.length > 0 ? list : millStaffList;
    }, [millStaffList]);

    // Filtered Expenses List
    const filteredExpenses = useMemo(() => {
        let list = expenses;
        if (searchText) {
            const s = searchText.toLowerCase().trim();
            list = list.filter(e =>
                (e.EXPENSE_NO && e.EXPENSE_NO.toLowerCase().includes(s)) ||
                (e.CATEGORY_NAME && e.CATEGORY_NAME.toLowerCase().includes(s)) ||
                (e.PAID_TO && e.PAID_TO.toLowerCase().includes(s)) ||
                (e.NOTES && e.NOTES.toLowerCase().includes(s))
            );
        }
        if (selectedCategoryFilter && selectedCategoryFilter !== 'ALL') {
            list = list.filter(e => e.CATEGORY_NAME === selectedCategoryFilter);
        }
        if (dateRange && dateRange[0] && dateRange[1]) {
            list = list.filter(e => {
                const expDate = dayjs(e.DATE);
                return expDate.isAfter(dateRange[0].startOf('day')) && expDate.isBefore(dateRange[1].endOf('day'));
            });
        }
        return list;
    }, [expenses, searchText, selectedCategoryFilter, dateRange]);

    // KPI Metrics
    const totalMonthExpenses = useMemo(() => {
        const startOfMonth = dayjs().startOf('month');
        return expenses
            .filter(e => dayjs(e.DATE).isAfter(startOfMonth))
            .reduce((s, e) => s + parseFloat(e.AMOUNT || 0), 0);
    }, [expenses]);

    const totalTripExpenses = useMemo(() => {
        return expenses
            .filter(e => (e.CATEGORY_NAME || '').toLowerCase().includes('driver') || (e.CATEGORY_NAME || '').toLowerCase().includes('trip'))
            .reduce((s, e) => s + parseFloat(e.AMOUNT || 0), 0);
    }, [expenses]);

    const totalHandlingExpenses = useMemo(() => {
        return expenses
            .filter(e => (e.CATEGORY_NAME || '').toLowerCase().includes('handling') || (e.CATEGORY_NAME || '').toLowerCase().includes('dryer') || (e.CATEGORY_NAME || '').toLowerCase().includes('labor'))
            .reduce((s, e) => s + parseFloat(e.AMOUNT || 0), 0);
    }, [expenses]);

    // ─── CALCULATOR CALCULATIONS ───────────────────────────────────
    const tripFuelCost = (parseFloat(tripCalc.fuelLiters || 0)) * (parseFloat(rates.fuelRatePerLiter || 0));
    const tripTotalCost = (parseFloat(tripCalc.tripFee || 0)) + tripFuelCost + (parseFloat(tripCalc.extraCost || 0));

    const lorryTotalCost = (parseFloat(lorryCalc.weightKg || 0)) * ((parseFloat(rates.lorryLoadUpRate || 0)) + (parseFloat(rates.lorryLoadDownRate || 0)));
    const dryerTotalCost = (parseFloat(dryerCalc.weightKg || 0)) * ((parseFloat(rates.dryerLoadUpRate || 0)) + (parseFloat(rates.dryerLoadDownRate || 0)));

    // Save Expense Direct Handler
    const handleSaveCalculatedExpense = async (categoryName, amount, paidTo, notesData) => {
        try {
            const terminalCode = getTerminalDeviceCode();
            const expNo = `EXP-${dayjs().format('YYYYMMDD')}-${terminalCode}-${Date.now().toString().slice(-4)}`;
            const payload = {
                EXPENSE_NO: expNo,
                DEVICE_ID: terminalCode,
                ADDED_BY: getCurrentUserName(),
                CATEGORY_NAME: categoryName,
                AMOUNT: amount,
                PAYMENT_METHOD: 'cash',
                PAID_TO: paidTo || null,
                DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                NOTES: notesData,
                IS_SYNCED: 0
            };

            await db.expenses.add(payload);
            message.success(`Recorded Expense #${expNo} (Rs. ${amount.toFixed(2)})!`);
            loadData();
            setActiveTab('log');

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error saving calculated expense in Dexie:', e);
            message.error('Failed to record expense');
        }
    };

    const handleOpenAdd = () => {
        setEditingExpense(null);
        form.resetFields();
        form.setFieldsValue({
            PAYMENT_METHOD: 'cash',
            DATE: dayjs()
        });
        setDrawerVisible(true);
    };

    const handleOpenEdit = (record) => {
        setEditingExpense(record);
        form.setFieldsValue({
            CATEGORY_NAME: record.CATEGORY_NAME,
            AMOUNT: record.AMOUNT,
            PAYMENT_METHOD: record.PAYMENT_METHOD || 'cash',
            PAID_TO: record.PAID_TO || null,
            REF_NO: record.REF_NO || null,
            DATE: record.DATE ? dayjs(record.DATE) : dayjs(),
            NOTES: record.NOTES || null
        });
        setDrawerVisible(true);
    };

    const handleFormSubmit = async (values) => {
        setSubmitting(true);
        try {
            const terminalCode = getTerminalDeviceCode();
            if (editingExpense) {
                const targetLocalId = editingExpense.LOCAL_ID || editingExpense.id;
                if (targetLocalId) {
                    await db.expenses.update(targetLocalId, {
                        CATEGORY_NAME: values.CATEGORY_NAME,
                        AMOUNT: values.AMOUNT,
                        PAYMENT_METHOD: values.PAYMENT_METHOD || 'cash',
                        PAID_TO: values.PAID_TO || null,
                        REF_NO: values.REF_NO || null,
                        DATE: values.DATE ? values.DATE.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
                        NOTES: values.NOTES || null,
                        IS_SYNCED: 0
                    });
                } else if (editingExpense.EXPENSE_ID) {
                    const existing = await db.expenses.where('EXPENSE_ID').equals(editingExpense.EXPENSE_ID).first();
                    if (existing) {
                        await db.expenses.update(existing.LOCAL_ID, {
                            CATEGORY_NAME: values.CATEGORY_NAME,
                            AMOUNT: values.AMOUNT,
                            PAYMENT_METHOD: values.PAYMENT_METHOD || 'cash',
                            PAID_TO: values.PAID_TO || null,
                            REF_NO: values.REF_NO || null,
                            DATE: values.DATE ? values.DATE.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
                            NOTES: values.NOTES || null,
                            IS_SYNCED: 0
                        });
                    }
                }

                if (editingExpense.EXPENSE_ID && syncService.isOnline) {
                    try {
                        const baseUrl = syncService.apiBase || 'http://localhost:3001';
                        await axios.put(`${baseUrl}/api/mill/expenses/${editingExpense.EXPENSE_ID}`, {
                            CATEGORY_NAME: values.CATEGORY_NAME,
                            AMOUNT: values.AMOUNT,
                            PAYMENT_METHOD: values.PAYMENT_METHOD || 'cash',
                            PAID_TO: values.PAID_TO || null,
                            REF_NO: values.REF_NO || null,
                            DATE: values.DATE ? values.DATE.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
                            NOTES: values.NOTES || null
                        }, { timeout: 5000 });
                    } catch (err) {
                        console.warn('[OfflineFirst] Expense edit sync warning:', err);
                    }
                }

                message.success('Expense record updated!');
            } else {
                const expNo = `EXP-${dayjs().format('YYYYMMDD')}-${terminalCode}-${Date.now().toString().slice(-4)}`;
                const payload = {
                    EXPENSE_NO: expNo,
                    DEVICE_ID: terminalCode,
                    ADDED_BY: getCurrentUserName(),
                    CATEGORY_NAME: values.CATEGORY_NAME,
                    AMOUNT: values.AMOUNT,
                    PAYMENT_METHOD: values.PAYMENT_METHOD || 'cash',
                    PAID_TO: values.PAID_TO || null,
                    REF_NO: values.REF_NO || null,
                    DATE: values.DATE ? values.DATE.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
                    NOTES: values.NOTES || null,
                    IS_SYNCED: 0
                };

                await db.expenses.add(payload);
                message.success(`Recorded Expense #${expNo}!`);
            }

            setDrawerVisible(false);
            setEditingExpense(null);
            form.resetFields();
            loadData();

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error(e);
            message.error('Error saving expense');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteExpense = async (id) => {
        Modal.confirm({
            title: 'Delete Expense Record?',
            content: 'Are you sure you want to delete this expense record?',
            okText: 'Yes, Delete',
            okType: 'danger',
            onOk: async () => {
                try {
                    await db.expenses.delete(id);
                    message.success('Expense record deleted');
                    loadData();
                } catch (e) {
                    message.error('Failed to delete expense');
                }
            }
        });
    };

    const handleAddCategory = async () => {
        if (!newCatName.trim()) {
            message.warning('Please enter category name');
            return;
        }
        try {
            const payload = { CATEGORY_ID: Date.now(), NAME: newCatName.trim(), IS_ACTIVE: 1 };
            await db.expense_categories.add(payload);
            message.success('Category added successfully!');
            setNewCatName('');
            setCatModalVisible(false);
            loadData();
        } catch (e) {
            message.error('Failed to add category');
        }
    };

    const columns = [
        {
            title: 'Expense No',
            dataIndex: 'EXPENSE_NO',
            key: 'EXPENSE_NO',
            render: t => <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{t}</span>
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            render: d => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '-'
        },
        {
            title: 'Category',
            dataIndex: 'CATEGORY_NAME',
            key: 'CATEGORY_NAME',
            render: c => <Tag color="blue" className="font-bold">{c}</Tag>
        },
        {
            title: 'Amount (Rs.)',
            dataIndex: 'AMOUNT',
            key: 'AMOUNT',
            align: 'right',
            render: a => <strong className="font-mono text-rose-600 dark:text-rose-400 text-base">Rs. {parseFloat(a || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
        },
        {
            title: 'Paid To / Staff',
            dataIndex: 'PAID_TO',
            key: 'PAID_TO',
            render: p => p || <span className="text-slate-400 text-xs">—</span>
        },
        {
            title: 'Method',
            dataIndex: 'PAYMENT_METHOD',
            key: 'PAYMENT_METHOD',
            render: m => <Tag color={m === 'cash' ? 'green' : 'purple'} className="uppercase font-bold">{m || 'CASH'}</Tag>
        },
        {
            title: 'Notes / Math',
            dataIndex: 'NOTES',
            key: 'NOTES',
            render: n => <span className="text-xs text-slate-500 max-w-xs block truncate">{n || '—'}</span>
        },
        {
            title: 'Action',
            key: 'action',
            align: 'center',
            render: (_, r) => (
                <Space>
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleOpenEdit(r)} className="!text-amber-500 hover:!text-amber-400" />
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => handleDeleteExpense(r.LOCAL_ID || r.EXPENSE_ID)} />
                </Space>
            )
        }
    ];

    const tabItems = [
        {
            key: 'log',
            label: (
                <span className="font-bold text-base flex items-center gap-2">
                    <DollarOutlined className="text-rose-600" /> Expense Records ({filteredExpenses.length})
                </span>
            ),
            children: (
                <div className="space-y-4">
                    {/* KPI Highlights */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card className="shadow-sm border-l-4 border-l-rose-600">
                            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Monthly Expenses</div>
                            <div className="text-2xl font-black text-rose-600 mt-1">Rs. {totalMonthExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            <div className="text-[11px] text-slate-400 mt-1">Current Month Recorded Output</div>
                        </Card>
                        <Card className="shadow-sm border-l-4 border-l-blue-600">
                            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Driver & Trip Expenses</div>
                            <div className="text-2xl font-black text-blue-600 mt-1">Rs. {totalTripExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            <div className="text-[11px] text-slate-400 mt-1">Delivery Allowances & Fuel</div>
                        </Card>
                        <Card className="shadow-sm border-l-4 border-l-amber-600">
                            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Labor & Handling Charges</div>
                            <div className="text-2xl font-black text-amber-600 mt-1">Rs. {totalHandlingExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            <div className="text-[11px] text-slate-400 mt-1">Lorry & Dryer Handling per KG</div>
                        </Card>
                    </div>

                    {/* Filter Bar */}
                    <Card className="shadow-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Input
                                placeholder="Search Expense #, Category, Staff, Notes…"
                                prefix={<SearchOutlined className="text-slate-400" />}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                allowClear
                            />
                            <DatePicker.RangePicker
                                format="DD/MM/YYYY"
                                value={dateRange}
                                onChange={v => setDateRange(v)}
                                className="w-full"
                            />
                            <div className="flex gap-2">
                                <Select value={selectedCategoryFilter} onChange={v => setSelectedCategoryFilter(v)} className="w-full">
                                    <Option value="ALL">All Categories</Option>
                                    {categories.map(c => (
                                        <Option key={c.CATEGORY_ID || c.NAME} value={c.NAME}>{c.NAME}</Option>
                                    ))}
                                </Select>
                                <Button onClick={() => { setSearchText(''); setDateRange(null); setSelectedCategoryFilter('ALL'); }}>Reset</Button>
                            </div>
                        </div>
                    </Card>

                    {/* Expenses Table */}
                    <Card className="shadow-sm">
                        <Table
                            columns={columns}
                            dataSource={filteredExpenses}
                            rowKey={r => r.LOCAL_ID || r.EXPENSE_ID}
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            size="middle"
                        />
                    </Card>
                </div>
            )
        },
        {
            key: 'calculators',
            label: (
                <span className="font-bold text-base flex items-center gap-2">
                    <CalculatorOutlined className="text-blue-600" /> Salary & Handling Calculators
                </span>
            ),
            children: (
                <div className="space-y-6">
                    {/* Section 1: Driver Trip Fee & Fuel Calculator */}
                    <Card title={<span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2"><CarOutlined /> 1. Driver Delivery Trip & Fuel Calculator</span>} className="shadow-sm">
                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Driver / Staff Name</label>
                                <Select
                                    showSearch
                                    size="large"
                                    placeholder="Select driver or type name"
                                    value={tripCalc.driverName || undefined}
                                    onChange={v => setTripCalc(prev => ({ ...prev, driverName: v }))}
                                    className="w-full"
                                >
                                    {driversList.map(s => (
                                        <Option key={s.STAFF_ID || s.USERNAME} value={s.NAME}>
                                            {String(s.ROLE || '').toLowerCase() === 'driver' ? '🚛' : '👔'} {s.NAME} ({s.ROLE || 'Driver'})
                                        </Option>
                                    ))}
                                </Select>
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Fixed Trip Fee / Allowance (Rs.)</label>
                                <InputNumber prefix="Rs." size="large" className="w-full" min={0} value={tripCalc.tripFee} onChange={v => setTripCalc(prev => ({ ...prev, tripFee: v || 0 }))} />
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Fuel Liters Filled</label>
                                <InputNumber suffix="L" size="large" className="w-full" min={0} value={tripCalc.fuelLiters} onChange={v => setTripCalc(prev => ({ ...prev, fuelLiters: v || 0 }))} />
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Fuel Rate per Liter (Rs.)</label>
                                <InputNumber prefix="Rs." size="large" className="w-full" min={0} value={rates.fuelRatePerLiter} onChange={v => updateRate('fuelRatePerLiter', v)} />
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Extra Incidentals / Food / Repairs (Rs.)</label>
                                <InputNumber prefix="Rs." size="large" className="w-full" min={0} value={tripCalc.extraCost} onChange={v => setTripCalc(prev => ({ ...prev, extraCost: v || 0 }))} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Calculated Total Trip Cost</label>
                                <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 text-lg font-black text-blue-600 font-mono">
                                    Rs. {tripTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                            </Col>
                        </Row>
                        <div className="mt-4 flex justify-end">
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={() => handleSaveCalculatedExpense(
                                    'Driver Trip & Fuel',
                                    tripTotalCost,
                                    tripCalc.driverName || 'Driver',
                                    `Trip Fee: Rs.${tripCalc.tripFee} + Fuel (${tripCalc.fuelLiters}L @ Rs.${rates.fuelRatePerLiter}): Rs.${tripFuelCost} + Extra: Rs.${tripCalc.extraCost}`
                                )}
                                className="!bg-blue-600 font-bold"
                            >
                                Save as Driver Trip Expense Record
                            </Button>
                        </div>
                    </Card>

                    {/* Section 2: Lorry Labor Handling Calculator (Rate per KG) */}
                    <Card title={<span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2"><InboxOutlined /> 2. Lorry Labor Handling Calculator (Load Up & Down Rate/KG)</span>} className="shadow-sm">
                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Paddy / Rice Total Weight (KG)</label>
                                <InputNumber suffix="KG" size="large" className="w-full" min={1} value={lorryCalc.weightKg} onChange={v => setLorryCalc(prev => ({ ...prev, weightKg: v || 0 }))} />
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Load UP (Lorry Loading Rate Rs / KG)</label>
                                <InputNumber prefix="Rs." step={0.05} size="large" className="w-full" value={rates.lorryLoadUpRate} onChange={v => updateRate('lorryLoadUpRate', v)} />
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Load DOWN (Lorry Unloading Rate Rs / KG)</label>
                                <InputNumber prefix="Rs." step={0.05} size="large" className="w-full" value={rates.lorryLoadDownRate} onChange={v => updateRate('lorryLoadDownRate', v)} />
                            </Col>
                            <Col xs={24} sm={16}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Paid To / Labor Leader</label>
                                <Select
                                    showSearch
                                    size="large"
                                    placeholder="Select staff member or type crew name"
                                    value={lorryCalc.paidTo || undefined}
                                    onChange={v => setLorryCalc(prev => ({ ...prev, paidTo: v }))}
                                    onSearch={v => setLorryCalc(prev => ({ ...prev, paidTo: v }))}
                                    className="w-full"
                                >
                                    {laborList.map(s => (
                                        <Option key={s.STAFF_ID || s.USERNAME} value={s.NAME}>
                                            👷 {s.NAME} ({s.ROLE || 'Labor Leader'})
                                        </Option>
                                    ))}
                                </Select>
                            </Col>
                            <Col xs={24} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Calculated Lorry Handling Fee</label>
                                <div className="p-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 text-lg font-black text-amber-600 font-mono">
                                    Rs. {lorryTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                            </Col>
                        </Row>
                        <div className="mt-4 flex justify-end">
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={() => handleSaveCalculatedExpense(
                                    'Lorry Handling (Load Up/Down)',
                                    lorryTotalCost,
                                    lorryCalc.paidTo || 'Labor Crew',
                                    `Weight: ${lorryCalc.weightKg}kg × (Load UP Rs.${rates.lorryLoadUpRate} + Load DOWN Rs.${rates.lorryLoadDownRate}) = Rs.${lorryTotalCost}`
                                )}
                                className="!bg-amber-600 font-bold border-0"
                            >
                                Save as Lorry Handling Expense Record
                            </Button>
                        </div>
                    </Card>

                    {/* Section 3: Dryer Labor Handling Calculator (Rate per KG) */}
                    <Card title={<span className="font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2"><FireOutlined /> 3. Dryer Machine Labor Handling Calculator (Load Up & Down Rate/KG)</span>} className="shadow-sm">
                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Wet Paddy Weight for Dryer (KG)</label>
                                <InputNumber suffix="KG" size="large" className="w-full" min={1} value={dryerCalc.weightKg} onChange={v => setDryerCalc(prev => ({ ...prev, weightKg: v || 0 }))} />
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Dryer Load UP (Loading Rate Rs / KG)</label>
                                <InputNumber prefix="Rs." step={0.05} size="large" className="w-full" value={rates.dryerLoadUpRate} onChange={v => updateRate('dryerLoadUpRate', v)} />
                            </Col>
                            <Col xs={12} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Dryer Load DOWN (Unloading Rate Rs / KG)</label>
                                <InputNumber prefix="Rs." step={0.05} size="large" className="w-full" value={rates.dryerLoadDownRate} onChange={v => updateRate('dryerLoadDownRate', v)} />
                            </Col>
                            <Col xs={24} sm={16}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Paid To / Dryer Operator</label>
                                <Select
                                    showSearch
                                    size="large"
                                    placeholder="Select staff member or type operator name"
                                    value={dryerCalc.paidTo || undefined}
                                    onChange={v => setDryerCalc(prev => ({ ...prev, paidTo: v }))}
                                    onSearch={v => setDryerCalc(prev => ({ ...prev, paidTo: v }))}
                                    className="w-full"
                                >
                                    {laborList.map(s => (
                                        <Option key={s.STAFF_ID || s.USERNAME} value={s.NAME}>
                                            🔥 {s.NAME} ({s.ROLE || 'Dryer Operator'})
                                        </Option>
                                    ))}
                                </Select>
                            </Col>
                            <Col xs={24} sm={8}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Calculated Dryer Handling Fee</label>
                                <div className="p-2 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 text-lg font-black text-purple-600 font-mono">
                                    Rs. {dryerTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                            </Col>
                        </Row>
                        <div className="mt-4 flex justify-end">
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={() => handleSaveCalculatedExpense(
                                    'Dryer Labor (Load Up/Down)',
                                    dryerTotalCost,
                                    dryerCalc.paidTo || 'Dryer Crew',
                                    `Weight: ${dryerCalc.weightKg}kg × (Dryer UP Rs.${rates.dryerLoadUpRate} + Dryer DOWN Rs.${rates.dryerLoadDownRate}) = Rs.${dryerTotalCost}`
                                )}
                                className="!bg-purple-600 font-bold border-0"
                            >
                                Save as Dryer Handling Expense Record
                            </Button>
                        </div>
                    </Card>
                </div>
            )
        },
        {
            key: 'categories',
            label: (
                <span className="font-bold text-base flex items-center gap-2">
                    <AppstoreOutlined className="text-purple-600" /> Expense Categories ({categories.length})
                </span>
            ),
            children: (
                <Card title="Manage Expense Categories" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCatModalVisible(true)}>Add Category</Button>} className="shadow-sm">
                    <Table
                        dataSource={categories}
                        rowKey="CATEGORY_ID"
                        pagination={false}
                        size="middle"
                        columns={[
                            { title: '#', width: 40, render: (_, __, i) => i + 1 },
                            { title: 'Category Name', dataIndex: 'NAME', render: n => <strong className="text-slate-800 dark:text-slate-200">{n}</strong> },
                            { title: 'Description', dataIndex: 'DESCRIPTION', render: d => d || 'Standard Operational Category' },
                            { title: 'Status', dataIndex: 'IS_ACTIVE', align: 'center', render: s => <Tag color="green">Active</Tag> }
                        ]}
                    />
                </Card>
            )
        }
    ];

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 m-0 flex items-center gap-2">
                        <DollarOutlined className="text-rose-600 dark:text-rose-400" /> Expenses & Handling / Trip Calculator
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                        Record mill expenses, manage categories, and calculate driver allowances & per-kg handling fees
                    </p>
                </div>
                <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleOpenAdd} className="!bg-rose-600 font-bold border-0 shadow">
                    Record New Expense
                </Button>
            </div>

            {/* Main Tabs */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="large"
            />

            {/* Record Expense Drawer */}
            <Drawer
                title={<span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><DollarOutlined className="text-rose-600" /> {editingExpense ? 'Edit Expense Record' : 'Record New Expense'}</span>}
                width={500}
                open={drawerVisible}
                onClose={() => setDrawerVisible(false)}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleFormSubmit}>
                    <Form.Item label="Expense Category" name="CATEGORY_NAME" rules={[{ required: true, message: 'Please select category' }]}>
                        <Select size="large" placeholder="Select category">
                            {categories.map(c => (
                                <Option key={c.CATEGORY_ID || c.NAME} value={c.NAME}>{c.NAME}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="Expense Amount (Rs.)" name="AMOUNT" rules={[{ required: true, message: 'Please enter amount' }]}>
                        <InputNumber prefix="Rs." size="large" className="w-full font-mono font-bold text-rose-600 text-lg" min={0.01} step={1} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="Payment Method" name="PAYMENT_METHOD" rules={[{ required: true }]}>
                                <Select size="large">
                                    <Option value="cash">💵 Cash</Option>
                                    <Option value="bank_transfer">🏦 Bank Transfer</Option>
                                    <Option value="cheque">📜 Cheque</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="Expense Date" name="DATE" rules={[{ required: true }]}>
                                <DatePicker format="DD/MM/YYYY" className="w-full" size="large" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item label="Paid To / Vendor / Staff" name="PAID_TO">
                        <Select
                            showSearch
                            size="large"
                            placeholder="Select staff member or type vendor name"
                            className="w-full"
                            allowClear
                        >
                            {millStaffList.map(s => (
                                <Option key={s.STAFF_ID || s.USERNAME} value={s.NAME}>
                                    👤 {s.NAME} ({s.ROLE || 'Staff'})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="Reference / Receipt No." name="REF_NO">
                        <Input size="large" placeholder="Receipt or invoice reference #" />
                    </Form.Item>

                    <Form.Item label="Notes & Breakdown" name="NOTES">
                        <Input.TextArea rows={3} placeholder="Add details or itemized breakdown notes…" />
                    </Form.Item>

                    <div className="flex justify-end gap-2 mt-6">
                        <Button onClick={() => setDrawerVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting} className="!bg-rose-600 font-bold">
                            Save Expense Record
                        </Button>
                    </div>
                </Form>
            </Drawer>

            {/* Add Category Modal */}
            <Modal
                title="Add Expense Category"
                open={catModalVisible}
                onCancel={() => setCatModalVisible(false)}
                onOk={handleAddCategory}
                okText="Save Category"
            >
                <div className="space-y-3 py-2">
                    <div>
                        <label className="block text-xs font-bold mb-1">Category Name</label>
                        <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Generator Fuel, Machine Repair" />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
