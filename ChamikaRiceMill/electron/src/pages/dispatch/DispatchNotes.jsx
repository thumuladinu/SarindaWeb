import React, { useState, useEffect } from 'react';
import { 
    Card, Button, Table, Tag, Form, Input, Select, 
    Row, Col, Modal, message, Space, DatePicker, Popconfirm, Tooltip 
} from 'antd';
import { 
    CarOutlined, PlusOutlined, PrinterOutlined, SyncOutlined, 
    CheckCircleOutlined, DeleteOutlined, EyeOutlined, LockOutlined, EditOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { getTerminalDeviceCode, getCurrentUserName, formatSLDateTime } from '../../utils/terminalHelper';
import printService from '../../services/printService';
import PrintableDispatchNote from './PrintableDispatchNote';
import SettleDispatchModal from './SettleDispatchModal';
import EditDispatchModal from './EditDispatchModal';

const { RangePicker } = DatePicker;

export default function DispatchNotes() {
    const [notes, setNotes] = useState([]);
    const [filteredNotes, setFilteredNotes] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(false);

    // Filter state
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [dateRange, setDateRange] = useState(null);

    // Print Modal state
    const [printModal, setPrintModal] = useState(false);
    const [selectedNote, setSelectedNote] = useState(null);
    const [linkedBills, setLinkedBills] = useState([]);

    // Settle Modal state
    const [settleModalOpen, setSettleModalOpen] = useState(false);
    const [settleNoteRecord, setSettleNoteRecord] = useState(null);
    const [settleReadOnly, setSettleReadOnly] = useState(false);

    // Edit Modal state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editNoteRecord, setEditNoteRecord] = useState(null);

    useEffect(() => {
        loadData();
        const unsub = syncService.subscribe((event) => {
            if (event === 'dispatchUpdated' || event === 'syncComplete') {
                loadData();
            }
        });
        return unsub;
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [noteList, vehList, sList] = await Promise.all([
                db.dispatch_notes.toArray(),
                db.vehicles.toArray(),
                db.staff.toArray()
            ]);

            const sorted = (noteList || []).sort((a, b) => {
                const dateA = a.CREATED_DATE || a.CREATED_AT || a.DATE || '';
                const dateB = b.CREATED_DATE || b.CREATED_AT || b.DATE || '';

                if (dateA && dateB && dateA !== dateB) {
                    return dateB.localeCompare(dateA);
                }

                const noA = a.DISPATCH_NO || '';
                const noB = b.DISPATCH_NO || '';
                if (noA && noB && noA !== noB) {
                    return noB.localeCompare(noA);
                }

                const idA = Number(a.LOCAL_ID || a.DISPATCH_ID || 0);
                const idB = Number(b.LOCAL_ID || b.DISPATCH_ID || 0);
                return idB - idA;
            });

            setNotes(sorted);
            setFilteredNotes(sorted);
            setVehicles(vehList || []);
            setStaffList(sList || []);
        } catch (err) {
            console.error('Error loading dispatch notes:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let temp = [...notes];

        if (statusFilter !== 'ALL') {
            temp = temp.filter(n => (n.STATUS || 'PENDING').toUpperCase() === statusFilter);
        }

        if (dateRange && dateRange[0] && dateRange[1]) {
            const start = dateRange[0].startOf('day');
            const end = dateRange[1].endOf('day');
            temp = temp.filter(n => {
                const noteDate = dayjs(n.DATE || n.CREATED_DATE);
                return (noteDate.isAfter(start) || noteDate.isSame(start, 'day')) &&
                       (noteDate.isBefore(end) || noteDate.isSame(end, 'day'));
            });
        }

        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            temp = temp.filter(n => 
                n.DISPATCH_NO?.toLowerCase().includes(q) ||
                n.LORRY_NO?.toLowerCase().includes(q) ||
                n.DRIVER_NAME?.toLowerCase().includes(q)
            );
        }

        setFilteredNotes(temp);
    }, [searchText, statusFilter, dateRange, notes]);

    const handlePrint = async (record) => {
        setSelectedNote(record);
        try {
            const allBills = await db.sales_bills.toArray();
            let bills = [];
            
            // Priority 1: Match by global INVOICE_NOS_JSON array
            let invNos = record.INVOICE_NOS_JSON || record.INVOICE_NOS || [];
            if (typeof invNos === 'string') {
                try { invNos = JSON.parse(invNos); } catch(e) { invNos = invNos.split(',').map(s => s.trim()); }
            }
            if (Array.isArray(invNos) && invNos.length > 0) {
                const cleanInvNos = invNos.map(s => String(s).trim()).filter(Boolean);
                bills = allBills.filter(b => b.INVOICE_NO && cleanInvNos.includes(String(b.INVOICE_NO).trim()));
            }

            // Priority 2: Match by DISPATCH_NO column on sales_bills
            if (bills.length === 0 && record.DISPATCH_NO) {
                bills = allBills.filter(b => b.DISPATCH_NO && String(b.DISPATCH_NO) === String(record.DISPATCH_NO));
            }

            // Priority 3: Match by legacy DISPATCH_ID column on sales_bills
            if (bills.length === 0 && (record.DISPATCH_ID || record.LOCAL_ID)) {
                const noteDispatchId = record.DISPATCH_ID || record.LOCAL_ID;
                bills = allBills.filter(b => b.DISPATCH_ID && (String(b.DISPATCH_ID) === String(noteDispatchId) || String(b.DISPATCH_ID) === String(record.LOCAL_ID)));
            }
            
            // Priority 4: Match by BILL_ID (server ID) or LOCAL_ID
            if (bills.length === 0) {
                let billIds = record.BILL_IDS_JSON || record.BILL_IDS || [];
                if (typeof billIds === 'string') {
                    try { billIds = JSON.parse(billIds); } catch(e) { billIds = billIds.split(',').map(s => s.trim()); }
                }
                if (Array.isArray(billIds) && billIds.length > 0) {
                    const numericIds = billIds.map(i => Number(i)).filter(i => !isNaN(i));
                    const matchedByBillId = allBills.filter(b => b.BILL_ID && numericIds.includes(Number(b.BILL_ID)));
                    if (matchedByBillId.length > 0) {
                        bills = matchedByBillId;
                    } else {
                        bills = allBills.filter(b => b.LOCAL_ID && numericIds.includes(Number(b.LOCAL_ID)));
                    }
                }
            }
            setLinkedBills(bills);

            const isAuto = printService.isAutoPrintEnabled();
            if (isAuto) {
                await printService.printDispatchNote(record, bills, { forceSilent: true });
                message.success(`Silent printed Gate Pass ${record.DISPATCH_NO || ''}`);
            } else {
                // Open system print window directly without intermediate modal
                await printService.printDispatchNote(record, bills, { forceSilent: false });
            }
        } catch (e) {
            console.error('Error printing dispatch note:', e);
            message.error('Failed to print Gate Pass');
        }
    };

    const handleOpenSettleModal = (record, isReadOnly = false) => {
        setSettleNoteRecord(record);
        setSettleReadOnly(isReadOnly);
        setSettleModalOpen(true);
    };

    const handleDelete = async (record) => {
        try {
            await db.dispatch_notes.delete(record.LOCAL_ID);
            message.success('Dispatch Note deleted');
            loadData();
        } catch (e) {
            message.error('Failed to delete');
        }
    };

    const columns = [
        {
            title: 'Status',
            dataIndex: 'STATUS',
            key: 'STATUS',
            width: 110,
            render: val => {
                const s = (val || 'PENDING').toUpperCase();
                return s === 'SETTLED' ? (
                    <Tag color="success" icon={<LockOutlined />}>SETTLED</Tag>
                ) : (
                    <Tag color="warning">PENDING</Tag>
                );
            }
        },
        {
            title: 'Dispatch No',
            dataIndex: 'DISPATCH_NO',
            key: 'DISPATCH_NO',
            render: (val, r) => (
                <div>
                    <div className="font-bold text-slate-800 font-mono text-xs">{val || `DSP-${r.LOCAL_ID}`}</div>
                </div>
            )
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            width: 110,
            render: val => val ? dayjs(val).format('YYYY-MM-DD') : '-'
        },
        {
            title: 'Lorry / Vehicle',
            dataIndex: 'LORRY_NO',
            key: 'LORRY_NO',
            render: (val, r) => <span className="font-semibold text-xs text-blue-900">{val || r.VEHICLE_NO || 'Mill Lorry'}</span>
        },
        {
            title: 'Driver',
            dataIndex: 'DRIVER_NAME',
            key: 'DRIVER_NAME',
            render: val => <span>{val || 'Main Driver'}</span>
        },
        {
            title: 'Officer',
            dataIndex: 'STAFF_NAME',
            key: 'STAFF_NAME',
            render: val => <span className="text-xs text-slate-500">{val || 'Officer'}</span>
        },
        {
            title: 'Bills Loaded',
            key: 'billsCount',
            align: 'center',
            render: (_, r) => {
                let count = 0;
                if (r.BILL_IDS_JSON) {
                    let ids = r.BILL_IDS_JSON;
                    if (typeof ids === 'string') {
                        try { ids = JSON.parse(ids); } catch(e) { ids = ids ? ids.split(',').filter(Boolean) : []; }
                    }
                    if (Array.isArray(ids)) count = ids.length;
                }
                if (!count && r.BILLS_COUNT) {
                    count = r.BILLS_COUNT;
                }
                return (
                    <Tag color={count > 0 ? "blue" : "default"} className="font-bold">
                        {count} Bills
                    </Tag>
                );
            }
        },
        {
            title: 'Created / Added By',
            key: 'CREATED_INFO',
            width: 150,
            render: (_, r) => {
                const { dateStr, timeStr, addedBy } = formatSLDateTime(r.CREATED_DATE || r.CREATED_AT || r.DATE, r);
                return (
                    <div>
                        <div className="font-bold text-slate-800 text-xs">{dateStr}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{timeStr}</div>
                        {addedBy && (
                            <div className="text-[10px] text-blue-700 font-semibold flex items-center gap-1 mt-0.5">
                                <span>👤 {addedBy}</span>
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 170,
            render: (_, r) => (
                <Space size="small">
                    <Tooltip title="Print Gate Pass">
                        <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrint(r)} />
                    </Tooltip>

                    {r.STATUS === 'SETTLED' ? (
                        <Tooltip title="View Settlement Details">
                            <Button 
                                size="small" 
                                icon={<EyeOutlined />} 
                                onClick={() => handleOpenSettleModal(r, true)} 
                            />
                        </Tooltip>
                    ) : (
                        <>
                            <Tooltip title="Edit Dispatch Note">
                                <Button 
                                    size="small" 
                                    icon={<EditOutlined />} 
                                    onClick={() => {
                                        setEditNoteRecord(r);
                                        setEditModalOpen(true);
                                    }} 
                                />
                            </Tooltip>
                            <Tooltip title="Settle Dispatch Note &amp; Bills">
                                <Button 
                                    size="small" 
                                    type="primary" 
                                    className="!bg-emerald-600 hover:!bg-emerald-700 font-bold" 
                                    icon={<CheckCircleOutlined />} 
                                    onClick={() => handleOpenSettleModal(r, false)}
                                >
                                    Settle
                                </Button>
                            </Tooltip>
                        </>
                    )}

                    <Popconfirm title="Delete this dispatch note?" onConfirm={() => handleDelete(r)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-md">
                        <CarOutlined />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 m-0">Lorry Dispatch Notes & Gate Passes</h2>
                        <p className="text-xs text-slate-500 m-0">Consolidated vehicle load sheets and gate out passes for sales deliveries</p>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <Card className="officer-card !p-3">
                <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} sm={8}>
                        <Input
                            placeholder="Search Dispatch No, Lorry, Driver..."
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                        />
                    </Col>
                    <Col xs={12} sm={8}>
                        <RangePicker 
                            className="w-full" 
                            value={dateRange} 
                            onChange={v => setDateRange(v)} 
                        />
                    </Col>
                    <Col xs={12} sm={4}>
                        <Select 
                            value={statusFilter} 
                            onChange={setStatusFilter} 
                            className="w-full"
                        >
                            <Select.Option value="ALL">All Status</Select.Option>
                            <Select.Option value="PENDING">Pending</Select.Option>
                            <Select.Option value="SETTLED">Settled</Select.Option>
                        </Select>
                    </Col>
                    <Col xs={24} sm={4} className="text-right">
                        <Button icon={<SyncOutlined />} onClick={loadData}>Refresh</Button>
                    </Col>
                </Row>
            </Card>

            {/* Table */}
            <Card className="officer-card">
                <Table
                    columns={columns}
                    dataSource={filteredNotes}
                    rowKey={r => r.LOCAL_ID || r.DISPATCH_ID}
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    size="small"
                />
            </Card>

            {/* Printable Modal */}
            <Modal
                title={`Dispatch Gate Pass: ${selectedNote?.DISPATCH_NO}`}
                open={printModal}
                onCancel={() => setPrintModal(false)}
                footer={null}
                width={850}
                className="top-6"
            >
                {selectedNote && (
                    <PrintableDispatchNote 
                        note={selectedNote} 
                        bills={linkedBills} 
                    />
                )}
            </Modal>

            {/* Full Settle Modal */}
            <SettleDispatchModal
                open={settleModalOpen}
                noteRecord={settleNoteRecord}
                readOnly={settleReadOnly}
                onClose={() => setSettleModalOpen(false)}
                onSuccess={loadData}
            />

            {/* Edit Dispatch Modal */}
            <EditDispatchModal
                visible={editModalOpen}
                record={editNoteRecord}
                onClose={() => setEditModalOpen(false)}
                onSuccess={loadData}
            />
        </div>
    );
}
