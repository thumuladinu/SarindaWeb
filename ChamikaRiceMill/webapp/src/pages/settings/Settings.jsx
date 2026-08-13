import React, { useState, useEffect } from 'react';
import { Card, Table, Select, Button, Tag, App } from 'antd';
import { SaveOutlined, SyncOutlined } from '@ant-design/icons';
import axios from 'axios';

export default function Settings() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [storeItems, setStoreItems] = useState([]);
    const [millItems, setMillItems] = useState([]);
    const [mappings, setMappings] = useState({}); // { storeItemId: millItemId }

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch Store Items, Mill Items, and Mappings
            const [storeRes, millRes, mappingRes] = await Promise.all([
                axios.post(`/api/getAllItems`), // Endpoint for store items
                axios.post(`/api/MillgetAllItems`), // Endpoint for mill items
                axios.get(`/api/mill/settings/item-mappings`) // Existing mappings
            ]);

            if (storeRes.data.success) {
                setStoreItems(storeRes.data.result || []);
            }
            if (millRes.data.success) {
                setMillItems(millRes.data.result || []);
            }
            if (mappingRes.data.success) {
                const mapData = {};
                (mappingRes.data.mappings || []).forEach(m => {
                    mapData[m.STORE_ITEM_ID] = m.MILL_ITEM_ID;
                });
                setMappings(mapData);
            }
        } catch (error) {
            console.error('Error fetching mapping data:', error);
            message.error('Failed to load item mappings.');
        } finally {
            setLoading(false);
        }
    };

    const handleMappingChange = (storeItemId, millItemId) => {
        setMappings(prev => ({
            ...prev,
            [storeItemId]: millItemId
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const mappingsToSave = Object.keys(mappings)
                .filter(key => mappings[key]) // only keep valid mappings
                .map(key => ({
                    STORE_ITEM_ID: parseInt(key),
                    MILL_ITEM_ID: parseInt(mappings[key])
                }));

            const res = await axios.post(`/api/mill/settings/item-mappings`, { mappings: mappingsToSave });
            
            if (res.data.success) {
                message.success('Item mappings saved successfully');
            } else {
                message.error(res.data.message || 'Failed to save mappings');
            }
        } catch (error) {
            console.error('Error saving mappings:', error);
            message.error('Failed to save mappings');
        } finally {
            setSaving(false);
        }
    };

    const columns = [
        {
            title: 'Store Item',
            dataIndex: 'NAME',
            key: 'NAME',
            render: (text, record) => (
                <div>
                    <span className="font-semibold">{text}</span>
                    <br />
                    <span className="text-xs text-gray-400">Code: {record.SYSTEM_CODE || record.CODE || 'N/A'}</span>
                </div>
            )
        },
        {
            title: 'Mapped Mill Item',
            key: 'MILL_ITEM',
            width: 300,
            render: (_, record) => (
                <Select
                    showSearch
                    allowClear
                    placeholder="Select Mill Item"
                    className="w-full"
                    optionFilterProp="children"
                    value={mappings[record.ITEM_ID]}
                    onChange={(val) => handleMappingChange(record.ITEM_ID, val)}
                >
                    {millItems.map(item => (
                        <Select.Option key={item.ITEM_ID} value={item.ITEM_ID}>
                            {item.NAME} ({item.SYSTEM_CODE || item.CODE})
                        </Select.Option>
                    ))}
                </Select>
            )
        },
        {
            title: 'Status',
            key: 'STATUS',
            width: 150,
            render: (_, record) => {
                const isMapped = !!mappings[record.ITEM_ID];
                return isMapped ? <Tag color="green">Mapped</Tag> : <Tag color="default">Unmapped</Tag>;
            }
        }
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-white/10">
                <div>
                    <h3 className="text-base font-bold text-white m-0">Store to Mill Item Mapping</h3>
                    <p className="text-xs text-gray-400 m-0 mt-0.5">Map Store system items to Mill system items for store transfers.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button icon={<SyncOutlined />} onClick={fetchData} loading={loading} className="rounded-xl h-10 text-xs sm:text-sm flex-1 sm:flex-initial">
                        Refresh
                    </Button>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} className="rounded-xl h-10 font-bold text-xs sm:text-sm shadow-md flex-1 sm:flex-initial">
                        Save Mappings
                    </Button>
                </div>
            </div>

            <div>
                {/* Desktop Table View */}
                <div className="hidden md:block">
                    <Table
                        dataSource={storeItems}
                        columns={columns}
                        rowKey="ITEM_ID"
                        loading={loading}
                        pagination={{ pageSize: 20 }}
                        size="small"
                    />
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden space-y-3 pb-16">
                    {storeItems.map((record) => {
                        const isMapped = !!mappings[record.ITEM_ID];
                        return (
                            <div key={record.ITEM_ID} className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-bold text-white text-base">{record.NAME}</div>
                                        <div className="text-xs text-gray-400 font-mono">Store Code: {record.CODE}</div>
                                    </div>
                                    <div>
                                        {isMapped ? <Tag color="green">Mapped</Tag> : <Tag color="default">Unmapped</Tag>}
                                    </div>
                                </div>

                                <div className="space-y-1 text-xs">
                                    <span className="text-gray-400 block text-[10px]">Maps to Mill Item:</span>
                                    <Select
                                        showSearch
                                        placeholder="Select Mill Item to map..."
                                        className="w-full"
                                        value={mappings[record.ITEM_ID] || undefined}
                                        onChange={(val) => handleMappingChange(record.ITEM_ID, val)}
                                        allowClear
                                        optionFilterProp="children"
                                    >
                                        {millItems.map(m => (
                                            <Select.Option key={m.ITEM_ID} value={m.ITEM_ID}>
                                                {m.CODE} - {m.NAME} ({m.CATEGORY})
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
