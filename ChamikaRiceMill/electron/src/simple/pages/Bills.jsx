import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input, Dropdown, Drawer, Modal, Checkbox, message } from 'antd';
import { SearchOutlined, MoreOutlined, PrinterOutlined, EditOutlined, CheckCircleOutlined, EyeOutlined, BarcodeOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { billStatus, bagSummary, billAmount, isBlankBill, isToday, money, printBill, billPrintHtml } from '../../services/millActions';
import { PreviewModal } from '../PrintPreview';
import EditSaleForm from '../../pages/sales/EditSaleForm';
import SettleSaleForm from '../../pages/sales/SettleSaleForm';
import ViewSaleModal from '../../pages/sales/ViewSaleModal';
import { BigButton, Card, Chip, ChoiceRow, PageHeader } from '../ui';
import { T, tx } from '../i18n';

const FILTERS = ['today', 'pending', 'onLorry', 'settled', 'blank', 'problem', 'all'];

export default function Bills() {
    const navigate = useNavigate();
    const location = useLocation();
    const [bills, setBills] = useState([]);
    const [filter, setFilter] = useState(new URLSearchParams(location.search).get('filter') || 'today');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [mode, setMode] = useState(null); // 'edit' | 'settle' | 'view'
    const [printingId, setPrintingId] = useState(null);
    const [picked, setPicked] = useState(new Set()); // not-sent bills ticked for a lorry

    const load = async () => {
        const all = await db.sales_bills.toArray();
        setBills(all.filter(b => !b.DELETE_PENDING).sort((a, b) =>
            String(b.CREATED_DATE || b.DATE || '').localeCompare(String(a.CREATED_DATE || a.DATE || '')) || (b.LOCAL_ID - a.LOCAL_ID)));
    };

    useEffect(() => {
        load();
        return syncService.subscribe((e) => { if (['salesUpdated', 'syncComplete', 'dispatchUpdated'].includes(e)) load(); });
    }, []);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return bills.filter(b => {
            const st = billStatus(b);
            if (filter === 'today' && !isToday(b.CREATED_DATE || b.DATE)) return false;
            if (filter === 'pending' && st !== 'pending') return false;
            if (filter === 'onLorry' && st !== 'onLorry') return false;
            if (filter === 'settled' && st !== 'settled') return false;
            if (filter === 'blank' && !(isBlankBill(b) && st !== 'settled')) return false;
            if (filter === 'problem' && !b.SYNC_ERROR) return false;
            if (!q) return true;
            return [b.INVOICE_NO, b.CUSTOMER_NAME, b.BATCH_NO, b.VEHICLE_NO, b.DISPATCH_NO].some(v => String(v || '').toLowerCase().includes(q));
        });
    }, [bills, filter, search]);

    const doPrint = async (b) => {
        setPrintingId(b.LOCAL_ID);
        const res = await printBill(b);
        setPrintingId(null);
        if (res.success) message.success(`${b.INVOICE_NO} · ${tx('printed')}`);
        else Modal.error({ title: tx('printFailed'), content: res.message });
    };

    const deleteBlock = (b) => {
        if (Number(b.IS_SETTLED) === 1) return 'Settled bills cannot be deleted. Unlock it first.';
        if (b.DISPATCH_NO) return `On lorry trip ${b.DISPATCH_NO}. Remove it from that trip first.`;
        return null;
    };

    const doDelete = (b) => {
        const blocked = deleteBlock(b);
        if (blocked) { Modal.info({ title: blocked }); return; }
        Modal.confirm({
            title: `Delete ${b.INVOICE_NO}?`,
            content: `${b.CUSTOMER_NAME || 'Walk-in'} · ${money(billAmount(b))}`,
            okText: 'Delete', okButtonProps: { danger: true, size: 'large' }, cancelText: tx('cancel'), cancelButtonProps: { size: 'large' },
            onOk: async () => {
                if (!b.BILL_ID && !b.IS_SYNCED) await db.sales_bills.delete(b.LOCAL_ID);
                else await db.sales_bills.update(b.LOCAL_ID, { DELETE_PENDING: true, IS_SYNCED: 0, SYNC_ERROR: null });
                if (syncService.isOnline) syncService.syncAll();
                await syncService.updatePendingCount();
                load();
            }
        });
    };

    // One clear next step per bill
    const nextStep = (b) => {
        if (b.SYNC_ERROR) return { label: <><SyncOutlined /> {tx('syncProblem')}</>, color: 'red', run: async () => { await syncService.retryRecord('sales_bills', b.LOCAL_ID); load(); } };
        const st = billStatus(b);
        if (st === 'pending') return { label: <>🚚 {tx('makeDispatch')}</>, color: 'blue', run: () => navigate(`/lorries/new?bill=${encodeURIComponent(b.INVOICE_NO)}`) };
        if (st === 'onLorry') return { label: <>✅ {tx('settleLorry')}</>, color: 'green', run: () => navigate(`/lorries/${encodeURIComponent(b.DISPATCH_NO)}/settle`) };
        return { label: <><PrinterOutlined /> {tx('print')}</>, color: 'light', run: () => doPrint(b) };
    };

    const moreMenu = (b) => ({
        items: [
            { key: 'preview', icon: <EyeOutlined />, label: 'Print preview' },
            { key: 'print', icon: <PrinterOutlined />, label: tx('printAgain') },
            { key: 'view', icon: <EyeOutlined />, label: 'View' },
            { key: 'labels', icon: <BarcodeOutlined />, label: tx('labels') },
            { key: 'edit', icon: <EditOutlined />, label: 'Edit', disabled: Number(b.IS_SETTLED) === 1 },
            { key: 'settle', icon: <CheckCircleOutlined />, label: 'Settle this bill only', disabled: Number(b.IS_SETTLED) === 1 },
            { type: 'divider' },
            { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, disabled: !!deleteBlock(b) }
        ],
        onClick: ({ key }) => {
            if (key === 'print') doPrint(b);
            if (key === 'preview') { setSelected(b); setMode('preview'); }
            if (key === 'labels') navigate(`/labels?billId=${b.BILL_ID || b.LOCAL_ID}`);
            if (key === 'delete') doDelete(b);
            if (['view', 'edit', 'settle'].includes(key)) { setSelected(b); setMode(key); }
        }
    });

    const close = () => { setMode(null); setSelected(null); load(); };

    return (
        <div className="space-y-5">
            <PageHeader k="bills" icon="🧾" right={<BigButton color="blue" onClick={() => navigate('/new-bill')}>+ <T k="newBill" inline /></BigButton>} />
            <Card className="space-y-4">
                <ChoiceRow size="md" value={filter} onChange={setFilter} options={FILTERS.map(f => ({
                    value: f,
                    label: f === 'problem' ? <T k="syncProblem" inline /> : f === 'blank' ? <T k="blank" inline /> : <T k={f} inline />
                }))} />
                <Input size="large" allowClear prefix={<SearchOutlined />} placeholder={`${tx('search')}: invoice, customer, vehicle…`} value={search} onChange={(e) => setSearch(e.target.value)} />
            </Card>

            {shown.length === 0 ? (
                <Card><div className="py-12 text-center text-xl text-slate-400"><T k="noBills" inline /></div></Card>
            ) : (
                <div className="space-y-3">
                    {shown.slice(0, 200).map(b => {
                        const st = billStatus(b);
                        const bags = bagSummary(b);
                        const step = nextStep(b);
                        const canPick = st === 'pending' && !b.SYNC_ERROR;
                        const on = picked.has(b.LOCAL_ID);
                        return (
                            <Card key={b.LOCAL_ID} className={`!p-4 ${on ? '!border-blue-500 !bg-blue-50' : ''}`}>
                                {/* One fixed row: [tick] [who] [bags · amount] [status] [next step] [more] */}
                                <div className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto_auto] items-center gap-4">
                                    <div className="flex justify-center">
                                        {canPick && <Checkbox checked={on} className="scale-150" onChange={() => setPicked(prev => { const n = new Set(prev); n.has(b.LOCAL_ID) ? n.delete(b.LOCAL_ID) : n.add(b.LOCAL_ID); return n; })} />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate text-xl font-bold text-slate-900">{b.CUSTOMER_NAME || 'Walk-in'}</div>
                                        <div className="truncate font-mono text-sm text-slate-500">{b.INVOICE_NO} · {dayjs(b.CREATED_DATE || b.DATE).format('D MMM, h:mm A')}{b.VEHICLE_NO ? ` · ${b.VEHICLE_NO}` : ''}</div>
                                    </div>
                                    <div className="whitespace-nowrap text-right text-lg text-slate-700">
                                        {isBlankBill(b) ? <Chip status="blank" /> : <>{bags.total} bags · <b>{money(billAmount(b))}</b></>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                                        <Chip status={st} />
                                        {b.SYNC_ERROR ? <Chip status="syncProblem" /> : !b.IS_SYNCED && <Chip status="notSynced" />}
                                    </div>
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <BigButton color={step.color} loading={printingId === b.LOCAL_ID} onClick={step.run} className="!min-h-[52px] w-[190px] !px-3 !py-3 !text-base">{step.label}</BigButton>
                                        <Dropdown menu={moreMenu(b)} trigger={['click']} placement="bottomRight">
                                            <button type="button" className="h-[52px] w-[52px] rounded-2xl border-2 border-slate-300 text-2xl text-slate-600 hover:bg-slate-50"><MoreOutlined /></button>
                                        </Dropdown>
                                    </div>
                                </div>
                                {b.SYNC_ERROR && <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-base text-rose-700">Server: {b.SYNC_ERROR}</div>}
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Ticked bills -> one lorry */}
            {picked.size > 0 && (() => {
                const chosen = bills.filter(b => picked.has(b.LOCAL_ID));
                const bg = bagSummary(chosen);
                return (
                    <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-blue-500 bg-white p-4 shadow-xl">
                        <div className="text-xl font-extrabold text-slate-900">{picked.size} bills · {bg.total} bags</div>
                        <div className="flex gap-3">
                            <BigButton color="light" onClick={() => setPicked(new Set())}><T k="clear" inline /></BigButton>
                            <BigButton color="blue" onClick={() => navigate(`/lorries/new?bills=${encodeURIComponent(chosen.map(b => b.INVOICE_NO).join(','))}`)}>🚚 <T k="makeDispatch" inline /> ({picked.size})</BigButton>
                        </div>
                    </div>
                );
            })()}

            <Drawer title="Edit bill" placement="right" width="85vw" open={mode === 'edit'} onClose={close} destroyOnClose maskClosable={false}>
                {selected && <EditSaleForm billRecord={selected} billId={selected.BILL_ID || selected.LOCAL_ID} onSuccess={close} onCancel={close} />}
            </Drawer>
            <Drawer title="Settle this bill" placement="right" width={720} open={mode === 'settle'} onClose={close} destroyOnClose maskClosable={false}>
                {selected && <SettleSaleForm bill={selected} onSuccess={close} onCancel={close} />}
            </Drawer>
            <PreviewModal open={mode === 'preview'} onClose={close} html={selected ? billPrintHtml(selected) : ''} title={selected?.INVOICE_NO}
                printing={printingId === selected?.LOCAL_ID} onPrint={async () => { const b = selected; close(); await doPrint(b); }} />
            <ViewSaleModal visible={mode === 'view'} onClose={close} bill={selected} onPrint={(b) => { close(); doPrint(b); }} />
        </div>
    );
}
