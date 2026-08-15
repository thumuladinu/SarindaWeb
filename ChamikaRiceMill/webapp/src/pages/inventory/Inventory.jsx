import React, { useState, useEffect } from 'react';
import { Table, Tabs, Tag, Spin, Select, DatePicker, App } from 'antd';
import { StockOutlined, HistoryOutlined, EnvironmentOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatNumber, formatWeight, toSLDateDisplay, toSLTime } from '../../utils/helpers';

const typeColorMap = { IN: 'green', OUT: 'red', ADJ_IN: 'cyan', ADJ_OUT: 'volcano' };

const isRawInputItem = (item) => {
    if (!item) return false;
    const cat = (item.CATEGORY || item.category || item.ITEM_TYPE || '').toLowerCase();
    const code = (item.CODE || item.code || '').toUpperCase();
    return cat === 'raw_input' || cat === 'seasonal' || cat === 'raw_item' || cat === 'raw' || code.startsWith('RAW_');
};

export default function Inventory() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('stock');
    const [stockData, setStockData] = useState([]);
    const [ledgerData, setLedgerData] = useState([]);
    const [items, setItems] = useState([]);
    const [places, setPlaces] = useState([]);

    // Filters
    const [ledgerItemFilter, setLedgerItemFilter] = useState(null);
    const [ledgerPlaceFilter, setLedgerPlaceFilter] = useState(null);

    useEffect(() => {
        fetchStock();
        fetchReferenceData();
    }, []);

    useEffect(() => {
        if (activeTab === 'ledger') {
            fetchLedger();
        }
    }, [activeTab, ledgerItemFilter, ledgerPlaceFilter]);

    const fetchStock = async () => {
        setLoading(true);
        try {
            const res = await axios.post('/api/mill/inventory/status');
            if (res.data.success) {
                setStockData(res.data.result || []);
            }
        } catch (error) {
            console.error('Error fetching stock:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLedger = async () => {
        setLoading(true);
        try {
            const res = await axios.post('/api/mill/inventory/ledger', {
                itemId: ledgerItemFilter,
                placeId: ledgerPlaceFilter,
                limit: 100,
            });
            if (res.data.success) {
                setLedgerData(res.data.result || []);
            }
        } catch (error) {
            console.error('Error fetching ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchReferenceData = async () => {
        try {
            const [itemsRes, placesRes] = await Promise.all([
                axios.post('/api/MillgetAllItems'),
                axios.post('/api/mill/places'),
            ]);
            if (itemsRes.data.success) setItems(itemsRes.data.result || []);
            if (placesRes.data.success) setPlaces(placesRes.data.result || []);
        } catch (error) {
            console.error('Error fetching reference data:', error);
        }
    };

    // Parse place breakdown string
    const parsePlaceBreakdown = (str) => {
        if (!str) return [];
        return str.split('|').map(part => {
            const [name, balance] = part.split(':');
            return { name: name || 'No Place', balance: parseFloat(balance) || 0 };
        }).filter(p => p.balance !== 0);
    };

    // Filter raw input stock records only
    const displayStock = stockData.filter(isRawInputItem);

    // ─── Stock Columns (Category & Unit removed for max space) ───────────────────
    const stockColumns = [
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            width: 120,
            render: (text) => <span className="font-mono font-semibold text-blue-500">{text}</span>,
        },
        {
            title: 'Raw Input Item',
            dataIndex: 'NAME',
            key: 'NAME',
            ellipsis: true,
        },
        {
            title: 'Total Stock',
            dataIndex: 'TOTAL_STOCK',
            key: 'TOTAL_STOCK',
            width: 160,
            render: (val, record) => (
                <span className={`font-bold text-base ${(val || 0) <= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {formatNumber(val)} {record.UNIT || 'kg'}
                </span>
            ),
        },
        {
            title: 'Stock By Place',
            dataIndex: 'PLACE_BREAKDOWN',
            key: 'PLACE_BREAKDOWN',
            responsive: ['md'],
            render: (str) => {
                const breakdown = parsePlaceBreakdown(str);
                if (breakdown.length === 0) return <span className="text-gray-400 text-xs">-</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {breakdown.map((p, i) => (
                            <Tag key={i} className="!text-xs font-medium" icon={<EnvironmentOutlined />}>
                                {p.name}: {formatNumber(p.balance)}
                            </Tag>
                        ))}
                    </div>
                );
            },
        },
    ];

    // ─── Ledger Columns ─────────────────────────────────────
    const ledgerColumns = [
        {
            title: 'Date',
            dataIndex: 'CREATED_DATE',
            key: 'CREATED_DATE',
            width: 140,
            render: (val) => toSLTime(val),
        },
        {
            title: 'Type',
            dataIndex: 'TYPE',
            key: 'TYPE',
            width: 80,
            render: (type) => (
                <Tag color={typeColorMap[type]} icon={type.includes('IN') ? <RiseOutlined /> : <FallOutlined />}>
                    {type}
                </Tag>
            ),
        },
        {
            title: 'Item',
            key: 'ITEM',
            render: (_, r) => <span>{r.ITEM_NAME} ({r.ITEM_CODE})</span>,
        },
        {
            title: 'Place',
            dataIndex: 'PLACE_NAME',
            key: 'PLACE_NAME',
            width: 120,
            responsive: ['md'],
            render: (text) => text || '-',
        },
        {
            title: 'Quantity',
            dataIndex: 'QUANTITY',
            key: 'QUANTITY',
            width: 100,
            render: (val, r) => (
                <span className={`font-semibold ${r.TYPE.includes('IN') ? 'text-green-500' : 'text-red-500'}`}>
                    {r.TYPE.includes('IN') ? '+' : '-'}{formatNumber(val)} {r.ITEM_UNIT || 'kg'}
                </span>
            ),
        },
        {
            title: 'Balance',
            dataIndex: 'BALANCE_AFTER',
            key: 'BALANCE_AFTER',
            width: 100,
            render: (val) => <span className="font-bold">{formatNumber(val)}</span>,
        },
        {
            title: 'Source',
            dataIndex: 'REFERENCE_TYPE',
            key: 'REFERENCE_TYPE',
            width: 100,
            responsive: ['lg'],
            render: (type) => <Tag>{type || '-'}</Tag>,
        },
        {
            title: 'Notes',
            dataIndex: 'NOTES',
            key: 'NOTES',
            responsive: ['lg'],
            ellipsis: true,
        },
    ];

    const tabItems = [
        {
            key: 'stock',
            label: <span><StockOutlined /> Current Stock</span>,
            children: (
                <>
                    <div className="hidden md:block">
                        <Table
                            columns={stockColumns}
                            dataSource={displayStock}
                            loading={loading}
                            rowKey="ITEM_ID"
                            pagination={false}
                            scroll={{ x: 600 }}
                            size="small"
                        />
                    </div>
                    <div className="md:hidden space-y-3 pb-20">
                        {displayStock.length === 0 ? (
                            <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                                No raw input inventory records found
                            </div>
                        ) : (
                            displayStock.map(record => {
                                const breakdown = parsePlaceBreakdown(record.PLACE_BREAKDOWN);
                                return (
                                    <div key={record.ITEM_ID} className="p-4 rounded-2xl glass-card border border-white/10 space-y-2.5">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-white text-base">{record.NAME}</div>
                                                <div className="text-xs text-blue-400 font-mono">Code: {record.CODE}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Total Stock</div>
                                                <div className={`text-base font-bold font-mono ${(record.TOTAL_STOCK || 0) <= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {formatNumber(record.TOTAL_STOCK)} {record.UNIT || 'kg'}
                                                </div>
                                            </div>
                                        </div>

                                        {breakdown.length > 0 && (
                                            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-1">
                                                {breakdown.map((p, i) => (
                                                    <Tag key={i} className="!text-[11px]" icon={<EnvironmentOutlined />}>
                                                        {p.name}: {formatNumber(p.balance)}
                                                    </Tag>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </>
            ),
        },
        {
            key: 'ledger',
            label: <span><HistoryOutlined /> Inventory Ledger</span>,
            children: (
                <>
                    <div className="flex gap-3 mb-4 flex-wrap">
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Filter by Item"
                            value={ledgerItemFilter}
                            onChange={setLedgerItemFilter}
                            className="!w-full sm:!w-48"
                            options={items.filter(i => Number(i.IS_ACTIVE) !== 0 && isRawInputItem(i)).map(i => ({ value: i.ITEM_ID, label: `${i.CODE} - ${i.NAME}` }))}
                        />
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Filter by Place"
                            value={ledgerPlaceFilter}
                            onChange={setLedgerPlaceFilter}
                            className="!w-full sm:!w-48"
                            options={places.map(p => ({ value: p.PLACE_ID, label: p.NAME }))}
                        />
                    </div>
                    <div className="hidden md:block">
                        <Table
                            columns={ledgerColumns}
                            dataSource={ledgerData}
                            loading={loading}
                            rowKey="LEDGER_ID"
                            pagination={{ pageSize: 15 }}
                            scroll={{ x: 700 }}
                            size="small"
                        />
                    </div>
                    <div className="md:hidden space-y-3 pb-20">
                        {ledgerData.length === 0 ? (
                            <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                                No ledger records found
                            </div>
                        ) : (
                            ledgerData.map(r => (
                                <div key={r.LEDGER_ID} className="p-4 rounded-2xl glass-card border border-white/10 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-white text-sm">{r.ITEM_NAME} ({r.ITEM_CODE})</div>
                                            <div className="text-xs text-gray-400">{toSLTime(r.CREATED_DATE)}</div>
                                        </div>
                                        <div>
                                            <Tag color={typeColorMap[r.TYPE]} icon={r.TYPE?.includes('IN') ? <RiseOutlined /> : <FallOutlined />}>
                                                {r.TYPE}
                                            </Tag>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                                        <span className="text-gray-400">Qty Changed:</span>
                                        <span className={`font-bold font-mono ${r.QUANTITY > 0 ? 'text-green-400' : 'text-rose-400'}`}>
                                            {r.QUANTITY > 0 ? `+${formatNumber(r.QUANTITY)}` : formatNumber(r.QUANTITY)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            ),
        },
    ];

    return (
        <div className="page-paper">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Raw Material Inventory</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Current raw input stock levels and inventory movement history</p>
                </div>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
            />
        </div>
    );
}
