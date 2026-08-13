import React, { useState, useEffect } from 'react';
import { 
    Card, Button, Table, Tag, Form, Input, Select, 
    Row, Col, Modal, message, Space, DatePicker, Popconfirm, Tooltip 
} from 'antd';
import { 
    CarOutlined, PlusOutlined, PrinterOutlined, SyncOutlined, 
    CheckCircleOutlined, DeleteOutlined, EyeOutlined, LockOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import printService from '../../services/printService';
import PrintableDispatchNote from './PrintableDispatchNote';
import SettleDispatchModal from './SettleDispatchModal';

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
                db.dispatch_notes.orderBy('DATE').reverse().toArray(),
                db.vehicles.toArray(),
                db.staff.toArray()
            ]);
            setNotes(noteList || []);
            setFilteredNotes(noteList || []);
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
            const billIds = record.BILL_IDS_JSON || [];
            let bills = [];
            if (billIds.length > 0) {
                bills = await db.sales_bills.where('LOCAL_ID').anyOf(billIds).toArray();
                if (bills.length === 0) {
                    bills = await db.sales_bills.where('BILL_ID').anyOf(billIds).toArray();
                }
            }
            setLinkedBills(bills);

            if (printService.isAutoPrintEnabled()) {
                printService.printDispatchNote(record, bills);
                message.success(`Auto-printing Gate Pass ${record.DISPATCH_NO || ''} to ${printService.getBillPrinter() || 'Default A5 Bill Printer'}...`);
            } else {
                setPrintModal(true);
            }
        } catch (e) {
            console.error('Error loading linked bills for print:', e);
            setPrintModal(true);
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
                    <div className="text-[10px] text-slate-400">
                        {dayjs(r.DATE || r.CREATED_DATE).format('YYYY-MM-DD')}
                    </div>
                </div>
            )
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
            render: (_, r) => (
                <Tag color="blue" className="font-bold">
                    {(r.BILL_IDS_JSON?.length || r.BILLS_COUNT || 0)} Bills
                </Tag>
            )
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
                        <Tooltip title="Settle Dispatch Note & Bills">
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
        </div>
    );
}
