import React, { useState, useEffect } from 'react';
import { Table, Tabs, Tag, Spin, Select, DatePicker, App } from 'antd';
import { StockOutlined, HistoryOutlined, EnvironmentOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import db from '../../services/db';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatNumber, formatWeight, toSLDateDisplay, toSLTime } from '../../utils/helpers';

const categoryColorMap = { raw_input: 'gold', output: 'green', by_product: 'purple', seasonal: 'orange', other: 'default' };
const typeColorMap = { IN: 'green', OUT: 'red', ADJ_IN: 'cyan', ADJ_OUT: 'volcano' };

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
            const result = await db.inventory.toArray();
            setStockData(result || []);
        } catch (error) {
            console.error('Error fetching stock:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLedger = async () => {
        setLoading(true);
        try {
            // Ledger is only fetched when online for now, fallback if offline
            if (!navigator.onLine) {
                setLedgerData([]);
                return;
            }
            
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
            const res = await axios.post(`${apiUrl}/api/mill/inventory/ledger`, {
                itemId: ledgerItemFilter,
                placeId: ledgerPlaceFilter,
                limit: 100,
            });
            if (res.data.success) {
                setLedgerData(res.data.result || []);
            }
        } catch (error) {
            console.error('Error fetching ledger:', error);
            setLedgerData([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchReferenceData = async () => {
        try {
            const itemsRes = await db.items.toArray();
            const placesRes = await db.places.toArray();
            setItems(itemsRes || []);
            setPlaces(placesRes || []);
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

    // ─── Stock Columns ──────────────────────────────────────
    const stockColumns = [
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            width: 100,
            render: (text) => <span className="font-mono font-semibold text-blue-500">{text}</span>,
        },
        {
            title: 'Item',
            dataIndex: 'NAME',
            key: 'NAME',
            ellipsis: true,
        },
        {
            title: 'Category',
            dataIndex: 'CATEGORY',
            key: 'CATEGORY',
            width: 110,
            render: (cat) => <Tag color={categoryColorMap[cat] || 'default'}>{cat || '-'}</Tag>,
        },
        {
            title: 'Unit',
            dataIndex: 'UNIT',
            key: 'UNIT',
            width: 60,
        },
        {
            title: 'Total Stock',
            dataIndex: 'TOTAL_STOCK',
            key: 'TOTAL_STOCK',
            width: 120,
            render: (val, record) => (
                <span className={`font-bold text-lg ${(val || 0) <= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {formatNumber(val)} {record.UNIT || 'kg'}
                </span>
            ),
        },
        {
            title: 'By Place',
            dataIndex: 'PLACE_BREAKDOWN',
            key: 'PLACE_BREAKDOWN',
            responsive: ['lg'],
            render: (str) => {
                const breakdown = parsePlaceBreakdown(str);
                if (breakdown.length === 0) return <span className="text-gray-400">-</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {breakdown.map((p, i) => (
                            <Tag key={i} className="!text-xs" icon={<EnvironmentOutlined />}>
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
                <Table
                    columns={stockColumns}
                    dataSource={stockData}
                    loading={loading}
                    rowKey="ITEM_ID"
                    pagination={false}
                    scroll={{ x: 600 }}
                    size="small"
                />
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
                            className="!w-48"
                            options={items.filter(i => Number(i.IS_ACTIVE) !== 0).map(i => ({ value: i.ITEM_ID, label: `${i.CODE} - ${i.NAME}` }))}
                        />
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Filter by Place"
                            value={ledgerPlaceFilter}
                            onChange={setLedgerPlaceFilter}
                            className="!w-48"
                            options={places.map(p => ({ value: p.PLACE_ID, label: p.NAME }))}
                        />
                    </div>
                    <Table
                        columns={ledgerColumns}
                        dataSource={ledgerData}
                        loading={loading}
                        rowKey="LEDGER_ID"
                        pagination={{ pageSize: 20, showSizeChanger: false }}
                        scroll={{ x: 700 }}
                        size="small"
                    />
                </>
            ),
        },
    ];

    return (
        <div className="page-paper">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inventory</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Current stock levels and inventory movement history</p>
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
