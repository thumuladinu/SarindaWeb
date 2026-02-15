import React, { useEffect, useState } from 'react';
import { Table, Button, Input, DatePicker, Tag, Row, Col, Statistic, Card, Spin, Modal, Descriptions, App } from 'antd';
import { SearchOutlined, ReloadOutlined, DatabaseOutlined, CalendarOutlined, EyeOutlined, TruckOutlined, TagsOutlined, CheckCircleOutlined, CloseCircleOutlined, UserOutlined, ShopOutlined, FileTextOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import MobileDateRange from '../components/common/MobileDateRange'; // Assuming this exists based on Weighting.jsx

const { RangePicker } = DatePicker;

const TripsPage = () => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [tripsData, setTripsData] = useState([]);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

    // Filters
    const [tripIdSearch, setTripIdSearch] = useState('');
    const [itemNameSearch, setItemNameSearch] = useState('');
    const [dateRange, setDateRange] = useState(null);

    // Modal
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);

    const fetchTripsData = async (page = 1, pageSize = 20, tripId = '', dates = null) => {
        setLoading(true);
        try {
            const params = {
                page,
                limit: pageSize,
                limit: pageSize,
                tripId: tripId || undefined,
                itemName: itemNameSearch || undefined, // New filter
            };

            if (dates && dates.length === 2) {
                params.startDate = dates[0].startOf('day').format('YYYY-MM-DD HH:mm:ss');
                params.endDate = dates[1].endOf('day').format('YYYY-MM-DD HH:mm:ss');
            }

            // Using POST as defined in backend
            const response = await axios.post('/api/stock-ops/trips', params);

            if (response.data.success) {
                setTripsData(response.data.trips || []);
                // Backend currently doesn't return pagination metadata in the new endpoint, 
                // but we can simulate or adjust if needed. For now, just setting data.
                // If backend added pagination count, we'd use it. 
                // Assuming unlimited or simple limit for now as per code.
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Failed to load trips data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTripsData(pagination.current, pagination.pageSize, tripIdSearch, dateRange);
    }, []);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchTripsData(1, pagination.pageSize, tripIdSearch, dateRange);
        }, 600);
        return () => clearTimeout(timer);
    }, [tripIdSearch, itemNameSearch]);

    const handleDateChange = (dates) => {
        setDateRange(dates);
        fetchTripsData(1, pagination.pageSize, tripIdSearch, itemNameSearch, dates);
    };

    const handleSearchChange = (e) => {
        setTripIdSearch(e.target.value);
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        return dayjs(dateStr).format('MMM D, YYYY h:mm A');
    };

    const getOpTypeColor = (type) => {
        // [1, 3, 6, 8] are FULL
        if ([1, 3, 6, 8].includes(type)) return 'red';
        return 'geekblue';
    };

    const columns = [
        {
            title: 'Trip ID',
            dataIndex: 'TRIP_ID',
            key: 'TRIP_ID',
            render: (text) => (
                <div className="flex items-center gap-2">
                    <div className="bg-green-600 text-white px-3 py-1 rounded text-base font-bold font-mono shadow-sm">
                        {text}
                    </div>
                </div>
            )
        },
        {
            title: 'Date',
            dataIndex: 'CREATED_DATE',
            key: 'CREATED_DATE',
            render: (text) => <span className="text-gray-500 text-sm whitespace-nowrap">{formatDateTime(text)}</span>
        },
        {
            title: 'Store',
            dataIndex: 'STORE_NO',
            key: 'STORE_NO',
            render: (text) => <Tag>Store {text}</Tag>
        },
        {
            title: 'Operation',
            dataIndex: 'OP_TYPE_NAME',
            key: 'OP_TYPE_NAME',
            render: (text, record) => (
                <Tag color={getOpTypeColor(record.OP_TYPE)} className="font-semibold border-0">{text}</Tag>
            )
        },
        {
            title: 'Billed',
            dataIndex: 'BILL_CODE',
            key: 'BILL_CODE',
            align: 'center',
            width: 80,
            render: (text) => (
                text ? <CheckCircleOutlined className="text-emerald-500 text-lg" /> : <CloseCircleOutlined className="text-gray-300 text-lg" />
            )
        },
        {
            title: 'Items',
            key: 'items',
            render: (_, record) => (
                <div className="flex flex-col gap-1">
                    {record.items && record.items.slice(0, 2).map((item, i) => {
                        // Use MAIN_QTY if available (excludes conversions), otherwise fall back to CLEARED_QUANTITY
                        const displayQty = item.MAIN_QTY !== undefined ? item.MAIN_QTY : item.CLEARED_QUANTITY;
                        return (
                            <div key={i} className="text-xs">
                                <span className="font-semibold text-gray-700 dark:text-gray-300">{item.ITEM_NAME}:</span>
                                <span className="ml-1 text-emerald-600 font-bold">
                                    {Number(displayQty || 0).toFixed(2)}kg
                                </span>
                            </div>
                        );
                    })}
                    {record.items && record.items.length > 2 && (
                        <span className="text-xs text-blue-500">+{record.items.length - 2} more</span>
                    )}
                </div>
            )
        },
        {
            title: 'Action',
            key: 'action',
            width: 80,
            render: (_, record) => (
                <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => { setSelectedRecord(record); setDetailsVisible(true); }}
                    className="text-blue-500 hover:bg-blue-50"
                />
            )
        }
    ];

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="hidden md:block">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white m-0">
                        Trips
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">View completed trip operations</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <MobileDateRange
                        value={dateRange}
                        onChange={handleDateChange}
                        className="w-full sm:w-56"
                    />
                    <Input
                        placeholder="Filter by Item..."
                        allowClear
                        value={itemNameSearch}
                        onChange={(e) => setItemNameSearch(e.target.value)}
                        className="w-full sm:w-48"
                        prefix={<TagsOutlined className="text-gray-400" />}
                    />
                    <Input
                        placeholder="Search Trip ID..."
                        allowClear
                        value={tripIdSearch}
                        onChange={handleSearchChange}
                        className="w-full sm:w-48"
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => fetchTripsData(1, pagination.pageSize, tripIdSearch, itemNameSearch, dateRange)}
                        className="flex-shrink-0"
                    />
                </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-white/5 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={tripsData}
                    rowKey="OP_ID"
                    loading={loading}
                    pagination={false} // Simple list for now as per api
                    size="middle"
                    rowClassName="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    onRow={(record) => ({
                        onClick: () => { setSelectedRecord(record); setDetailsVisible(true); }
                    })}
                />
            </div>

            {/* Mobile List */}
            <div className="md:hidden flex flex-col gap-3">
                {loading && <div className="flex justify-center p-8"><Spin /></div>}
                {!loading && tripsData.map(record => (
                    <div
                        key={record.OP_ID}
                        onClick={() => { setSelectedRecord(record); setDetailsVisible(true); }}
                        className="glass-card rounded-xl overflow-hidden relative border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-transform shadow-sm"
                    >
                        {/* Status Color Strip */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getOpTypeColor(record.OP_TYPE) === 'orange' ? 'bg-orange-500' : 'bg-green-500'}`}></div>

                        <div className="p-4 pl-5">
                            {/* Header */}
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-green-600 text-white px-2.5 py-0.5 rounded-md text-sm font-bold font-mono shadow-sm">
                                            {record.TRIP_ID}
                                        </div>
                                        <Tag color={getOpTypeColor(record.OP_TYPE)} className="m-0 text-[10px] uppercase font-bold border-0">
                                            {record.OP_TYPE_NAME.split('(')[0].trim()}
                                        </Tag>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-1.5 pl-0.5">
                                        <CalendarOutlined /> {formatDateTime(record.CREATED_DATE)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <Tag className="mr-0 font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-0">S{record.STORE_NO}</Tag>
                                </div>
                            </div>

                            {/* Items Section */}
                            <div className="bg-gray-50/80 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-100 dark:border-white/5 mx-0.5">
                                {record.items && record.items.slice(0, 3).map((item, i) => {
                                    const displayQty = item.MAIN_QTY !== undefined ? item.MAIN_QTY : item.CLEARED_QUANTITY;
                                    return (
                                        <div key={i} className="flex justify-between items-center py-1 first:pt-0 last:pb-0 border-b border-gray-100 dark:border-white/5 last:border-0">
                                            <span className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate pr-2">{item.ITEM_NAME}</span>
                                            <span className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">{Number(displayQty).toFixed(1)} <span className="text-xs font-normal text-gray-500">kg</span></span>
                                        </div>
                                    );
                                })}
                                {record.items && record.items.length > 3 && (
                                    <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700 text-xs text-center text-blue-500 font-medium">
                                        +{record.items.length - 3} more items
                                    </div>
                                )}
                            </div>

                            {/* Footer Info (Bill Amount if exists) */}
                            {record.BILL_AMOUNT > 0 && (
                                <div className="mt-3 flex justify-end items-center gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                                    <span className="text-xs text-gray-400 uppercase tracking-wide">Bill Total</span>
                                    <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                                        Rs. {Number(record.BILL_AMOUNT).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Details Modal */}
            <Modal
                title={<span className="text-lg font-bold">Trip Details: {selectedRecord?.TRIP_ID}</span>}
                open={detailsVisible}
                onCancel={() => setDetailsVisible(false)}
                footer={[<Button key="close" onClick={() => setDetailsVisible(false)}>Close</Button>]}
                className="glass-modal"
                width={600}
            >
                {selectedRecord && (
                    <div className="flex flex-col gap-4">
                        {/* Header styled like Inventory History */}
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/10 mt-2">
                            <div className="flex gap-2 items-center flex-wrap">
                                <Tag color="green" className="font-mono m-0">
                                    {selectedRecord.TRIP_ID}
                                </Tag>
                                <Tag color={getOpTypeColor(selectedRecord.OP_TYPE)} className="m-0">
                                    {selectedRecord.OP_TYPE_NAME}
                                </Tag>
                            </div>
                            <div className="text-gray-500 text-xs sm:text-sm">
                                {formatDateTime(selectedRecord.CREATED_DATE)}
                            </div>
                        </div>

                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                            <Descriptions size="small" column={1} bordered className="bg-white dark:bg-gray-800/50">
                                <Descriptions.Item label="Store"><Tag>Store {selectedRecord.STORE_NO}</Tag></Descriptions.Item>
                                {selectedRecord.OP_CODE && <Descriptions.Item label="Op Code"><span className="font-mono text-gray-500">{selectedRecord.OP_CODE}</span></Descriptions.Item>}

                                {selectedRecord.LORRY_NAME && <Descriptions.Item label="Lorry"><span className="font-medium">{selectedRecord.LORRY_NAME}</span></Descriptions.Item>}
                                {selectedRecord.DRIVER_NAME && <Descriptions.Item label="Driver"><span className="flex items-center gap-1"><UserOutlined className="text-gray-400" /> {selectedRecord.DRIVER_NAME}</span></Descriptions.Item>}

                                {selectedRecord.BILL_CODE && <Descriptions.Item label="Bill Code"><Tag color="green">{selectedRecord.BILL_CODE}</Tag></Descriptions.Item>}
                                {selectedRecord.BILL_AMOUNT && <Descriptions.Item label="Bill Amount"><span className="font-bold">Rs. {selectedRecord.BILL_AMOUNT}</span></Descriptions.Item>}

                                {selectedRecord.CUSTOMER_NAME && <Descriptions.Item label="Customer"><span className="flex items-center gap-1"><UserOutlined /> {selectedRecord.CUSTOMER_NAME}</span></Descriptions.Item>}
                                {selectedRecord.DESTINATION && <Descriptions.Item label="Destination"><span className="flex items-center gap-1"><ShopOutlined /> {selectedRecord.DESTINATION}</span></Descriptions.Item>}
                            </Descriptions>

                            <div className="bg-gray-50 dark:bg-white/5 p-3 rounded-lg border border-gray-100 dark:border-white/10">
                                <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3 text-xs uppercase tracking-wider flex items-center gap-2">
                                    <DatabaseOutlined /> Items
                                </h4>
                                <div className="overflow-x-auto">
                                    <Table
                                        dataSource={selectedRecord.items}
                                        pagination={false}
                                        size="small"
                                        rowKey="ID"
                                        scroll={{ x: 'max-content' }}
                                        columns={
                                            selectedRecord.BILL_CODE ? [
                                                {
                                                    title: 'Item Name',
                                                    dataIndex: 'ITEM_NAME',
                                                    key: 'ITEM_NAME',
                                                    render: (t, r) => (
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{t}</span>
                                                            <span className="text-xs text-gray-400">{r.ITEM_CODE}</span>
                                                        </div>
                                                    ),
                                                    width: 150
                                                },
                                                {
                                                    title: 'Qty',
                                                    dataIndex: 'CLEARED_QUANTITY',
                                                    key: 'qty',
                                                    align: 'right',
                                                    render: (v, record) => {
                                                        const displayQty = record.MAIN_QTY !== undefined ? record.MAIN_QTY : v;
                                                        return <span className="font-bold text-emerald-600">{Number(displayQty).toFixed(2)} kg</span>;
                                                    },
                                                    width: 100
                                                },
                                                {
                                                    title: 'Price/Kg',
                                                    dataIndex: 'BILL_PRICE_PER_KG',
                                                    key: 'price',
                                                    align: 'right',
                                                    render: v => <span className="text-gray-700">Rs. {Number(v || 0).toFixed(2)}</span>,
                                                    width: 100
                                                },
                                                {
                                                    title: 'Amount',
                                                    key: 'amount',
                                                    align: 'right',
                                                    render: (_, r) => {
                                                        const amount = (Number(r.CLEARED_QUANTITY || 0) * Number(r.BILL_PRICE_PER_KG || 0));
                                                        return <span className="font-bold text-blue-600">Rs. {amount.toFixed(2)}</span>;
                                                    },
                                                    width: 120
                                                }
                                            ] : [
                                                {
                                                    title: 'Item Name',
                                                    dataIndex: 'ITEM_NAME',
                                                    key: 'ITEM_NAME',
                                                    render: (t, r) => (
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{t}</span>
                                                            <span className="text-xs text-gray-400">{r.ITEM_CODE}</span>
                                                        </div>
                                                    )
                                                },
                                                {
                                                    title: 'Qty',
                                                    dataIndex: 'CLEARED_QUANTITY',
                                                    key: 'qty',
                                                    align: 'right',
                                                    render: (v, record) => {
                                                        const displayQty = record.MAIN_QTY !== undefined ? record.MAIN_QTY : v;
                                                        return <span className="font-bold text-emerald-600">{Number(displayQty).toFixed(2)} kg</span>;
                                                    }
                                                }
                                            ]
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default TripsPage;
