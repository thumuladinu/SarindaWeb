import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    Table, Button, Input, Form, Drawer, Switch, App, Popconfirm,
    Tag, Tooltip, Spin, Modal, Drawer as AntDrawer, Badge
} from 'antd';
import {
    PlusOutlined, ReloadOutlined, CopyOutlined,
    WifiOutlined, DisconnectOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useStores, STORE_COLOR_OPTIONS } from '../../contexts/StoresContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');

// ─── Color Picker ─────────────────────────────────────────────────────────────
const ColorPicker = ({ value, onChange }) => (
    <div className="flex gap-3 flex-wrap">
        {STORE_COLOR_OPTIONS.map(c => (
            <button
                key={c.key}
                type="button"
                onClick={() => onChange(c.key)}
                className={`w-9 h-9 rounded-full border-4 transition-all ${value === c.key ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ background: c.hex }}
                title={c.label}
            />
        ))}
    </div>
);

// ─── Terminal list drawer ──────────────────────────────────────────────────────
const TerminalList = ({ storeNo, storeName, open, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [dbTerminals, setDbTerminals] = useState([]);
    const [liveTerminals, setLiveTerminals] = useState([]);
    const socketRef = useRef(null);

    // Load DB history
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        axios.get(`/api/stores/${storeNo}/terminals?days=30`)
            .then(r => { if (r.data.success) setDbTerminals(r.data.terminals || []); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [open, storeNo]);

    // Connect socket for real-time live terminals
    useEffect(() => {
        if (!open) {
            if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
            setLiveTerminals([]);
            return;
        }
        const sock = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
        socketRef.current = sock;
        sock.on('connect', () => sock.emit('admin:get_terminals'));
        sock.on('admin:terminals_update', (all) => {
            setLiveTerminals((all || []).filter(t => String(t.storeNo) === String(storeNo)));
        });
        return () => { sock.disconnect(); socketRef.current = null; };
    }, [open, storeNo]);

    // Merge: live terminals override DB "isActive" and "cashier"
    const liveMap = Object.fromEntries(liveTerminals.map(t => [t.terminalId, t]));
    const merged = dbTerminals.map(t => liveMap[t.terminalId]
        ? { ...t, isActive: 1, cashier: liveMap[t.terminalId].cashier, live: true }
        : t
    );
    // Add any live terminals not yet in DB history (brand-new terminal, not yet persisted)
    liveTerminals.forEach(lt => {
        if (!merged.find(m => m.terminalId === lt.terminalId)) {
            merged.unshift({ terminalId: lt.terminalId, type: lt.type, cashier: lt.cashier, isActive: 1, lastSeen: lt.connectedAt, live: true });
        }
    });
    merged.sort((a, b) => (b.isActive || 0) - (a.isActive || 0));

    return (
        <AntDrawer title={`Terminals — ${storeName}`} open={open} onClose={onClose} width={420}>
            {/* Live count badge */}
            <div className="flex items-center gap-2 mb-4 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span>{liveTerminals.length} online now</span>
                <span>·</span>
                <span>{merged.length} seen in last 30 days</span>
            </div>

            {loading && <div className="flex justify-center p-8"><Spin /></div>}
            {!loading && merged.length === 0 && (
                <p className="text-gray-400 text-center py-8">No terminals seen in last 30 days</p>
            )}
            {!loading && merged.map(t => (
                <div key={t.terminalId} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-white/5 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                        <div className="font-mono font-bold text-sm truncate">{t.terminalId}</div>
                        <div className="text-xs text-gray-400">
                            {t.type || 'POS'} · {t.cashier || '—'} · {t.lastSeen ? dayjs(t.lastSeen).fromNow() : '—'}
                        </div>
                    </div>
                    <Tag color={t.isActive ? 'success' : 'default'}>{t.isActive ? 'Online' : 'Offline'}</Tag>
                </div>
            ))}
        </AntDrawer>
    );
};

// ─── Main component ────────────────────────────────────────────────────────────
export default function Stores() {
    const { message } = App.useApp();
    const { stores: ctxStores, refresh: refreshCtx } = useStores();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [terminalStore, setTerminalStore] = useState(null);
    const [form] = Form.useForm();

    const fetchStores = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/stores?includeInactive=1');
            if (res.data.success) setData(res.data.stores || []);
            else message.error('Failed to load stores');
        } catch { message.error('Network error loading stores'); }
        finally { setLoading(false); }
    }, [message]);

    useEffect(() => { fetchStores(); }, [fetchStores]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        const used = new Set(data.map(s => s.STORE_NO));
        let next = 1;
        while (used.has(next) || next === 2) next += 1;
        form.setFieldsValue({ STORE_NO: next, IS_ACTIVE: true, IS_WEIGHING_STATION: false, COLOR: 'blue' });
        setDrawerOpen(true);
    };

    const openEdit = (record) => {
        setEditing(record);
        form.setFieldsValue({
            STORE_NO: record.STORE_NO,
            NAME: record.NAME,
            ADDRESS: record.ADDRESS || '',
            IS_ACTIVE: !!record.IS_ACTIVE,
            COLOR: record.COLOR || 'blue',
            TRANSFER_ENABLED: record.TRANSFER_ENABLED !== 0,
            QR_ENABLED: record.QR_ENABLED !== 0,
        });
        setDrawerOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            if (editing) {
                const res = await axios.patch(`/api/stores/${editing.STORE_NO}`, {
                    name: values.NAME,
                    address: values.ADDRESS,
                    isActive: values.IS_ACTIVE,
                    color: values.COLOR,
                    transferEnabled: values.TRANSFER_ENABLED,
                    qrEnabled: values.QR_ENABLED,
                });
                if (res.data.success) {
                    message.success('Store updated');
                    setDrawerOpen(false);
                    fetchStores();
                    refreshCtx();
                } else { message.error(res.data.message || 'Update failed'); }
            } else {
                const res = await axios.post('/api/stores', {
                    storeNo: values.STORE_NO,
                    name: values.NAME,
                    address: values.ADDRESS,
                    isWeighingStation: !!values.IS_WEIGHING_STATION,
                    color: values.COLOR,
                });
                if (res.data.success) {
                    message.success(`Store created`);
                    setDrawerOpen(false);
                    fetchStores();
                    refreshCtx();
                    Modal.info({
                        title: `Store ${res.data.store.STORE_NO} — ${res.data.store.NAME}`,
                        content: (
                            <div>
                                <p>Share this code with the POS installer:</p>
                                <h2 style={{ letterSpacing: '0.4em', textAlign: 'center', fontFamily: 'monospace', fontSize: 28, margin: '12px 0' }}>
                                    {res.data.store.STORE_CODE}
                                </h2>
                                <p style={{ color: '#888', fontSize: 12 }}>
                                    Code can be regenerated anytime from the Stores list.
                                </p>
                            </div>
                        ),
                    });
                } else { message.error(res.data.message || 'Create failed'); }
            }
        } catch (err) {
            if (err?.errorFields) return;
            message.error(err?.response?.data?.message || 'Save failed');
        } finally { setSubmitting(false); }
    };

    const handleRegenerate = async (record) => {
        try {
            const res = await axios.post(`/api/stores/${record.STORE_NO}/regenerate-code`);
            if (res.data.success) {
                message.success('Code regenerated');
                Modal.info({
                    title: `New code for ${record.NAME}`,
                    content: (
                        <h2 style={{ letterSpacing: '0.4em', textAlign: 'center', fontFamily: 'monospace', fontSize: 28 }}>
                            {res.data.storeCode}
                        </h2>
                    ),
                });
                fetchStores();
            } else { message.error(res.data.message || 'Failed'); }
        } catch { message.error('Regenerate failed'); }
    };

    const copyCode = (code) => {
        navigator.clipboard.writeText(code)
            .then(() => message.success('Copied'))
            .catch(() => message.error('Copy failed'));
    };

    // ── Desktop columns ──────────────────────────────────────────────────────
    const columns = [
        { title: 'S#', dataIndex: 'STORE_NO', key: 'STORE_NO', width: 70 },
        {
            title: 'Name', dataIndex: 'NAME', key: 'NAME',
            render: (name, record) => (
                <div className="flex items-center gap-2">
                    <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: STORE_COLOR_OPTIONS.find(c => c.key === (record.COLOR || 'blue'))?.hex || '#3b82f6' }}
                    />
                    <span className="font-semibold">{name}</span>
                </div>
            )
        },
        { title: 'Address', dataIndex: 'ADDRESS', key: 'ADDRESS', render: v => v || '—' },
        {
            title: 'Code', dataIndex: 'STORE_CODE', key: 'STORE_CODE',
            render: (code) => (
                <span className="font-mono text-sm tracking-widest">
                    {code}
                    <Tooltip title="Copy"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyCode(code)} /></Tooltip>
                </span>
            ),
        },
        {
            title: 'Type', key: 'TYPE',
            render: (_, r) => r.IS_WEIGHING_STATION ? <Tag color="purple">⚖️ Weighing</Tag> : <Tag color="blue">🏪 POS</Tag>,
        },
        {
            title: 'Status', key: 'STATUS',
            render: (_, r) => r.IS_ACTIVE ? <Tag color="success">Active</Tag> : <Tag color="error">Inactive</Tag>,
        },
        {
            title: 'Transfer',
            key: 'TRANSFER',
            align: 'center',
            render: (_, r) => {
                if (r.IS_WEIGHING_STATION) return <Tag color="default">—</Tag>;
                const enabled = r.TRANSFER_ENABLED !== 0;
                return (
                    <Tooltip title={enabled ? 'Transfer enabled — click to disable' : 'Transfer disabled — click to enable'}>
                        <Switch
                            size="small"
                            checked={enabled}
                            checkedChildren="📥 On"
                            unCheckedChildren="Off"
                            onChange={async (val) => {
                                try {
                                    const res = await axios.patch(`/api/stores/${r.STORE_NO}`, { transferEnabled: val });
                                    if (res.data.success) { fetchStores(); refreshCtx(); }
                                    else message.error('Failed to update');
                                } catch { message.error('Network error'); }
                            }}
                        />
                    </Tooltip>
                );
            },
        },
        {
            title: 'QR Scan',
            key: 'QR',
            align: 'center',
            render: (_, r) => {
                if (r.IS_WEIGHING_STATION) return <Tag color="default">—</Tag>;
                const enabled = r.QR_ENABLED !== 0;
                return (
                    <Tooltip title={enabled ? 'QR scan enabled — click to disable' : 'QR scan disabled — click to enable'}>
                        <Switch
                            size="small"
                            checked={enabled}
                            checkedChildren="📷 On"
                            unCheckedChildren="Off"
                            onChange={async (val) => {
                                try {
                                    const res = await axios.patch(`/api/stores/${r.STORE_NO}`, { qrEnabled: val });
                                    if (res.data.success) { fetchStores(); refreshCtx(); }
                                    else message.error('Failed to update');
                                } catch { message.error('Network error'); }
                            }}
                        />
                    </Tooltip>
                );
            },
        },
        {
            title: 'Actions', key: 'ACTIONS',
            render: (_, record) => {
                const isWeighing = !!record.IS_WEIGHING_STATION;
                return (
                    <div className="flex items-center gap-1">
                        <Tooltip title={isWeighing ? 'Weighing station cannot be modified' : 'Edit'}>
                            <Button
                                type="link" size="small"
                                disabled={isWeighing}
                                onClick={() => !isWeighing && openEdit(record)}
                            >Edit</Button>
                        </Tooltip>
                        {!isWeighing && (
                            <Popconfirm
                                title="Regenerate store code?"
                                description="The current code will stop working immediately."
                                onConfirm={() => handleRegenerate(record)}
                            >
                                <Button type="link" size="small" icon={<ReloadOutlined />}>Regen Code</Button>
                            </Popconfirm>
                        )}
                        <Button
                            type="link" size="small"
                            icon={<WifiOutlined />}
                            onClick={() => setTerminalStore(record)}
                        >Terminals</Button>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="hidden md:block">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white m-0">Stores</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Manage store locations and POS binding codes</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Store</Button>
            </div>

            {/* Desktop Table */}
            <Spin spinning={loading}>
                <div className="hidden md:block glass-card rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5">
                    <Table
                        rowKey="STORE_NO"
                        dataSource={data}
                        columns={columns}
                        pagination={false}
                        rowClassName={(r) => r.IS_WEIGHING_STATION ? 'opacity-60' : ''}
                    />
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden flex flex-col gap-3">
                    {loading && <div className="flex justify-center p-8"><Spin /></div>}
                    {!loading && data.map(record => {
                        const isWeighing = !!record.IS_WEIGHING_STATION;
                        const colorOpt = STORE_COLOR_OPTIONS.find(c => c.key === (record.COLOR || 'blue')) || STORE_COLOR_OPTIONS[0];
                        return (
                            <div
                                key={record.STORE_NO}
                                className={`glass-card rounded-2xl p-4 border border-white/5 relative overflow-hidden ${isWeighing ? 'opacity-60' : ''}`}
                            >
                                {/* Colour strip */}
                                <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: colorOpt.hex }} />

                                <div className="pl-3">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-white">{record.NAME}</span>
                                                {record.IS_WEIGHING_STATION
                                                    ? <Tag color="purple" className="text-[10px]">Weighing</Tag>
                                                    : <Tag color="blue" className="text-[10px]">POS</Tag>}
                                            </div>
                                            {record.ADDRESS && <p className="text-xs text-gray-400 mt-0.5">{record.ADDRESS}</p>}
                                        </div>
                                        <Tag color={record.IS_ACTIVE ? 'success' : 'error'} className="ml-2">
                                            {record.IS_ACTIVE ? 'Active' : 'Inactive'}
                                        </Tag>
                                    </div>

                                    {/* Code row */}
                                    <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2 mb-3">
                                        <span className="font-mono text-base tracking-[0.3em] text-white flex-1">{record.STORE_CODE}</span>
                                        <Button type="text" size="small" icon={<CopyOutlined />} className="text-gray-400" onClick={() => copyCode(record.STORE_CODE)} />
                                    </div>

                                    {/* Feature toggles — mobile */}
                                    {!isWeighing && (
                                        <div className="flex flex-col gap-2 mb-3">
                                            <div className="flex items-center justify-between bg-black/20 rounded-xl px-3 py-2">
                                                <span className="text-xs text-gray-400">📥 Stock Transfer</span>
                                                <Switch
                                                    size="small"
                                                    checked={record.TRANSFER_ENABLED !== 0}
                                                    checkedChildren="On"
                                                    unCheckedChildren="Off"
                                                    onChange={async (val) => {
                                                        try {
                                                            const res = await axios.patch(`/api/stores/${record.STORE_NO}`, { transferEnabled: val });
                                                            if (res.data.success) { fetchStores(); refreshCtx(); }
                                                            else message.error('Failed to update');
                                                        } catch { message.error('Network error'); }
                                                    }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between bg-black/20 rounded-xl px-3 py-2">
                                                <span className="text-xs text-gray-400">📷 QR Scanner</span>
                                                <Switch
                                                    size="small"
                                                    checked={record.QR_ENABLED !== 0}
                                                    checkedChildren="On"
                                                    unCheckedChildren="Off"
                                                    onChange={async (val) => {
                                                        try {
                                                            const res = await axios.patch(`/api/stores/${record.STORE_NO}`, { qrEnabled: val });
                                                            if (res.data.success) { fetchStores(); refreshCtx(); }
                                                            else message.error('Failed to update');
                                                        } catch { message.error('Network error'); }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-2">
                                        {!isWeighing && (
                                            <>
                                                <Button size="small" className="flex-1" onClick={() => openEdit(record)}>Edit</Button>
                                                <Popconfirm
                                                    title="Regenerate code?"
                                                    description="Current code stops working immediately."
                                                    onConfirm={() => handleRegenerate(record)}
                                                >
                                                    <Button size="small" icon={<ReloadOutlined />}>Regen</Button>
                                                </Popconfirm>
                                            </>
                                        )}
                                        <Button size="small" icon={<WifiOutlined />} onClick={() => setTerminalStore(record)}>
                                            Terminals
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Spin>

            {/* Create/Edit Drawer */}
            <Drawer
                title={editing ? `Edit ${editing.NAME}` : 'Add Store'}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : 440}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
                        <Button type="primary" loading={submitting} onClick={handleSubmit}>
                            {editing ? 'Save' : 'Create'}
                        </Button>
                    </div>
                }
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="Store Number"
                        name="STORE_NO"
                        rules={[
                            { required: true, message: 'Required' },
                            {
                                validator: (_, value) => {
                                    if (editing) return Promise.resolve();
                                    const n = Number(value);
                                    if (!Number.isInteger(n) || n < 1) return Promise.reject(new Error('Must be a positive integer'));
                                    if (n === 2) return Promise.reject(new Error('STORE_NO=2 is reserved for the weighing station'));
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <Input type="number" disabled={!!editing} />
                    </Form.Item>

                    <Form.Item label="Store Name" name="NAME" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Pinnaduwa Branch" />
                    </Form.Item>

                    <Form.Item label="Address" name="ADDRESS">
                        <Input.TextArea rows={2} placeholder="Optional" />
                    </Form.Item>

                    <Form.Item label="Store Colour" name="COLOR">
                        <ColorPicker />
                    </Form.Item>

                    {editing && (
                        <Form.Item label="Active" name="IS_ACTIVE" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    )}
                    {editing && (
                        <Form.Item
                            label="Stock Transfer"
                            name="TRANSFER_ENABLED"
                            valuePropName="checked"
                            extra="When off, the 📥 Transfer button is hidden on this store's POS terminals."
                        >
                            <Switch checkedChildren="📥 Enabled" unCheckedChildren="Hidden" />
                        </Form.Item>
                    )}
                    {editing && (
                        <Form.Item
                            label="QR Scanner"
                            name="QR_ENABLED"
                            valuePropName="checked"
                            extra="When off, the 📷 camera button and USB scanner are disabled on this store's POS terminals."
                        >
                            <Switch checkedChildren="📷 Enabled" unCheckedChildren="Hidden" />
                        </Form.Item>
                    )}
                </Form>
            </Drawer>

            {/* Terminal list drawer */}
            {terminalStore && (
                <TerminalList
                    storeNo={terminalStore.STORE_NO}
                    storeName={terminalStore.NAME}
                    open={!!terminalStore}
                    onClose={() => setTerminalStore(null)}
                />
            )}
        </div>
    );
}
