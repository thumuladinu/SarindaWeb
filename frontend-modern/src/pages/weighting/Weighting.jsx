import React, { useEffect, useState } from 'react';
import { Table, Button, Input, DatePicker, Tag, Row, Col, Statistic, Card, Spin, Modal, Descriptions, App } from 'antd';
import { SearchOutlined, ReloadOutlined, DatabaseOutlined, CalendarOutlined, EyeOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import MobileDateRange from '../../components/common/MobileDateRange';

const { RangePicker } = DatePicker;

const Weighting = () => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [weightData, setWeightData] = useState([]);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

    // Filters
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState(null);

    // Modal
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);

    const fetchWeightData = async (page = 1, pageSize = 20, search = '', dates = null) => {
        setLoading(true);
        try {
            const params = {
                page,
                limit: pageSize,
                search: search || undefined
            };

            if (dates && dates.length === 2) {
                params.startDate = dates[0].startOf('day').format('YYYY-MM-DD HH:mm:ss');
                params.endDate = dates[1].endOf('day').format('YYYY-MM-DD HH:mm:ss');
            }

            const response = await axios.get('/api/weights/all', { params });

            if (response.data.success) {
                const rawData = response.data.measures || [];
                // Process data (same logic as before for calculating totals)
                const processed = rawData.map((record, idx) => {
                    // Actuall backend sends ...itemDetails spread, so we just check.
                    // But wait, my NEW backend code spreads itemDetails.
                    // So record already has itemDetails properties at top level.

                    // Logic to ensure weights exist
                    const items = record.items || [];
                    const calcNet = items.reduce((sum, i) => sum + (parseFloat(i.netWeight) || 0), 0);
                    const calcGross = items.reduce((sum, i) => sum + (parseFloat(i.grossWeight) || 0), 0);
                    const calcTare = items.reduce((sum, i) => sum + (parseFloat(i.tareWeight) || 0), 0);

                    const finalNet = parseFloat(record.netWeight || calcNet || 0);
                    const finalGross = parseFloat(record.grossWeight || calcGross || 0);
                    const finalTare = parseFloat(record.tareWeight || calcTare || 0);

                    return {
                        ...record,
                        netWeight: finalNet.toFixed(2),
                        grossWeight: finalGross.toFixed(2),
                        tareWeight: finalTare.toFixed(2),
                        items
                    };
                });

                setWeightData(processed);
                if (response.data.pagination) {
                    setPagination({
                        current: response.data.pagination.current,
                        pageSize: response.data.pagination.pageSize,
                        total: response.data.pagination.total
                    });
                }
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Failed to load weight data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWeightData(pagination.current, pagination.pageSize, searchText, dateRange);
    }, []); // Initial load

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchWeightData(1, pagination.pageSize, searchText, dateRange);
        }, 600);
        return () => clearTimeout(timer);
    }, [searchText]);

    const handleTableChange = (newPagination) => {
        fetchWeightData(newPagination.current, newPagination.pageSize, searchText, dateRange);
    };

    const handleDateChange = (dates) => {
        setDateRange(dates);
        fetchWeightData(1, pagination.pageSize, searchText, dates);
    };

    const handleSearchChange = (e) => {
        setSearchText(e.target.value);
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        return dayjs(dateStr).format('MMM D, YYYY h:mm A');
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return 'green';
            case 'Processing': return 'blue';
            case 'Pending': return 'orange';
            default: return 'default';
        }
    };

    // Columns
    const columns = [
        {
            title: 'Code',
            dataIndex: 'code',
            key: 'code',
            width: 120,
            className: 'text-gray-700 dark:text-gray-300 font-medium font-mono',
            render: (text) => <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md text-xs">{text}</span>
        },
        {
            title: 'Date',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (text) => <span className="text-gray-600 dark:text-gray-400 text-sm whitespace-nowrap">{formatDateTime(text)}</span>
        },
        {
            title: 'Items',
            dataIndex: 'items',
            key: 'items',
            render: (items) => {
                if (!items || !items.length) return <span className="text-gray-400 italic">No items</span>;
                return (
                    <div className="flex flex-col gap-1">
                        {items.slice(0, 2).map((item, i) => (
                            <div key={i} className="text-xs">
                                <span className="font-semibold text-gray-700 dark:text-gray-300">{item.productCode || 'Item'}:</span>
                                <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-bold">{parseFloat(item.netWeight || 0).toFixed(2)}kg</span>
                            </div>
                        ))}
                        {items.length > 2 && <span className="text-xs text-blue-500">+{items.length - 2} more</span>}
                    </div>
                );
            }
        },
        {
            title: 'Weight (Net)',
            dataIndex: 'netWeight',
            key: 'netWeight',
            align: 'right',
            render: (val) => <span className="font-bold text-emerald-600 dark:text-emerald-400">{val} kg</span>
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            align: 'center',
            width: 100,
            render: (status, record) => (
                <div className="flex flex-col items-center">
                    <Tag color={getStatusColor(status)}>{status}</Tag>
                    {record.collectedAt && (
                        <div className="text-[10px] text-gray-400 mt-1 text-center">
                            Paid: {formatDateTime(record.collectedAt)}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Action',
            key: 'action',
            align: 'center',
            width: 80,
            render: (_, record) => (
                <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => { setSelectedRecord(record); setDetailsVisible(true); }}
                    className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                />
            )
        }
    ];

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="hidden md:block">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white m-0">Weighting Station</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Real-time weight data stream</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <MobileDateRange
                        value={dateRange}
                        onChange={handleDateChange}
                        className="w-full sm:w-64"
                    />
                    <Input
                        placeholder="Search code/item..."
                        allowClear
                        value={searchText}
                        onChange={handleSearchChange}
                        className="w-full sm:w-48"
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => fetchWeightData(1, pagination.pageSize, searchText, dateRange)}
                        className="flex-shrink-0"
                    />
                </div>
            </div>

            {/* Desktop Table with Server Pagination */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-white/5 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={weightData}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        ...pagination,
                        showSizeChanger: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`
                    }}
                    onChange={handleTableChange}
                    size="middle"
                    rowClassName="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    onRow={(record) => ({
                        onClick: () => { setSelectedRecord(record); setDetailsVisible(true); }
                    })}
                />
            </div>

            {/* Mobile Cards (Simplified loop for now. Note: Infinite scroll requires more UI logic, using pagination buttons for mobile simple implementation) */}
            <div className="md:hidden flex flex-col gap-3">
                {loading && <div className="flex justify-center p-8"><div className="loading-spinner"></div></div>}

                {!loading && weightData.map(record => (
                    <div
                        key={record.id}
                        onClick={() => { setSelectedRecord(record); setDetailsVisible(true); }}
                        className="glass-card p-4 rounded-xl flex flex-col gap-2 relative border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-transform"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="text-xs text-blue-500 font-mono font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md w-fit mb-1">{record.code}</span>
                                <div className="text-xs text-gray-400 mt-1">{formatDateTime(record.createdAt)}</div>
                            </div>
                            <div className="flex flex-col items-end">
                                <Tag color={getStatusColor(record.status)}>{record.status}</Tag>
                                {record.collectedAt && (
                                    <div className="text-[10px] text-gray-400 mt-1">
                                        Paid: {formatDateTime(record.collectedAt)}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-dashed border-gray-100 dark:border-white/10">
                            <div className="text-center">
                                <div className="text-[10px] text-gray-400 uppercase">Gross</div>
                                <div className="font-semibold text-gray-700 dark:text-gray-300">{record.grossWeight || '0.00'}</div>
                            </div>
                            <div className="text-center border-l border-r border-gray-100 dark:border-white/5">
                                <div className="text-[10px] text-gray-400 uppercase">Tare</div>
                                <div className="font-semibold text-gray-500">{record.tareWeight || '0.00'}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[10px] text-gray-400 uppercase">Net</div>
                                <div className="font-bold text-emerald-600 dark:text-emerald-400">{record.netWeight || '0.00'}</div>
                            </div>
                        </div>

                        {record.items && record.items.length > 0 && (
                            <div className="mt-2 text-xs bg-gray-50 dark:bg-white/5 p-2 rounded-lg">
                                <span className="text-gray-400 mr-1">Items:</span>
                                {record.items.map(i => i.productCode).join(', ')}
                            </div>
                        )}
                    </div>
                ))}

                {/* Mobile Pagination Controls */}
                <div className="flex justify-between items-center mt-4 px-2">
                    <Button
                        disabled={pagination.current === 1}
                        onClick={() => handleTableChange({ ...pagination, current: pagination.current - 1 })}
                    >Previous</Button>
                    <span className="text-sm text-gray-500">Page {pagination.current} / {Math.ceil(pagination.total / pagination.pageSize)}</span>
                    <Button
                        disabled={pagination.current * pagination.pageSize >= pagination.total}
                        onClick={() => handleTableChange({ ...pagination, current: pagination.current + 1 })}
                    >Next</Button>
                </div>
            </div>

            {/* Details Modal */}
            <Modal
                title={<span className="text-lg font-bold">Details: {selectedRecord?.code}</span>}
                open={detailsVisible}
                onCancel={() => setDetailsVisible(false)}
                footer={[<Button key="close" onClick={() => setDetailsVisible(false)}>Close</Button>]}
                className="glass-modal"
                width={500}
            >
                {selectedRecord && (
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center bg-gray-50 dark:bg-white/5 p-3 rounded-lg">
                            <span className="text-gray-500 text-sm">Date</span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{formatDateTime(selectedRecord.createdAt)}</span>
                        </div>

                        <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-lg border border-gray-100 dark:border-white/10">
                            <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3 text-xs uppercase tracking-wider text-center">Weight Breakdown (kg)</h4>

                            <div className="flex justify-between items-center text-sm mb-2">
                                <span className="text-gray-500">Gross Weight:</span>
                                <span className="font-mono font-medium">{selectedRecord.grossWeight || '0.00'}</span>
                            </div>

                            {selectedRecord.collectedAt && (
                                <div className="bg-green-50 dark:bg-green-900/10 p-3 rounded-lg border border-green-100 dark:border-green-800/30 flex justify-between items-center">
                                    <div>
                                        <div className="text-xs text-green-600 dark:text-green-400 font-bold uppercase">Payment Collected</div>
                                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatDateTime(selectedRecord.collectedAt)}</div>
                                    </div>
                                    {selectedRecord.transactionCode && (
                                        <div className="text-right">
                                            <div className="text-xs text-gray-400">Transaction</div>
                                            <div className="text-sm font-mono font-bold text-gray-600 dark:text-gray-400">{selectedRecord.transactionCode}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex justify-between items-center text-sm mb-2">
                                <span className="text-gray-500">Tare Weight:</span>
                                <span className="font-mono font-medium">{selectedRecord.tareWeight || '0.00'}</span>
                            </div>
                            <div className="flex justify-between items-center text-lg font-bold pt-3 mt-1 border-t border-dashed border-gray-200 dark:border-gray-700">
                                <span className="text-emerald-600">Net Weight:</span>
                                <span className="text-emerald-600 font-mono">{selectedRecord.netWeight || '0.00'}</span>
                            </div>
                        </div>

                        {selectedRecord.items && selectedRecord.items.length > 0 && (
                            <div>
                                <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-2 text-xs uppercase tracking-wider mt-2">Item Details ({selectedRecord.items.length})</h4>
                                <Table
                                    dataSource={selectedRecord.items}
                                    pagination={false}
                                    size="small"
                                    rowKey={(r, i) => i}
                                    className="border border-gray-100 dark:border-white/10 rounded-lg overflow-hidden"
                                    columns={[
                                        { title: 'Item', dataIndex: 'productCode', key: 'productCode' },
                                        { title: 'Gross', dataIndex: 'grossWeight', key: 'grossWeight', align: 'center', render: v => parseFloat(v || 0).toFixed(2) },
                                        { title: 'Tare', dataIndex: 'tareWeight', key: 'tareWeight', align: 'center', render: v => parseFloat(v || 0).toFixed(2) },
                                        { title: 'Net', dataIndex: 'netWeight', key: 'netWeight', align: 'right', render: v => <span className="font-bold text-emerald-600">{parseFloat(v || 0).toFixed(2)}</span> }
                                    ]}
                                />
                            </div>
                        )}

                        {selectedRecord.notes && (
                            <div className="text-sm text-gray-500 italic border-l-2 border-blue-400 pl-2 bg-blue-50 dark:bg-blue-900/10 p-2 rounded">
                                Note: {selectedRecord.notes}
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Weighting;
