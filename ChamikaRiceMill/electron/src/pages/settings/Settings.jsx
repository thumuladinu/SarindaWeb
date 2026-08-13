import React, { useState, useEffect } from 'react';
import { 
    Card, Form, Input, Button, Tag, Alert, Row, Col, 
    Divider, Table, Select, Statistic, Space, Modal, message, Tabs, Switch
} from 'antd';
import { 
    CloudSyncOutlined, ApiOutlined, CheckCircleOutlined, 
    CloseCircleOutlined, SyncOutlined, SaveOutlined, 
    DatabaseOutlined, LinkOutlined, DeleteOutlined, ReloadOutlined,
    SettingOutlined, AppstoreOutlined, PrinterOutlined, CheckOutlined, CloseOutlined,
    BarcodeOutlined, FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import db from '../../services/db';
import syncService, { getStoredApiBase } from '../../services/syncService';
import printService from '../../services/printService';

export default function Settings() {
    const [activeTab, setActiveTab] = useState('sync');
    const [apiUrl, setApiUrl] = useState(getStoredApiBase());
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null); // { online: bool, latency: number, error: string }
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSync, setLastSync] = useState(syncService.lastSyncTime);
    const [pendingInfo, setPendingInfo] = useState({ total: 0, bills: 0, dispatch: 0, inwards: 0, returns: 0 });

    // Item mappings state
    const [mappingLoading, setMappingLoading] = useState(false);
    const [savingMapping, setSavingMapping] = useState(false);
    const [storeItems, setStoreItems] = useState([]);
    const [millItems, setMillItems] = useState([]);
    const [mappings, setMappings] = useState({});

    // Dual Printer & Auto-Print state
    const [autoPrint, setAutoPrint] = useState(printService.isAutoPrintEnabled());
    const [billPrinter, setBillPrinter] = useState(printService.getBillPrinter());
    const [labelPrinter, setLabelPrinter] = useState(printService.getLabelPrinter());
    const [printersList, setPrintersList] = useState([]);
    const [printersLoading, setPrintersLoading] = useState(false);
    const [testBillPrinting, setTestBillPrinting] = useState(false);
    const [testLabelPrinting, setTestLabelPrinting] = useState(false);

    useEffect(() => {
        loadStatus();
        fetchMappings();
        loadPrinters();


        const unsub = syncService.subscribe((event, data) => {
            if (event === 'connectionStatus') {
                setTestResult({
                    online: data.online,
                    latency: data.latency,
                    error: data.error
                });
            }
            if (event === 'syncComplete') {
                setIsSyncing(false);
                setLastSync(data?.timestamp || new Date().toISOString());
                loadStatus();
            }
            if (event === 'syncError') {
                setIsSyncing(false);
            }
            if (event === 'pendingCountChanged') {
                loadStatus();
            }
        });
        return unsub;
    }, []);

    const loadPrinters = async () => {
        setPrintersLoading(true);
        try {
            const list = await printService.getPrinters();
            setPrintersList(list || []);
        } catch (e) {
            console.error('Failed to load printers:', e);
        } finally {
            setPrintersLoading(false);
        }
    };

    const handleToggleAutoPrint = (checked) => {
        setAutoPrint(checked);
        printService.setAutoPrintEnabled(checked);
        message.success(checked ? 'Auto-Printing ENABLED (Direct Silent Print)' : 'Auto-Printing DISABLED (Manual Preview Mode)');
    };

    const handleSelectBillPrinter = (value) => {
        setBillPrinter(value);
        printService.setBillPrinter(value);
        message.success(`A5 Bill Printer set to: ${value || 'System Default'}`);
    };

    const handleSelectLabelPrinter = (value) => {
        setLabelPrinter(value);
        printService.setLabelPrinter(value);
        message.success(`60x40mm Barcode Printer set to: ${value || 'System Default'}`);
    };

    const handleTestBillPrint = async () => {
        setTestBillPrinting(true);
        try {
            const res = await printService.testPrintBill(billPrinter);
            if (res && res.success) {
                message.success(`Test receipt sent to A5 Bill printer "${res.printer || billPrinter || 'System Default'}" successfully!`);
            } else {
                message.info('Test receipt sent to bill printer.');
            }
        } catch (e) {
            message.error(`Bill test print failed: ${e.message}`);
        } finally {
            setTestBillPrinting(false);
        }
    };

    const handleTestLabelPrint = async () => {
        setTestLabelPrinting(true);
        try {
            const res = await printService.testPrintLabel(labelPrinter);
            if (res && res.success) {
                message.success(`Test label sent to 60x40mm Barcode printer "${res.printer || labelPrinter || 'System Default'}" successfully!`);
            } else {
                message.info('Test barcode label sent to printer.');
            }
        } catch (e) {
            message.error(`Label test print failed: ${e.message}`);
        } finally {
            setTestLabelPrinting(false);
        }
    };

    const loadStatus = async () => {
        const info = await syncService.getPendingBreakdown();
        setPendingInfo(info);
        setLastSync(syncService.lastSyncTime);
    };

    // Test API Connection
    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await syncService.setApiUrl(apiUrl);
            setTestResult(res);
            if (res.online) {
                message.success(`Connected to backend! Latency: ${res.latency}ms`);
            } else {
                message.error(`Cannot connect to backend: ${res.error || 'Server offline'}`);
            }
        } catch (e) {
            setTestResult({ online: false, error: e.message });
            message.error(`Connection failed: ${e.message}`);
        } finally {
            setTesting(false);
        }
    };

    const handleSaveApiUrl = async () => {
        syncService.setApiUrl(apiUrl);
        message.success('API URL saved!');
        handleTestConnection();
    };

    const handleForceSync = async () => {
        setIsSyncing(true);
        const ok = await syncService.syncAll();
        setIsSyncing(false);
        if (ok) {
            message.success('Synchronization completed successfully!');
        } else {
            message.error('Sync failed or server is unreachable.');
        }
    };

    // Clear local synced records older than 30 days
    const handlePurgeOldCache = async () => {
        Modal.confirm({
            title: 'Clean Old Synced Cache?',
            content: 'This will remove local synced records older than 30 days. Unsynced offline drafts will NEVER be touched.',
            okText: 'Clean Cache',
            okType: 'primary',
            onOk: async () => {
                await syncService.cleanupOldSyncedData();
                await loadStatus();
                message.success('Cache cleaned successfully.');
            }
        });
    };

    // Fetch store-mill item mappings
    const fetchMappings = async () => {
        setMappingLoading(true);
        try {
            const baseUrl = syncService.apiBase;
            const [storeRes, millRes, mappingRes] = await Promise.all([
                axios.post(`${baseUrl}/api/getAllItems`, {}, { timeout: 5000 }).catch(() => ({ data: { success: false } })),
                axios.post(`${baseUrl}/api/MillgetAllItems`, {}, { timeout: 5000 }).catch(() => ({ data: { success: false } })),
                axios.get(`${baseUrl}/api/mill/settings/item-mappings`, { timeout: 5000 }).catch(() => ({ data: { success: false } }))
            ]);

            if (storeRes.data?.success) setStoreItems(storeRes.data.result || []);
            if (millRes.data?.success) setMillItems(millRes.data.result || []);
            if (mappingRes.data?.success) {
                const mapData = {};
                (mappingRes.data.mappings || []).forEach(m => {
                    mapData[m.STORE_ITEM_ID] = m.MILL_ITEM_ID;
                });
                setMappings(mapData);
            }
        } catch (err) {
            console.warn('Mapping fetch warning:', err.message);
        } finally {
            setMappingLoading(false);
        }
    };

    const handleSaveMappings = async () => {
        setSavingMapping(true);
        try {
            const baseUrl = syncService.apiBase;
            const mappingsToSave = Object.keys(mappings)
                .filter(key => mappings[key])
                .map(key => ({
                    STORE_ITEM_ID: parseInt(key),
                    MILL_ITEM_ID: parseInt(mappings[key])
                }));

            const res = await axios.post(`${baseUrl}/api/mill/settings/item-mappings`, { mappings: mappingsToSave });
            if (res.data?.success) {
                message.success('Item mappings saved successfully');
                if (syncService.isOnline) {
                    syncService.pullReferenceData();
                }
            } else {
                message.error(res.data?.message || 'Failed to save mappings');
            }
        } catch (err) {
            message.error(`Failed to save mappings: ${err.message}`);
        } finally {
            setSavingMapping(false);
        }
    };

    const mappingColumns = [
        {
            title: 'Store Item',
            dataIndex: 'NAME',
            key: 'NAME',
            render: (text, record) => (
                <div>
                    <span className="font-semibold text-slate-800">{text}</span>
                    <div className="text-xs text-slate-400 font-mono">Code: {record.SYSTEM_CODE || record.CODE || 'N/A'}</div>
                </div>
            )
        },
        {
            title: 'Mapped Mill Item',
            key: 'MILL_ITEM',
            render: (_, record) => (
                <Select
                    showSearch
                    allowClear
                    placeholder="Select Mill Item"
                    className="w-full"
                    optionFilterProp="children"
                    value={mappings[record.ITEM_ID]}
                    onChange={(val) => setMappings(prev => ({ ...prev, [record.ITEM_ID]: val }))}
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
            width: 120,
            render: (_, record) => {
                const isMapped = !!mappings[record.ITEM_ID];
                return isMapped ? <Tag color="green">Mapped</Tag> : <Tag color="default">Unmapped</Tag>;
            }
        }
    ];

    const tabItems = [
        {
            key: 'sync',
            label: (
                <span className="flex items-center gap-1.5 font-bold text-sm">
                    <CloudSyncOutlined />
                    Backend Server & Sync
                </span>
            ),
            children: (
                <div className="space-y-6 pt-2">
                    {/* Live Connection Card */}
                    <Card 
                        className="shadow-sm border-blue-100 rounded-2xl overflow-hidden"
                        title={
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 font-black text-slate-800">
                                    <ApiOutlined className="text-blue-600" />
                                    Backend API Server URL
                                </span>
                                <Tag 
                                    color={syncService.isOnline ? 'success' : 'error'} 
                                    className="px-2.5 py-0.5 text-xs font-bold rounded-full uppercase"
                                >
                                    {syncService.isOnline ? `Online (${syncService.latency || 0}ms)` : 'Server Offline'}
                                </Tag>
                            </div>
                        }
                    >
                        <p className="text-xs text-slate-500 mb-4">
                            Configure the local or network IP/port of the SarindaWeb backend. The app constantly checks connection health and automatically synchronizes when online.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-2 mb-3">
                            <Input
                                prefix={<LinkOutlined className="text-slate-400" />}
                                value={apiUrl}
                                onChange={(e) => setApiUrl(e.target.value)}
                                placeholder="http://localhost:3001"
                                className="h-11 font-mono text-sm rounded-xl flex-1"
                            />
                            <Button 
                                onClick={handleTestConnection} 
                                loading={testing}
                                className="h-11 px-5 rounded-xl font-bold border-blue-300 text-blue-700 hover:bg-blue-50"
                            >
                                Test Connection
                            </Button>
                            <Button 
                                type="primary" 
                                icon={<SaveOutlined />} 
                                onClick={handleSaveApiUrl}
                                className="h-11 px-6 rounded-xl font-bold bg-blue-600 hover:bg-blue-700"
                            >
                                Save & Connect
                            </Button>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="text-xs text-slate-400 font-medium">Quick presets:</span>
                            {[
                                { label: 'Default (Port 3001)', url: 'http://localhost:3001' },
                                { label: 'Port 5000', url: 'http://localhost:5000' },
                                { label: 'LAN IP (Sample)', url: 'http://192.168.8.100:3001' }
                            ].map(preset => (
                                <button
                                    key={preset.url}
                                    type="button"
                                    onClick={() => {
                                        setApiUrl(preset.url);
                                    }}
                                    className="px-2.5 py-1 text-xs font-mono bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-slate-600 border border-slate-200 transition-all cursor-pointer"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        {/* Connection Test Result Box */}
                        {testResult && (
                            <Alert
                                type={testResult.online ? 'success' : 'error'}
                                showIcon
                                icon={testResult.online ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                                message={
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold">
                                            {testResult.online ? 'Backend Server Reachable' : 'Backend Server Unreachable'}
                                        </span>
                                        {testResult.online && (
                                            <span className="font-mono text-emerald-800">Latency: {testResult.latency} ms</span>
                                        )}
                                    </div>
                                }
                                description={
                                    testResult.online ? (
                                        <div className="text-xs mt-1 text-emerald-700">
                                            Health endpoint <code>{apiUrl}/api/health</code> responded with status OK. Offline synchronization is fully active.
                                        </div>
                                    ) : (
                                        <div className="text-xs mt-1 text-rose-700">
                                            {testResult.error || 'Connection refused. Ensure the backend (node index.js) is started on this address.'}
                                        </div>
                                    )
                                }
                                className="rounded-xl mt-2"
                            />
                        )}
                    </Card>

                    {/* Sync Diagnostics & Queue Card */}
                    <Card 
                        className="shadow-sm border-slate-200 rounded-2xl"
                        title={
                            <span className="font-black text-slate-800 flex items-center gap-2">
                                <CloudSyncOutlined className="text-blue-600" />
                                Offline Synchronization Diagnostics
                            </span>
                        }
                        extra={
                            <Button
                                type="primary"
                                icon={<SyncOutlined spin={isSyncing} />}
                                onClick={handleForceSync}
                                loading={isSyncing}
                                className="bg-blue-600 hover:bg-blue-700 font-bold rounded-xl"
                            >
                                Force Sync Now
                            </Button>
                        }
                    >
                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={6}>
                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center">
                                    <div className="text-xs text-slate-500 font-bold uppercase">Total Pending Offline</div>
                                    <div className={`text-2xl font-black mt-1 ${pendingInfo.total > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {pendingInfo.total}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">Records queued for cloud</div>
                                </div>
                            </Col>
                            <Col xs={12} sm={4}>
                                <div className="bg-white border border-slate-100 p-3 rounded-xl text-center">
                                    <div className="text-[11px] text-slate-400 font-bold uppercase">Sales Bills</div>
                                    <div className="text-lg font-black text-slate-800 mt-1">{pendingInfo.bills}</div>
                                </div>
                            </Col>
                            <Col xs={12} sm={4}>
                                <div className="bg-white border border-slate-100 p-3 rounded-xl text-center">
                                    <div className="text-[11px] text-slate-400 font-bold uppercase">Dispatch Notes</div>
                                    <div className="text-lg font-black text-slate-800 mt-1">{pendingInfo.dispatch}</div>
                                </div>
                            </Col>
                            <Col xs={12} sm={4}>
                                <div className="bg-white border border-slate-100 p-3 rounded-xl text-center">
                                    <div className="text-[11px] text-slate-400 font-bold uppercase">Stock Inwards</div>
                                    <div className="text-lg font-black text-slate-800 mt-1">{pendingInfo.inwards}</div>
                                </div>
                            </Col>
                            <Col xs={12} sm={6}>
                                <div className="bg-white border border-slate-100 p-3 rounded-xl text-center">
                                    <div className="text-[11px] text-slate-400 font-bold uppercase">Sales Returns</div>
                                    <div className="text-lg font-black text-slate-800 mt-1">{pendingInfo.returns}</div>
                                </div>
                            </Col>
                        </Row>

                        <Divider className="my-4" />

                        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                            <div>
                                <span>Last Synced: </span>
                                <span className="font-bold text-slate-700">
                                    {lastSync ? dayjs(lastSync).format('YYYY-MM-DD hh:mm:ss A') : 'Never (Offline)'}
                                </span>
                            </div>
                            <Button 
                                icon={<DeleteOutlined />} 
                                onClick={handlePurgeOldCache}
                                size="small"
                                className="text-slate-600 rounded-lg text-xs"
                            >
                                Purge 30-Day Old Cache
                            </Button>
                        </div>
                    </Card>
                </div>
            )
        },
        {
            key: 'mappings',
            label: (
                <span className="flex items-center gap-1.5 font-bold text-sm">
                    <AppstoreOutlined />
                    Store-to-Mill Item Mappings
                </span>
            ),
            children: (
                <div className="pt-2">
                    <Card 
                        className="shadow-sm border-slate-200 rounded-2xl"
                        title={
                            <span className="font-black text-slate-800">
                                Store to Mill Item Mapping
                            </span>
                        }
                        extra={
                            <Space>
                                <Button 
                                    icon={<ReloadOutlined />} 
                                    onClick={fetchMappings} 
                                    loading={mappingLoading}
                                    className="rounded-xl"
                                >
                                    Refresh
                                </Button>
                                <Button 
                                    type="primary" 
                                    icon={<SaveOutlined />} 
                                    onClick={handleSaveMappings} 
                                    loading={savingMapping}
                                    className="bg-blue-600 hover:bg-blue-700 font-bold rounded-xl"
                                >
                                    Save Mappings
                                </Button>
                            </Space>
                        }
                    >
                        <p className="text-xs text-slate-500 mb-4">
                            Map items from the Store system to items in the Mill system. This is required for store transfers to be automatically accepted into the mill's inventory.
                        </p>
                        <Table
                            dataSource={storeItems}
                            columns={mappingColumns}
                            rowKey="ITEM_ID"
                            loading={mappingLoading}
                            pagination={{ pageSize: 15 }}
                            size="small"
                            className="border border-slate-100 rounded-xl overflow-hidden"
                        />
                    </Card>
                </div>
            )
        },
        {
            key: 'printer',
            label: (
                <span className="flex items-center gap-1.5 font-bold text-sm">
                    <PrinterOutlined />
                    Printer & Auto-Print
                </span>
            ),
            children: (
                <div className="space-y-6 pt-2">
                    <Card 
                        className="shadow-sm border-slate-200 rounded-2xl overflow-hidden"
                        title={
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 font-black text-slate-800">
                                    <PrinterOutlined className="text-blue-600" />
                                    Dual Dedicated Printer Configuration (A5 Bills & 60x40mm Barcodes)
                                </span>
                                <Tag 
                                    color={autoPrint ? 'success' : 'default'} 
                                    className="px-2.5 py-0.5 text-xs font-bold rounded-full uppercase"
                                >
                                    {autoPrint ? 'Direct Auto-Print ACTIVE' : 'Manual Mode'}
                                </Tag>
                            </div>
                        }
                    >
                        <div className="space-y-6">
                            {/* Auto Print Master Switch & Refresh */}
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <div className="font-bold text-slate-900 text-sm mb-0.5 flex items-center gap-2">
                                        <span>Automatic Direct Silent Printing</span>
                                        {autoPrint ? (
                                            <Tag color="green" className="font-bold text-xs">ENABLED</Tag>
                                        ) : (
                                            <Tag color="orange" className="font-bold text-xs">DISABLED</Tag>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 max-w-xl">
                                        When enabled, sales bills, quick POS orders, and dispatch gate passes route silently to your <strong>A5 Bill Printer</strong>, while bag barcode labels route directly to your <strong>60x40mm Barcode Printer</strong> without opening print dialogs.
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button 
                                        size="small" 
                                        icon={<ReloadOutlined />} 
                                        onClick={loadPrinters} 
                                        loading={printersLoading}
                                    >
                                        Refresh Printers ({printersList.length})
                                    </Button>
                                    <Switch 
                                        checked={autoPrint}
                                        onChange={handleToggleAutoPrint}
                                        checkedChildren="ON"
                                        unCheckedChildren="OFF"
                                        className="scale-125"
                                    />
                                </div>
                            </div>

                            {/* Dual Printer Selector Grid */}
                            <Row gutter={[16, 16]}>
                                {/* Printer 1: A5 Bill Printer */}
                                <Col span={24} md={12}>
                                    <div className="p-5 bg-white border border-blue-100 rounded-xl shadow-sm space-y-4 h-full flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-1">
                                                <FileTextOutlined className="text-blue-600 text-base" />
                                                <span>1. Bill & Document Printer (A5 Size Pages)</span>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-3">
                                                Target printer for Sales Invoices, Quick POS Receipts, and Dispatch Gate Passes.
                                            </p>
                                            <Select 
                                                className="w-full"
                                                size="large"
                                                value={billPrinter || ''}
                                                onChange={handleSelectBillPrinter}
                                                placeholder="Select A5 Bill printer"
                                            >
                                                <Select.Option value="">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-semibold text-slate-800">System Default Printer (Auto Detect)</span>
                                                        <Tag color="blue">Default</Tag>
                                                    </div>
                                                </Select.Option>
                                                {printersList.map(p => (
                                                    <Select.Option key={p.name} value={p.name}>
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-semibold text-slate-800">{p.displayName || p.name}</span>
                                                            <div className="flex gap-1">
                                                                {p.isDefault && <Tag color="blue">Default</Tag>}
                                                                <Tag color="green">Ready</Tag>
                                                            </div>
                                                        </div>
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-[11px] text-slate-400 font-medium">Page Size: A5 Portrait</span>
                                            <Button 
                                                type="primary" 
                                                size="small"
                                                icon={<FileTextOutlined />} 
                                                onClick={handleTestBillPrint} 
                                                loading={testBillPrinting}
                                                className="!bg-blue-600 font-bold"
                                            >
                                                Test Bill Printer
                                            </Button>
                                        </div>
                                    </div>
                                </Col>

                                {/* Printer 2: 60x40mm Barcode Sticker Printer */}
                                <Col span={24} md={12}>
                                    <div className="p-5 bg-white border border-emerald-100 rounded-xl shadow-sm space-y-4 h-full flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-1">
                                                <BarcodeOutlined className="text-emerald-600 text-base" />
                                                <span>2. Barcode & Sticker Printer (60×40mm Prints)</span>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-3">
                                                Target printer for Rice Bag Sticker Labels and Barcode Tag prints.
                                            </p>
                                            <Select 
                                                className="w-full"
                                                size="large"
                                                value={labelPrinter || ''}
                                                onChange={handleSelectLabelPrinter}
                                                placeholder="Select Barcode Sticker printer"
                                            >
                                                <Select.Option value="">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-semibold text-slate-800">System Default Printer (Auto Detect)</span>
                                                        <Tag color="blue">Default</Tag>
                                                    </div>
                                                </Select.Option>
                                                {printersList.map(p => (
                                                    <Select.Option key={p.name} value={p.name}>
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-semibold text-slate-800">{p.displayName || p.name}</span>
                                                            <div className="flex gap-1">
                                                                {p.isDefault && <Tag color="blue">Default</Tag>}
                                                                <Tag color="green">Ready</Tag>
                                                            </div>
                                                        </div>
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-[11px] text-slate-400 font-medium">Sticker Size: 60mm × 40mm</span>
                                            <Button 
                                                type="primary" 
                                                size="small"
                                                icon={<BarcodeOutlined />} 
                                                onClick={handleTestLabelPrint} 
                                                loading={testLabelPrinting}
                                                className="!bg-emerald-600 font-bold"
                                            >
                                                Test Barcode Printer
                                            </Button>
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            {/* Status Info Box */}
                            {autoPrint ? (
                                <Alert 
                                    type="success" 
                                    showIcon 
                                    message={<span className="font-bold text-emerald-900">Direct Auto-Printing Mode Active</span>}
                                    description={
                                        <div className="text-xs text-emerald-800 space-y-1 mt-1">
                                            <div>• <strong>Bills, POS Receipts & Gate Passes (A5):</strong> Automatically sent to <strong>{billPrinter || 'System Default Printer'}</strong>.</div>
                                            <div>• <strong>Bag Barcode Stickers (60x40mm):</strong> Automatically sent to <strong>{labelPrinter || 'System Default Printer'}</strong>.</div>
                                        </div>
                                    }
                                />
                            ) : (
                                <Alert 
                                    type="info" 
                                    showIcon 
                                    message={<span className="font-bold text-blue-900">Manual Print Preview Mode</span>}
                                    description={
                                        <span className="text-xs text-blue-800">
                                            Auto-print is disabled. Print actions will present a print dialog or preview modal before sending to physical hardware printers.
                                        </span>
                                    }
                                />
                            )}
                        </div>
                    </Card>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 rounded-2xl shadow-sm flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-white m-0 flex items-center gap-2.5">
                        <SettingOutlined />
                        System & Sync Settings
                    </h1>
                    <p className="text-blue-100 text-xs mt-1 m-0">
                        Configure local server connection, offline synchronization, and item relations.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Tag 
                        color={syncService.isOnline ? 'success' : 'error'}
                        className="px-3 py-1 text-xs font-bold rounded-xl"
                    >
                        {syncService.isOnline ? '🟢 Connected to Server' : '🔴 Server Offline'}
                    </Tag>
                </div>
            </div>

            {/* Tabs */}
            <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab} 
                items={tabItems}
                type="card"
                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80"
            />
        </div>
    );
}
