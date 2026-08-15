import React, { useState, useEffect } from 'react';
import { Tabs, Table, Button, Input, App, Form, Drawer, Select, InputNumber, DatePicker, Tag, Popconfirm, Descriptions, Modal, Radio } from 'antd';
import { SearchOutlined, PlusOutlined, DeleteOutlined, EyeOutlined, ImportOutlined, ShopOutlined, TruckOutlined, SwapOutlined, EditOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import dayjs from 'dayjs';
import { 
    toSLTime, toSLDate, toSLDateDisplay, getSLToday, getSLNow, 
    formatNumber, formatCurrency, canModify, formatSLDateTime 
} from '../../utils/helpers';

const typeLabels = { store_transfer: 'Store Transfer', mill_purchase: 'Mill Purchase', go_and_get: 'Go & Get' };
const typeColors = { store_transfer: 'blue', mill_purchase: 'purple', go_and_get: 'cyan' };
const typeIcons = { store_transfer: <SwapOutlined />, mill_purchase: <ShopOutlined />, go_and_get: <TruckOutlined /> };

// Priority sorter for Stock Inward: Raw Paddy & Seasonal Items first
const sortInwardItems = (itemList) => {
    return [...itemList].sort((a, b) => {
        const priorityOrder = {
            'RAW_WEE_AMU': 1,
            'RAW_WEE_DRY': 2,
            'OUT_SAMBA': 3,
            'OUT_NADU': 4,
            'OUT_HAL': 5,
            'OUT_KUDU': 6,
            'OUT_HUNSAL': 7
        };
        const pA = priorityOrder[a.SYSTEM_CODE] || 10;
        const pB = priorityOrder[b.SYSTEM_CODE] || 10;
        return pA - pB;
    });
};

export default function StockInward() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState(null);
    const [selectedItemFilter, setSelectedItemFilter] = useState('ALL');
    const [selectedPlaceFilter, setSelectedPlaceFilter] = useState('ALL');

    // Reference data
    const [items, setItems] = useState([]);
    const [places, setPlaces] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    // Pending transfers state
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);

    // Form state
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerType, setDrawerType] = useState('mill_purchase');
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const selectedItemId = Form.useWatch('ITEM_ID', form);
    const inwardQty = Form.useWatch('QUANTITY', form) || 0;
    const moistureLoss = Form.useWatch('MOISTURE_LOSS_PERCENT', form) || 0;
    const conditionVal = Form.useWatch('CONDITION', form);
    const selectedItem = items.find(i => i.ITEM_ID === selectedItemId);
    const isAmuWee = selectedItem?.SYSTEM_CODE === 'RAW_WEE_AMU';

    const handleMoistureChange = (percent) => {
        if (!inwardQty || !percent) return;
        const dryWeight = inwardQty * (1 - (percent / 100));
        form.setFieldValue('DRY_WEIGHT_ESTIMATE', parseFloat(dryWeight.toFixed(2)));
    };

    const handleDryWeightChange = (dryWeight) => {
        if (!inwardQty || !dryWeight) return;
        const percent = ((inwardQty - dryWeight) / inwardQty) * 100;
        form.setFieldValue('MOISTURE_LOSS_PERCENT', parseFloat(percent.toFixed(2)));
    };
    
    const handleUnitPriceChange = (unitPrice) => {
        if (!inwardQty || !unitPrice) {
            form.setFieldValue('TOTAL_PRICE', null);
            return;
        }
        form.setFieldValue('TOTAL_PRICE', parseFloat((inwardQty * unitPrice).toFixed(2)));
    };

    const handleTotalPriceChange = (totalPrice) => {
        if (!inwardQty || !totalPrice) {
            form.setFieldValue('PRICE_PER_UNIT', null);
            return;
        }
        form.setFieldValue('PRICE_PER_UNIT', parseFloat((totalPrice / inwardQty).toFixed(2)));
    };
    
    // Calculate dry weight in real-time if not edited manually
    const realTimeDryWeight = inwardQty * (1 - (moistureLoss / 100));

    // View modal
    const [viewRecord, setViewRecord] = useState(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);

    const currentUser = JSON.parse(Cookies.get('millUser') || '{}');
    const userCanModify = canModify(currentUser.ROLE);

    // Fetch Data
    useEffect(() => {
        fetchAll();
        fetchReferenceData();
        fetchPendingTransfers();
    }, []);

    const fetchPendingTransfers = async () => {
        try {
            const res = await axios.get('/api/mill/inward/pending-transfers');
            if (res.data.success) {
                setPendingTransfers(res.data.result || []);
            }
        } catch (error) {
            console.error('Error fetching pending transfers:', error);
        }
    };

    const handleDeclineTransfer = (record) => {
        let reason = '';
        Modal.confirm({
            title: 'Decline Transfer Request',
            content: (
                <div className="mt-4">
                    <p>Are you sure you want to decline this transfer from Store {record.STORE_NO}?</p>
                    <Input.TextArea
                        rows={2}
                        placeholder="Optional reason for decline..."
                        onChange={(e) => { reason = e.target.value; }}
                    />
                </div>
            ),
            okText: 'Decline',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    const res = await axios.post('/api/stock-transfers/decline', {
                        transferId: record.STORE_TRANSFER_ID,
                        approvedBy: currentUser.ID,
                        approvedByName: currentUser.NAME,
                        comments: reason || 'Declined from Mill Web App'
                    });
                    if (res.data.success) {
                        message.success('Transfer request declined successfully');
                        fetchPendingTransfers();
                    } else {
                        message.error(res.data.message || 'Failed to decline request');
                    }
                } catch (error) {
                    message.error('An error occurred while declining');
                }
            }
        });
    };

    const fetchAll = async () => {
        setLoading(true);
        try {
            const res = await axios.post('/api/mill/inward/list', {});
            if (res.data.success) {
                setData(res.data.result || []);
                applyFilters(res.data.result || [], searchText, activeTab);
            }
        } catch (error) {
            console.error('Error fetching inward:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchReferenceData = async () => {
        try {
            const [itemsRes, placesRes, suppliersRes] = await Promise.all([
                axios.post('/api/MillgetAllItems'),
                axios.post('/api/mill/places'),
                axios.post('/api/MillgetAllCustomers').catch(() => ({ data: { result: [] } })),
            ]);
            if (itemsRes.data.success) setItems(itemsRes.data.result || []);
            if (placesRes.data.success) setPlaces(placesRes.data.result || []);
            if (suppliersRes.data?.result) setSuppliers(suppliersRes.data.result || []);
        } catch (error) {
            console.error('Error fetching reference data:', error);
        }
    };

    const applyFilters = (records, search, tab, dates, itemF, placeF) => {
        let filtered = records;
        const currentTab = tab !== undefined ? tab : activeTab;
        const currentSearch = search !== undefined ? search : searchText;
        const currentDates = dates !== undefined ? dates : dateRange;
        const currentItemF = itemF !== undefined ? itemF : selectedItemFilter;
        const currentPlaceF = placeF !== undefined ? placeF : selectedPlaceFilter;

        if (currentTab && currentTab !== 'all') {
            filtered = filtered.filter(r => r.INWARD_TYPE === currentTab);
        }
        if (currentItemF && currentItemF !== 'ALL') {
            filtered = filtered.filter(r => Number(r.ITEM_ID) === Number(currentItemF));
        }
        if (currentPlaceF && currentPlaceF !== 'ALL') {
            filtered = filtered.filter(r => Number(r.PLACE_ID) === Number(currentPlaceF));
        }
        if (currentDates && currentDates[0] && currentDates[1]) {
            filtered = filtered.filter(r => {
                const recDate = dayjs(r.DATE || r.CREATED_DATE);
                return recDate.isAfter(currentDates[0].startOf('day')) && recDate.isBefore(currentDates[1].endOf('day'));
            });
        }
        if (currentSearch) {
            const s = currentSearch.toLowerCase();
            filtered = filtered.filter(r =>
                (r.REFERENCE_NO && r.REFERENCE_NO.toLowerCase().includes(s)) ||
                (r.ITEM_NAME && r.ITEM_NAME.toLowerCase().includes(s)) ||
                (r.PLACE_NAME && r.PLACE_NAME.toLowerCase().includes(s)) ||
                (r.SUPPLIER_NAME && r.SUPPLIER_NAME.toLowerCase().includes(s)) ||
                (r.VEHICLE_NO && r.VEHICLE_NO.toLowerCase().includes(s)) ||
                (r.DRIVER_NAME && r.DRIVER_NAME.toLowerCase().includes(s))
            );
        }
        setFilteredData(filtered);
    };

    const handleTabChange = (key) => {
        setActiveTab(key);
        applyFilters(data, searchText, key, dateRange, selectedItemFilter, selectedPlaceFilter);
    };

    const handleSearch = (e) => {
        const val = e.target.value;
        setSearchText(val);
        applyFilters(data, val, activeTab, dateRange, selectedItemFilter, selectedPlaceFilter);
    };

    const handleDateRangeChange = (dates) => {
        setDateRange(dates);
        applyFilters(data, searchText, activeTab, dates, selectedItemFilter, selectedPlaceFilter);
    };

    const handleItemFilterChange = (val) => {
        setSelectedItemFilter(val);
        applyFilters(data, searchText, activeTab, dateRange, val, selectedPlaceFilter);
    };

    const handlePlaceFilterChange = (val) => {
        setSelectedPlaceFilter(val);
        applyFilters(data, searchText, activeTab, dateRange, selectedItemFilter, val);
    };

    const resetFilters = () => {
        setSearchText('');
        setDateRange(null);
        setSelectedItemFilter('ALL');
        setSelectedPlaceFilter('ALL');
        applyFilters(data, '', activeTab, null, 'ALL', 'ALL');
    };

    // ─── Add & Edit Drawer Handlers ───────────────────────────
    const openAddDrawer = (type, prefillRecord = null) => {
        setEditingRecord(null);
        setDrawerType(type);
        form.resetFields();
        form.setFieldValue('DATE', dayjs());
        form.setFieldValue('CONDITION', 'dry');
        form.setFieldValue('DRY_PERCENTAGE', 85);
        
        if (prefillRecord && type === 'store_transfer') {
            form.setFieldsValue({
                STORE_TRANSFER_ID: prefillRecord.STORE_TRANSFER_ID,
                STORE_NO: prefillRecord.STORE_NO,
                ITEM_ID: prefillRecord.MAPPED_MILL_ITEM_ID,
                GROSS_WEIGHT: prefillRecord.STORE_QUANTITY,
                QUANTITY: prefillRecord.STORE_QUANTITY,
                SOURCE_QUANTITY: prefillRecord.STORE_QUANTITY,
                STORE_TRANSFER_REF: prefillRecord.TRANSFER_CODE || `STR-${prefillRecord.STORE_TRANSFER_ID}`
            });
            setPendingDrawerOpen(false);
        }
        
        setDrawerOpen(true);
    };

    const openEditDrawer = (record) => {
        setEditingRecord(record);
        setDrawerType(record.INWARD_TYPE || 'mill_purchase');
        form.resetFields();
        const isWet = record.CONDITION === 'wet' || (record.MOISTURE_LOSS_PERCENT > 0);
        const dryPct = record.DRY_PERCENTAGE || (record.MOISTURE_LOSS_PERCENT ? (100 - record.MOISTURE_LOSS_PERCENT) : 85);

        form.setFieldsValue({
            ITEM_ID: record.ITEM_ID,
            CONDITION: isWet ? 'wet' : 'dry',
            GROSS_WEIGHT: record.GROSS_WEIGHT || record.QUANTITY,
            DRY_PERCENTAGE: dryPct,
            QUANTITY: record.QUANTITY,
            PLACE_ID: record.PLACE_ID,
            NO_OF_BAGS: record.NO_OF_BAGS,
            PRICE_PER_UNIT: record.PRICE_PER_UNIT,
            TOTAL_PRICE: record.TOTAL_PRICE,
            DATE: record.DATE ? dayjs(record.DATE) : dayjs(),
            VEHICLE_NO: record.VEHICLE_NO,
            DRIVER_NAME: record.DRIVER_NAME,
            SUPPLIER_ID: record.SUPPLIER_ID,
            NOTES: record.NOTES
        });
        setDrawerOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);

            const payload = {
                INWARD_TYPE: drawerType,
                ITEM_ID: values.ITEM_ID,
                PLACE_ID: values.PLACE_ID || null,
                QUANTITY: values.QUANTITY,
                SOURCE_QUANTITY: values.SOURCE_QUANTITY || null,
                PRICE_PER_UNIT: values.PRICE_PER_UNIT || null,
                TOTAL_PRICE: values.TOTAL_PRICE || null,
                NO_OF_BAGS: values.NO_OF_BAGS || null,
                CONDITION: values.CONDITION || 'dry',
                DRY_PERCENTAGE: values.CONDITION === 'wet' ? (values.DRY_PERCENTAGE || 85) : 100,
                GROSS_WEIGHT: values.GROSS_WEIGHT || values.QUANTITY,
                MOISTURE_LOSS_PERCENT: values.CONDITION === 'wet' ? (100 - (values.DRY_PERCENTAGE || 85)) : 0,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : getSLToday(),
                NOTES: values.NOTES || null,
                RECEIVED_BY: currentUser.NAME,
                CREATED_BY: currentUser.USER_ID,
            };

            // Type-specific fields
            if (drawerType === 'store_transfer') {
                payload.STORE_NO = values.STORE_NO || null;
                payload.STORE_TRANSFER_REF = values.STORE_TRANSFER_REF || null;
            } else if (drawerType === 'mill_purchase') {
                payload.SUPPLIER_ID = values.SUPPLIER_ID || null;
            } else if (drawerType === 'go_and_get') {
                payload.VEHICLE_NO = values.VEHICLE_NO || null;
                payload.DRIVER_NAME = values.DRIVER_NAME || null;
            }
            let apiUrl = '/api/mill/inward/add';
            if (editingRecord) {
                apiUrl = '/api/mill/inward/update';
                payload.INWARD_ID = editingRecord.INWARD_ID;
            } else if (drawerType === 'store_transfer' && values.STORE_TRANSFER_ID) {
                apiUrl = '/api/mill/inward/accept-transfer';
                payload.STORE_TRANSFER_ID = values.STORE_TRANSFER_ID;
                payload.MILL_QUANTITY = values.QUANTITY;
                payload.MILL_NO_OF_BAGS = values.NO_OF_BAGS || null;
                payload.STORE_QUANTITY = values.SOURCE_QUANTITY || null;
                payload.ACCEPTED_BY = currentUser.NAME;
            }

            const res = await axios.post(apiUrl, payload);
            if (res.data.success) {
                message.success(editingRecord ? 'Stock inward updated successfully' : `Stock inward recorded: ${res.data.referenceNo || 'Success'}`);
                setEditingRecord(null);
                setDrawerOpen(false);
                fetchAll();
                fetchPendingTransfers();
            } else {
                message.error(res.data.message || 'Failed to add record');
            }
        } catch (error) {
            console.error('Submit error:', error);
            message.error('Failed to save record');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (record) => {
        try {
            const res = await axios.post('/api/mill/inward/deactivate', { INWARD_ID: record.INWARD_ID });
            if (res.data.success) {
                message.success('Record deactivated & inventory reversed');
                fetchAll();
            }
        } catch {
            message.error('Error deactivating record');
        }
    };

    const handleView = (record) => {
        setViewRecord(record);
        setViewModalOpen(true);
    };

    // ─── Table Columns ──────────────────────────────────────
    const columns = [
        {
            title: 'Ref',
            dataIndex: 'REFERENCE_NO',
            key: 'REFERENCE_NO',
            width: 130,
            render: (text) => <span className="font-mono text-xs text-blue-500">{text}</span>,
        },
        {
            title: 'Type',
            dataIndex: 'INWARD_TYPE',
            key: 'INWARD_TYPE',
            width: 110,
            render: (type) => (
                <Tag color={typeColors[type]} icon={typeIcons[type]}>
                    {typeLabels[type] || type}
                </Tag>
            ),
        },
        {
            title: 'Item',
            key: 'ITEM',
            ellipsis: true,
            render: (_, r) => (
                <div>
                    <span className="font-medium">{r.ITEM_NAME || '-'}</span>
                    {r.PLACE_NAME && <span className="text-xs text-gray-400 ml-1">• {r.PLACE_NAME}</span>}
                </div>
            ),
        },
        {
            title: 'Qty (Mill)',
            dataIndex: 'QUANTITY',
            key: 'QUANTITY',
            width: 100,
            render: (val, r) => <span className="font-semibold">{formatNumber(val)} {r.ITEM_UNIT || 'kg'}</span>,
        },
        {
            title: 'Source Qty',
            dataIndex: 'SOURCE_QUANTITY',
            key: 'SOURCE_QUANTITY',
            width: 100,
            responsive: ['lg'],
            render: (val) => val ? formatNumber(val) : '-',
        },
        {
            title: 'Surplus/Waste',
            dataIndex: 'SURPLUS_WASTAGE',
            key: 'SURPLUS_WASTAGE',
            width: 110,
            responsive: ['lg'],
            render: (val) => {
                if (val === null || val === undefined) return '-';
                return <span className={val >= 0 ? 'text-green-500' : 'text-red-500'}>{val >= 0 ? '+' : ''}{formatNumber(val)}</span>;
            },
        },
        {
            title: 'Condition',
            key: 'CONDITION',
            width: 120,
            render: (_, r) => {
                const isWet = r.CONDITION === 'wet' || (r.MOISTURE_LOSS_PERCENT > 0);
                const pct = r.DRY_PERCENTAGE || (r.MOISTURE_LOSS_PERCENT ? (100 - r.MOISTURE_LOSS_PERCENT) : 100);
                return isWet ? (
                    <Tag color="blue" className="font-semibold">💧 Wet ({pct}%)</Tag>
                ) : (
                    <Tag color="gold" className="font-semibold">☀️ Dry</Tag>
                );
            },
        },
        {
            title: 'Price',
            dataIndex: 'TOTAL_PRICE',
            key: 'TOTAL_PRICE',
            width: 110,
            responsive: ['md'],
            render: (val) => val ? formatCurrency(val) : '-',
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            width: 110,
            render: val => val ? dayjs(val).format('YYYY-MM-DD') : '-'
        },
        {
            title: 'Created / Added By',
            key: 'CREATED_INFO',
            width: 150,
            render: (_, r) => {
                const { dateStr, timeStr, addedBy } = formatSLDateTime(r.CREATED_DATE || r.CREATED_AT || r.DATE, r);
                return (
                    <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">{dateStr}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{timeStr}</div>
                        {addedBy && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 mt-0.5">
                                <span>👤 {addedBy}</span>
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: '',
            key: 'actions',
            width: 110,
            render: (_, record) => (
                <div className="flex gap-1">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} className="!text-blue-500" />
                    {userCanModify && (
                        <>
                            <Button size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)} className="!text-amber-500" />
                            <Popconfirm title="Delete and reverse inventory?" onConfirm={() => handleDelete(record)} okText="Yes" cancelText="No">
                                <Button size="small" icon={<DeleteOutlined />} danger />
                            </Popconfirm>
                        </>
                    )}
                </div>
            ),
        },
    ];

    // ─── Tab Items ──────────────────────────────────────────
    const tabItems = [
        { key: 'all', label: 'All Records' },
        { key: 'store_transfer', label: '📦 Store Transfers' },
        { key: 'mill_purchase', label: '🏪 Mill Purchases' },
        { key: 'go_and_get', label: '🚛 Go & Get' },
    ];

    return (
        <div className="space-y-4">
            {/* Header Action Row */}
            <div className="w-full">
                <div className="grid grid-cols-2 md:flex md:flex-row items-center gap-3 w-full">
                    {userCanModify && (
                        <>
                            <Button 
                                type={pendingTransfers.length > 0 ? "primary" : "default"} 
                                danger={pendingTransfers.length > 0} 
                                onClick={() => setPendingDrawerOpen(true)}
                                className="rounded-xl h-10 font-medium text-xs sm:text-sm md:flex-1"
                            >
                                Pending ({pendingTransfers.length})
                            </Button>
                            <Button 
                                icon={<SwapOutlined />} 
                                onClick={() => openAddDrawer('store_transfer')}
                                className="rounded-xl h-10 text-xs sm:text-sm md:flex-1"
                            >
                                Transfer
                            </Button>
                            <Button 
                                icon={<ShopOutlined />} 
                                onClick={() => openAddDrawer('mill_purchase')}
                                className="rounded-xl h-10 text-xs sm:text-sm md:flex-1"
                            >
                                Purchase
                            </Button>
                            <Button 
                                type="primary" 
                                icon={<TruckOutlined />} 
                                onClick={() => openAddDrawer('go_and_get')}
                                className="rounded-xl h-10 text-xs sm:text-sm font-bold shadow-md md:flex-1"
                            >
                                Go & Get
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Advanced Filter Bar */}
            <div className="glass-card p-4 rounded-2xl mb-4 border border-blue-100 dark:border-gray-800 bg-white/50 dark:bg-zinc-900/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <Input
                        placeholder="Search Ref, Item, Place, Vehicle..."
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={handleSearch}
                        allowClear
                        className="rounded-xl h-10 w-full"
                    />
                    <Select
                        value={selectedItemFilter}
                        onChange={handleItemFilterChange}
                        className="w-full h-10"
                        options={[
                            { label: 'All Items', value: 'ALL' },
                            ...items
                                .filter(i => Number(i.IS_ACTIVE) !== 0)
                                .map(i => ({ label: i.NAME, value: i.ITEM_ID }))
                        ]}
                    />
                    <Select
                        value={selectedPlaceFilter}
                        onChange={handlePlaceFilterChange}
                        className="w-full h-10"
                        options={[
                            { label: 'All Places / Sources', value: 'ALL' },
                            ...places.map(p => ({ label: p.NAME, value: p.PLACE_ID }))
                        ]}
                    />
                    {/* Desktop RangePicker */}
                    <div className="hidden md:block">
                        <DatePicker.RangePicker
                            value={dateRange}
                            onChange={handleDateRangeChange}
                            className="w-full h-10 rounded-xl"
                        />
                    </div>
                    {/* Mobile Separate Start & End DatePickers */}
                    <div className="grid grid-cols-2 gap-2 md:hidden">
                        <DatePicker
                            placeholder="Start Date"
                            value={dateRange ? dateRange[0] : null}
                            onChange={(val) => handleDateRangeChange(val ? [val, dateRange ? dateRange[1] : null] : null)}
                            className="w-full h-10 rounded-xl text-xs"
                            format="YYYY-MM-DD"
                        />
                        <DatePicker
                            placeholder="End Date"
                            value={dateRange ? dateRange[1] : null}
                            onChange={(val) => handleDateRangeChange(val ? [dateRange ? dateRange[0] : null, val] : null)}
                            className="w-full h-10 rounded-xl text-xs"
                            format="YYYY-MM-DD"
                        />
                    </div>
                    <Button onClick={resetFilters} className="rounded-xl h-10 font-medium">
                        Reset Filters
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                items={tabItems}
                className="mb-4"
            />

            {/* Desktop Table View */}
            <div className="hidden md:block">
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    loading={loading}
                    rowKey="INWARD_ID"
                    pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} records` }}
                    scroll={{ x: 800 }}
                    size="small"
                />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredData.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No inward records found
                    </div>
                ) : (
                    filteredData.map((record) => (
                        <div 
                            key={record.INWARD_ID} 
                            onClick={() => handleView(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-mono font-bold text-blue-400 text-sm">{record.REFERENCE_NO}</div>
                                    <div className="text-xs text-gray-400 font-mono mt-0.5">{record.DATE ? dayjs(record.DATE).format('YYYY/MM/DD') : '-'}</div>
                                    <div className="text-xs text-gray-400 font-mono flex items-center gap-1 flex-wrap mt-0.5">
                                        {formatSLDateTime(record.DATE, record).addedBy && (
                                            <span className="text-blue-300 font-semibold">👤 {formatSLDateTime(record.DATE, record).addedBy}</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <Tag color={record.INWARD_TYPE === 'amu_wee' ? 'gold' : record.INWARD_TYPE === 'store_transfer' ? 'cyan' : record.INWARD_TYPE === 'mill_purchase' ? 'purple' : 'green'}>
                                        {typeLabels[record.INWARD_TYPE] || record.INWARD_TYPE}
                                    </Tag>
                                </div>
                            </div>

                            <div className="text-sm font-semibold text-white">
                                {record.ITEM_NAME || 'Unknown Item'}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-white/5">
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Quantity</span>
                                    <span className="font-bold text-white font-mono">{record.QUANTITY?.toLocaleString() || 0} kg</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Bags</span>
                                    <span className="font-bold text-white font-mono">{record.NO_OF_BAGS || '-'}</span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-white/5 flex-wrap gap-2">
                                <div>
                                    {record.TOTAL_PRICE && (
                                        <>
                                            <span className="text-[10px] text-gray-400 block uppercase">Total Cost</span>
                                            <span className="text-sm font-bold text-emerald-400 font-mono">
                                                Rs. {parseFloat(record.TOTAL_PRICE).toFixed(2)}
                                            </span>
                                        </>
                                    )}
                                </div>
                                {userCanModify && (
                                    <div className="flex items-center gap-1.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                                        <Button 
                                            size="small" 
                                            icon={<EditOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEditDrawer(record);
                                            }} 
                                            className="!text-amber-500 rounded-lg" 
                                        />
                                        <Popconfirm 
                                            title="Delete and reverse inventory?" 
                                            onConfirm={() => handleDelete(record)} 
                                            okText="Yes" 
                                            cancelText="No"
                                        >
                                            <Button 
                                                size="small" 
                                                icon={<DeleteOutlined />} 
                                                danger 
                                                onClick={(e) => e.stopPropagation()} 
                                                className="rounded-lg"
                                            />
                                        </Popconfirm>
                                    </div>
                                )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-normal pt-1.5 border-t border-white/5">
                                created {formatSLDateTime(record.CREATED_DATE || record.CREATED_AT || record.DATE, record).dateStr.replace(/-/g, '/')} {formatSLDateTime(record.CREATED_DATE || record.CREATED_AT || record.DATE, record).timeStr}{formatSLDateTime(record.CREATED_DATE || record.CREATED_AT || record.DATE, record).addedBy ? ` by ${formatSLDateTime(record.CREATED_DATE || record.CREATED_AT || record.DATE, record).addedBy}` : ''}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add / Edit Drawer */}
            <Drawer
                title={
                    <div className="flex items-center gap-2">
                        {editingRecord ? <EditOutlined className="text-amber-500" /> : typeIcons[drawerType]}
                        <span>{editingRecord ? `Edit ${editingRecord.REFERENCE_NO}` : `New ${typeLabels[drawerType]}`}</span>
                    </div>
                }
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={480}
                extra={
                    <Button type="primary" loading={submitting} onClick={handleSubmit}>
                        Save Record
                    </Button>
                }
            >
                <Form form={form} layout="vertical" size="large">
                    {/* Pending Transfer Selector */}
                    {drawerType === 'store_transfer' && pendingTransfers.length > 0 && (
                        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700/50">
                            <Form.Item name="STORE_TRANSFER_ID" label="Select Pending Transfer" className="!mb-0">
                                <Select
                                    placeholder="Choose pending store transfer"
                                    className="w-full"
                                    allowClear
                                    onChange={(val) => {
                                        const tr = pendingTransfers.find(t => t.STORE_TRANSFER_ID === val);
                                        if (tr) {
                                            form.setFieldsValue({
                                                STORE_TRANSFER_ID: tr.STORE_TRANSFER_ID,
                                                ITEM_ID: tr.MAPPED_MILL_ITEM_ID,
                                                GROSS_WEIGHT: tr.STORE_QUANTITY,
                                                QUANTITY: tr.STORE_QUANTITY,
                                                SOURCE_QUANTITY: tr.STORE_QUANTITY,
                                                STORE_NO: tr.STORE_NO,
                                                STORE_TRANSFER_REF: tr.TRANSFER_CODE || `STR-${tr.STORE_TRANSFER_ID}`
                                            });
                                            message.info(`Auto-filled Store Transfer ${tr.TRANSFER_CODE}`);
                                        }
                                    }}
                                    options={pendingTransfers.map(tr => ({
                                        value: tr.STORE_TRANSFER_ID,
                                        label: `Store ${tr.STORE_NO} • ${tr.STORE_ITEM_NAME} • ${tr.STORE_QUANTITY} kg (${toSLDateDisplay(tr.DATE)})`
                                    }))}
                                />
                            </Form.Item>
                        </div>
                    )}

                    {/* Common Fields */}
                    <Form.Item name="ITEM_ID" label="Item (Raw Paddy & Seasonal Items)" rules={[{ required: true, message: 'Please select item' }]}>
                        <Select
                            showSearch
                            placeholder="Select raw paddy or seasonal item"
                            optionFilterProp="label"
                            options={items
                                .filter(i => {
                                    const cat = (i.CATEGORY || '').toLowerCase();
                                    const code = (i.SYSTEM_CODE || i.CODE || '').toUpperCase();
                                    const isActive = Number(i.IS_ACTIVE) !== 0;
                                    return isActive && (cat === 'raw_input' || cat === 'seasonal' || code.startsWith('RAW_'));
                                })
                                .map(i => ({ value: i.ITEM_ID, label: `🌾 ${i.CODE || i.SYSTEM_CODE} - ${i.NAME}` }))
                            }
                        />
                    </Form.Item>

                    {/* Dry / Wet Dual Handler */}
                    <Form.Item name="CONDITION" label="Condition (තත්ත්වය)" initialValue="dry">
                        <Radio.Group 
                            buttonStyle="solid" 
                            className="w-full"
                            onChange={(e) => {
                                const cond = e.target.value;
                                const gross = form.getFieldValue('GROSS_WEIGHT') || form.getFieldValue('QUANTITY') || 0;
                                const dryPct = form.getFieldValue('DRY_PERCENTAGE') || 85;
                                if (cond === 'dry') {
                                    form.setFieldValue('QUANTITY', gross);
                                } else {
                                    form.setFieldValue('QUANTITY', parseFloat((gross * (dryPct / 100)).toFixed(2)));
                                }
                            }}
                        >
                            <Radio.Button value="dry" className="!w-1/2 text-center">☀️ Dry (වියළි)</Radio.Button>
                            <Radio.Button value="wet" className="!w-1/2 text-center">💧 Wet (තෙත)</Radio.Button>
                        </Radio.Group>
                    </Form.Item>

                    <Form.Item name="GROSS_WEIGHT" label="Gross / Total Input Weight (kg)" rules={[{ required: true, message: 'Gross weight is required' }]}>
                        <InputNumber 
                            className="!w-full" 
                            min={0} 
                            step={0.5} 
                            placeholder="0.00" 
                            formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                            parser={(value) => value ? value.replace(/\s/g, '') : ''}
                            onChange={(val) => {
                                const gross = val || 0;
                                const cond = form.getFieldValue('CONDITION') || 'dry';
                                const dryPct = form.getFieldValue('DRY_PERCENTAGE') || 85;
                                if (cond === 'dry') {
                                    form.setFieldValue('QUANTITY', gross);
                                } else {
                                    form.setFieldValue('QUANTITY', parseFloat((gross * (dryPct / 100)).toFixed(2)));
                                }
                            }}
                        />
                    </Form.Item>

                    {conditionVal === 'wet' && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 p-4 rounded-xl mb-4">
                            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">💧 Wet Paddy Dry Recovery Calculation</h4>
                            <Form.Item name="DRY_PERCENTAGE" label="Dry Percentage (%)" initialValue={85}>
                                <InputNumber 
                                    className="!w-full font-bold" 
                                    min={1} 
                                    max={100} 
                                    step={1} 
                                    addonAfter="%" 
                                    onChange={(pct) => {
                                        const dryPct = pct || 85;
                                        const gross = form.getFieldValue('GROSS_WEIGHT') || 0;
                                        form.setFieldValue('QUANTITY', parseFloat((gross * (dryPct / 100)).toFixed(2)));
                                    }}
                                />
                            </Form.Item>
                        </div>
                    )}

                    <Form.Item name="QUANTITY" label="Inventory Weight (Stored to Stock - kg)" rules={[{ required: true }]}>
                        <InputNumber 
                            className="!w-full font-bold text-green-600" 
                            min={0} 
                            step={0.5} 
                            placeholder="0.00" 
                            formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                            parser={(value) => value ? value.replace(/\s/g, '') : ''}
                        />
                    </Form.Item>

                    {isAmuWee && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 p-4 rounded-lg mb-4">
                            <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-500 mb-2">🌾 Amu Wee Drying Operation</h4>
                            <p className="text-xs text-yellow-700 dark:text-yellow-600 mb-3">
                                Amu Wee must be dried. Enter the estimated moisture loss percentage or the target dry weight for this batch.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <Form.Item 
                                    name="MOISTURE_LOSS_PERCENT" 
                                    label="Moisture Loss (%)" 
                                    initialValue={15}
                                    rules={[{ required: true, message: 'Please enter moisture loss percentage' }]}
                                >
                                    <InputNumber 
                                        className="!w-full" 
                                        min={0} 
                                        max={100} 
                                        step={0.1} 
                                        addonAfter="%" 
                                        onChange={handleMoistureChange}
                                    />
                                </Form.Item>
                                
                                <Form.Item 
                                    name="DRY_WEIGHT_ESTIMATE" 
                                    label="Est. Dry Weight (kg)" 
                                    initialValue={realTimeDryWeight}
                                >
                                    <InputNumber 
                                        className="!w-full text-green-600 font-bold" 
                                        min={0} 
                                        step={0.5} 
                                        addonAfter="kg" 
                                        formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                                        parser={(value) => value ? value.replace(/\s/g, '') : ''}
                                        onChange={handleDryWeightChange}
                                    />
                                </Form.Item>
                            </div>
                        </div>
                    )}

                    <Form.Item name="PLACE_ID" label="Place / District">
                        <Select
                            showSearch
                            allowClear
                            placeholder="Select place"
                            optionFilterProp="label"
                            options={places.map(p => ({ value: p.PLACE_ID, label: `${p.NAME}${p.DISTRICT ? ` (${p.DISTRICT})` : ''}` }))}
                        />
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-4">
                        {drawerType !== 'mill_purchase' && (
                            <Form.Item name="SOURCE_QUANTITY" label="Source Weight (kg)">
                                <InputNumber 
                                    className="!w-full" 
                                    min={0} 
                                    step={0.5} 
                                    placeholder="0.00" 
                                    formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                                    parser={(value) => value ? value.replace(/\s/g, '') : ''}
                                />
                            </Form.Item>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="PRICE_PER_UNIT" label="Price per kg">
                            <InputNumber 
                                className="!w-full" 
                                min={0} 
                                step={1} 
                                placeholder="Rs. 0.00" 
                                formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                                parser={(value) => value ? value.replace(/\s/g, '') : ''}
                                onChange={handleUnitPriceChange}
                            />
                        </Form.Item>
                        <Form.Item name="TOTAL_PRICE" label="Total Lot Price">
                            <InputNumber 
                                className="!w-full" 
                                min={0} 
                                step={1} 
                                placeholder="Rs. 0.00" 
                                formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                                parser={(value) => value ? value.replace(/\s/g, '') : ''}
                                onChange={handleTotalPriceChange}
                            />
                        </Form.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="NO_OF_BAGS" label="No. of Bags">
                            <InputNumber 
                                className="!w-full" 
                                min={0} 
                                step={1} 
                                placeholder="0" 
                                formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                                parser={(value) => value ? value.replace(/\s/g, '') : ''}
                            />
                        </Form.Item>
                        <Form.Item name="DATE" label="Date" rules={[{ required: true }]}>
                            <DatePicker className="!w-full" />
                        </Form.Item>
                    </div>

                    {/* Store Transfer specific */}
                    {drawerType === 'store_transfer' && (
                        <>
                            <Form.Item name="STORE_TRANSFER_ID" hidden>
                                <Input />
                            </Form.Item>
                            <Form.Item name="STORE_NO" label="From Store No.">
                                <InputNumber className="!w-full" min={1} placeholder="e.g., 1" />
                            </Form.Item>
                            <Form.Item name="STORE_TRANSFER_REF" label="Store Transfer Reference">
                                <Input placeholder="Transfer ID from store app" />
                            </Form.Item>
                        </>
                    )}

                    {/* Mill Purchase specific */}
                    {drawerType === 'mill_purchase' && (
                        <Form.Item name="SUPPLIER_ID" label="Supplier">
                            <Select
                                showSearch
                                allowClear
                                placeholder="Select supplier"
                                optionFilterProp="label"
                                options={suppliers.map(s => ({ value: s.CUSTOMER_ID, label: s.NAME }))}
                            />
                        </Form.Item>
                    )}

                    {/* Go and Get specific */}
                    {drawerType === 'go_and_get' && (
                        <>
                            <Form.Item name="VEHICLE_NO" label="Vehicle No.">
                                <Input placeholder="e.g., CAB-1234" />
                            </Form.Item>
                            <Form.Item name="DRIVER_NAME" label="Driver Name">
                                <Input placeholder="Driver's name" />
                            </Form.Item>
                        </>
                    )}

                    <Form.Item name="NOTES" label="Notes">
                        <Input.TextArea rows={2} placeholder="Additional notes..." />
                    </Form.Item>
                </Form>
            </Drawer>

            {/* View Modal */}
            <Modal
                title="Inward Record Details"
                open={viewModalOpen}
                onCancel={() => setViewModalOpen(false)}
                footer={null}
                width={600}
            >
                {viewRecord && (
                    <Descriptions bordered column={2} size="small">
                        <Descriptions.Item label="Reference" span={2}>
                            <span className="font-mono text-blue-500">{viewRecord.REFERENCE_NO}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label="Type">
                            <Tag color={typeColors[viewRecord.INWARD_TYPE]}>{typeLabels[viewRecord.INWARD_TYPE]}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Date">{toSLDateDisplay(viewRecord.DATE)}</Descriptions.Item>
                        <Descriptions.Item label="Item">{viewRecord.ITEM_NAME} ({viewRecord.ITEM_CODE})</Descriptions.Item>
                        <Descriptions.Item label="Category">
                            <Tag>{viewRecord.ITEM_CATEGORY}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Condition Bought">
                            {viewRecord.CONDITION === 'wet' || viewRecord.MOISTURE_LOSS_PERCENT > 0 ? (
                                <Tag color="blue" className="font-bold">💧 Wet Paddy</Tag>
                            ) : (
                                <Tag color="gold" className="font-bold">☀️ Dry Paddy</Tag>
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Dry Recovery %">
                            <span className="font-bold">
                                {viewRecord.DRY_PERCENTAGE ? `${viewRecord.DRY_PERCENTAGE}%` : (viewRecord.MOISTURE_LOSS_PERCENT ? `${100 - viewRecord.MOISTURE_LOSS_PERCENT}%` : '100%')}
                            </span>
                        </Descriptions.Item>
                        <Descriptions.Item label="Gross Input Weight">
                            {viewRecord.GROSS_WEIGHT ? formatWeight(viewRecord.GROSS_WEIGHT) : formatWeight(viewRecord.QUANTITY)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Net Stored Stock">
                            <span className="font-bold text-green-600">{formatWeight(viewRecord.QUANTITY)}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label="Place">{viewRecord.PLACE_NAME || '-'}</Descriptions.Item>
                        <Descriptions.Item label="District">{viewRecord.PLACE_DISTRICT || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Mill Weight">{formatWeight(viewRecord.QUANTITY)}</Descriptions.Item>
                        <Descriptions.Item label="Source Weight">{viewRecord.SOURCE_QUANTITY ? formatWeight(viewRecord.SOURCE_QUANTITY) : '-'}</Descriptions.Item>
                        <Descriptions.Item label="Surplus/Wastage">
                            {viewRecord.SURPLUS_WASTAGE !== null ? (
                                <span className={viewRecord.SURPLUS_WASTAGE >= 0 ? 'text-green-500' : 'text-red-500'}>
                                    {viewRecord.SURPLUS_WASTAGE >= 0 ? '+' : ''}{formatNumber(viewRecord.SURPLUS_WASTAGE)} kg
                                </span>
                            ) : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Bags">{viewRecord.NO_OF_BAGS || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Price/kg">{viewRecord.PRICE_PER_UNIT ? `Rs. ${formatNumber(viewRecord.PRICE_PER_UNIT)}` : '-'}</Descriptions.Item>
                        <Descriptions.Item label="Total">{viewRecord.TOTAL_PRICE ? formatCurrency(viewRecord.TOTAL_PRICE) : '-'}</Descriptions.Item>
                        {viewRecord.INWARD_TYPE === 'store_transfer' && (
                            <>
                                <Descriptions.Item label="From Store">Store {viewRecord.STORE_NO || '-'}</Descriptions.Item>
                                <Descriptions.Item label="Transfer Ref">{viewRecord.STORE_TRANSFER_REF || '-'}</Descriptions.Item>
                            </>
                        )}
                        {viewRecord.INWARD_TYPE === 'mill_purchase' && (
                            <Descriptions.Item label="Supplier" span={2}>{viewRecord.SUPPLIER_NAME || '-'}</Descriptions.Item>
                        )}
                        {viewRecord.INWARD_TYPE === 'go_and_get' && (
                            <>
                                <Descriptions.Item label="Vehicle">{viewRecord.VEHICLE_NO || '-'}</Descriptions.Item>
                                <Descriptions.Item label="Driver">{viewRecord.DRIVER_NAME || '-'}</Descriptions.Item>
                            </>
                        )}
                        <Descriptions.Item label="Notes" span={2}>{viewRecord.NOTES || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Received By">{viewRecord.RECEIVED_BY || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Created">{toSLTime(viewRecord.CREATED_DATE)}</Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>

            {/* Pending Transfers Drawer */}
            <Drawer
                title="Pending Store Transfers"
                width={1200}
                open={pendingDrawerOpen}
                onClose={() => setPendingDrawerOpen(false)}
            >
                <Table
                    dataSource={pendingTransfers}
                    rowKey="STORE_TRANSFER_ID"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    columns={[
                        {
                            title: 'Date',
                            dataIndex: 'DATE',
                            render: (date) => toSLDateDisplay(date)
                        },
                        {
                            title: 'Store',
                            dataIndex: 'STORE_NO',
                            render: (no) => `Store ${no}`
                        },
                        {
                            title: 'Transfer Code',
                            dataIndex: 'TRANSFER_CODE',
                            render: (code) => <span className="font-mono text-xs">{code}</span>
                        },
                        {
                            title: 'Store Item',
                            dataIndex: 'STORE_ITEM_NAME',
                        },
                        {
                            title: 'Quantity (Store)',
                            dataIndex: 'STORE_QUANTITY',
                            render: (val) => `${formatNumber(val)} kg`
                        },
                        {
                            title: 'Mapped Mill Item',
                            dataIndex: 'MAPPED_MILL_ITEM_NAME',
                            render: (name, record) => name ? <Tag color="green">{name}</Tag> : <Tag color="red">Unmapped</Tag>
                        },
                        {
                            title: 'Action',
                            key: 'action',
                            render: (_, record) => (
                                <div className="flex gap-2">
                                    <Button 
                                        type="primary" 
                                        size="small"
                                        disabled={!record.MAPPED_MILL_ITEM_ID}
                                        onClick={() => openAddDrawer('store_transfer', record)}
                                    >
                                        Accept
                                    </Button>
                                    <Button 
                                        danger 
                                        size="small"
                                        onClick={() => handleDeclineTransfer(record)}
                                    >
                                        Decline
                                    </Button>
                                </div>
                            )
                        }
                    ]}
                />
            </Drawer>
        </div>
    );
}
