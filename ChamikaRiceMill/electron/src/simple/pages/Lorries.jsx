import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Select, DatePicker, Dropdown, Modal, Checkbox, Spin } from 'antd';
import { PrinterOutlined, MoreOutlined, EditOutlined, DeleteOutlined, EyeOutlined, CarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { billStatus, bagSummary, billAmount, isBlankBill, isToday, money, loadSaleRefs, createDispatch, printDispatch, billsOfNote, memory, buildDispatch, gatePassHtml, nextDispatchNo } from '../../services/millActions';
import PrintPreview, { PreviewModal } from '../PrintPreview';
import EditDispatchModal from '../../pages/dispatch/EditDispatchModal';
import SettleDispatchModal from '../../pages/dispatch/SettleDispatchModal';
import { BigButton, Card, Chip, ChoiceRow, PageHeader, ResultPanel, Stepper, useHotkeys } from '../ui';
import { T, tx } from '../i18n';

const isSettled = (n) => String(n.STATUS || 'PENDING').toUpperCase() === 'SETTLED';

// ─── Lorry trips list ─────────────────────────────────────────
export function LorryList() {
    const navigate = useNavigate();
    const [notes, setNotes] = useState([]);
    const [filter, setFilter] = useState('open');
    const [editNote, setEditNote] = useState(null);
    const [viewNote, setViewNote] = useState(null);
    const [printing, setPrinting] = useState(null);
    const [preview, setPreview] = useState(null); // { note, bills }

    const load = async () => {
        const all = await db.dispatch_notes.toArray();
        setNotes(all.filter(n => !n.DELETE_PENDING).sort((a, b) => String(b.CREATED_DATE || b.DATE || '').localeCompare(String(a.CREATED_DATE || a.DATE || ''))));
    };
    useEffect(() => {
        load();
        return syncService.subscribe((e) => { if (['dispatchUpdated', 'syncComplete', 'salesUpdated'].includes(e)) load(); });
    }, []);

    const shown = notes.filter(n => filter === 'all' || (filter === 'open' ? !isSettled(n) : isSettled(n)));

    const doPrint = async (n) => {
        setPrinting(n.LOCAL_ID);
        const res = await printDispatch(n, await billsOfNote(n));
        setPrinting(null);
        if (!res.success) Modal.error({ title: tx('printFailed'), content: res.message });
    };

    const doDelete = (n) => {
        if (isSettled(n)) { Modal.info({ title: 'Settled lorry trips cannot be deleted.' }); return; }
        Modal.confirm({
            title: `Delete trip ${n.DISPATCH_NO}?`, content: 'Its bills become free to send again.',
            okText: 'Delete', okButtonProps: { danger: true, size: 'large' }, cancelText: tx('cancel'), cancelButtonProps: { size: 'large' },
            onOk: async () => {
                if (n.DISPATCH_NO) {
                    const linked = await db.sales_bills.where('DISPATCH_NO').equals(n.DISPATCH_NO).toArray();
                    for (const b of linked) await db.sales_bills.update(b.LOCAL_ID, { DISPATCH_NO: null, DISPATCH_ID: null });
                }
                if (!n.DISPATCH_ID && !n.IS_SYNCED) await db.dispatch_notes.delete(n.LOCAL_ID);
                else await db.dispatch_notes.update(n.LOCAL_ID, { DELETE_PENDING: true, IS_SYNCED: 0, SYNC_ERROR: null });
                if (syncService.isOnline) syncService.syncAll();
                await syncService.updatePendingCount();
                load();
            }
        });
    };

    return (
        <div className="space-y-5">
            <PageHeader k="lorries" icon={<CarOutlined />} right={<BigButton color="blue" onClick={() => navigate('/lorries/new')}>🚚 <T k="makeDispatch" inline /></BigButton>} />
            <Card>
                <ChoiceRow size="md" value={filter} onChange={setFilter} options={[
                    { value: 'open', label: <T k="onLorry" inline /> },
                    { value: 'settled', label: <T k="settled" inline /> },
                    { value: 'all', label: <T k="all" inline /> }
                ]} />
            </Card>
            {shown.length === 0 && <Card><div className="py-12 text-center text-xl text-slate-400">—</div></Card>}
            <div className="space-y-3">
                {shown.map(n => (
                    <Card key={n.LOCAL_ID} className="!p-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="text-xl font-bold text-slate-900">🚚 {n.LORRY_NO || '-'} · {n.DRIVER_NAME || '-'}</div>
                                <div className="font-mono text-sm text-slate-500">{n.DISPATCH_NO} · {dayjs(n.DATE).format('D MMM YYYY')}</div>
                                <div className="text-base text-slate-600">{n.BILLS_COUNT || (n.INVOICE_NOS_JSON || []).length || 0} bills · {n.TOTAL_BAGS || 0} <T k="bags" inline /></div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip status={isSettled(n) ? 'settled' : 'onLorry'} />
                                {n.SYNC_ERROR ? <Chip status="syncProblem" /> : !n.IS_SYNCED && <Chip status="notSynced" />}
                                {!isSettled(n) ? (
                                    <BigButton color="green" onClick={() => navigate(`/lorries/${encodeURIComponent(n.DISPATCH_NO)}/settle`)} className="!min-h-[52px] !py-3 !text-base">✅ <T k="settleLorry" inline /></BigButton>
                                ) : (
                                    <BigButton color="light" icon={<EyeOutlined />} onClick={() => setViewNote(n)} className="!min-h-[52px] !py-3 !text-base">View</BigButton>
                                )}
                                <BigButton color="light" icon={<PrinterOutlined />} loading={printing === n.LOCAL_ID} onClick={async () => setPreview({ note: n, bills: await billsOfNote(n) })} className="!min-h-[52px] !py-3 !text-base">Gate pass</BigButton>
                                <Dropdown trigger={['click']} placement="bottomRight" menu={{
                                    items: [
                                        { key: 'edit', icon: <EditOutlined />, label: 'Edit trip', disabled: isSettled(n) },
                                        { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, disabled: isSettled(n) }
                                    ],
                                    onClick: ({ key }) => { if (key === 'edit') setEditNote(n); if (key === 'delete') doDelete(n); }
                                }}>
                                    <button type="button" className="h-[52px] w-[52px] rounded-2xl border-2 border-slate-300 text-2xl text-slate-600 hover:bg-slate-50"><MoreOutlined /></button>
                                </Dropdown>
                            </div>
                        </div>
                        {n.SYNC_ERROR && <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-base text-rose-700">Server: {n.SYNC_ERROR}</div>}
                    </Card>
                ))}
            </div>
            <PreviewModal open={!!preview} paper="gatepass" onClose={() => setPreview(null)} title={preview?.note?.DISPATCH_NO}
                html={preview ? gatePassHtml(preview.note, preview.bills) : ''} printing={printing === preview?.note?.LOCAL_ID}
                onPrint={async () => { const n = preview.note; setPreview(null); await doPrint(n); }} />
            {editNote && <EditDispatchModal visible record={editNote} onClose={() => setEditNote(null)} onSuccess={() => { setEditNote(null); load(); }} />}
            {viewNote && <SettleDispatchModal open noteRecord={viewNote} readOnly onClose={() => setViewNote(null)} onSuccess={() => setViewNote(null)} />}
        </div>
    );
}

// ─── Send a lorry: choose bills -> lorry & driver -> save & print gate pass ──
export function SendLorry() {
    const navigate = useNavigate();
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const preselect = [params.get('bill'), ...(params.get('bills') || '').split(',')].map(s => (s || '').trim()).filter(Boolean);
    const [bills, setBills] = useState(null);
    const [picked, setPicked] = useState(new Set());
    const [refs, setRefs] = useState({ vehicles: [], drivers: [], staff: [] });
    const [lorryNo, setLorryNo] = useState(memory.get('vehicle', ''));
    const [driverName, setDriverName] = useState(memory.get('driver', ''));
    const [staffName, setStaffName] = useState(memory.get('staff', ''));
    const [date, setDate] = useState(dayjs());
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [nextNo, setNextNo] = useState('');
    const [extraBags, setExtraBags] = useState({ 5: 0, 10: 0, 25: 0 }); // loaded on the lorry but not on any bill

    useEffect(() => {
        (async () => {
            const [all, r, no] = await Promise.all([db.sales_bills.toArray(), loadSaleRefs(), nextDispatchNo()]);
            setNextNo(no);
            const free = all.filter(b => !b.DELETE_PENDING && billStatus(b) === 'pending')
                .sort((a, b) => String(b.CREATED_DATE || '').localeCompare(String(a.CREATED_DATE || '')));
            setBills(free);
            setRefs(r);
            const start = preselect.length > 0 ? free.filter(b => preselect.includes(b.INVOICE_NO)) : free.filter(b => isToday(b.CREATED_DATE || b.DATE));
            setPicked(new Set(start.map(b => b.LOCAL_ID)));
            const firstWithLorry = start.find(b => b.VEHICLE_NO);
            if (firstWithLorry) { setLorryNo(firstWithLorry.VEHICLE_NO); if (firstWithLorry.DRIVER_NAME) setDriverName(firstWithLorry.DRIVER_NAME); }
        })();
    }, []);

    const chosen = useMemo(() => (bills || []).filter(b => picked.has(b.LOCAL_ID)), [bills, picked]);
    const billBags = bagSummary(chosen);
    const hasExtra = [5, 10, 25].some(w => extraBags[w] !== 0);
    const loaded = hasExtra ? { 5: billBags[5] + extraBags[5], 10: billBags[10] + extraBags[10], 25: billBags[25] + extraBags[25] } : null;
    const bags = loaded ? { ...loaded, total: loaded[5] + loaded[10] + loaded[25] } : billBags;
    const extra = bags.total - billBags.total;
    const setLoadedSize = (w, n) => setExtraBags(prev => ({ ...prev, [w]: Math.max(-billBags[w], n - billBags[w]) }));
    const toggle = (id) => setPicked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

    const save = async () => {
        if (busy) return;
        if (chosen.length === 0) { Modal.info({ title: tx('chooseBills') }); return; }
        if (!lorryNo) { Modal.info({ title: `${tx('vehicle')}?` }); return; }
        setBusy(true);
        try {
            const note = await createDispatch({ bills: chosen, date, lorryNo, driverName, staffName, bagTotals: loaded });
            memory.set('vehicle', lorryNo); memory.set('driver', driverName); memory.set('staff', staffName);
            setResult({ note, printing: true });
            const res = await printDispatch(note, chosen);
            setResult({ note, printing: false, printError: res.success ? null : res.message });
        } catch (e) {
            Modal.error({ title: 'Could not create the lorry trip', content: e.message });
        } finally {
            setBusy(false);
        }
    };

    useHotkeys({ F9: save, Escape: () => navigate('/lorries') }, [chosen, lorryNo, driverName, staffName, date, busy, extraBags]);

    if (result) {
        return (
            <div className="space-y-5">
                <PageHeader k="makeDispatch" icon="🚚" />
                <ResultPanel state={result.printing ? 'busy' : result.printError ? 'error' : 'success'}
                    title={result.printing ? tx('printing') : `${tx('saved')} ✓ · ${result.note.DISPATCH_NO}`}
                    lines={[`🚚 ${result.note.LORRY_NO} · ${result.note.DRIVER_NAME}`, `${result.note.BILLS_COUNT} bills · ${result.note.TOTAL_BAGS} bags`, result.printError && `${tx('printFailed')}: ${result.printError}`]}
                    actions={<>
                        <BigButton color="light" icon={<PrinterOutlined />} onClick={async () => { setResult(r => ({ ...r, printing: true })); const res = await printDispatch(result.note, chosen); setResult(r => ({ ...r, printing: false, printError: res.success ? null : res.message })); }}>Gate pass</BigButton>
                        <BigButton color="blue" onClick={() => navigate('/lorries')}><T k="lorries" inline /></BigButton>
                        <BigButton color="light" onClick={() => navigate('/')}><T k="home" inline /></BigButton>
                    </>} />
            </div>
        );
    }

    if (!bills) return <div className="py-24 text-center"><Spin size="large" /></div>;

    return (
        <div className="space-y-5">
            <PageHeader k="makeDispatch" icon="🚚" />
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
                <Card>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xl font-extrabold text-slate-800">1. <T k="chooseBills" inline /> ({chosen.length})</div>
                        <div className="flex gap-2">
                            <button type="button" className="rounded-xl px-3 py-2 text-base font-bold text-blue-700 hover:bg-blue-50" onClick={() => setPicked(new Set(bills.filter(b => isToday(b.CREATED_DATE || b.DATE)).map(b => b.LOCAL_ID)))}><T k="today" inline /></button>
                            <button type="button" className="rounded-xl px-3 py-2 text-base font-bold text-blue-700 hover:bg-blue-50" onClick={() => setPicked(new Set(bills.map(b => b.LOCAL_ID)))}><T k="all" inline /></button>
                            <button type="button" className="rounded-xl px-3 py-2 text-base font-bold text-slate-500 hover:bg-slate-50" onClick={() => setPicked(new Set())}><T k="clear" inline /></button>
                        </div>
                    </div>
                    {bills.length === 0 ? <div className="py-10 text-center text-lg text-slate-400"><T k="noBills" inline /></div> : (
                        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                            {bills.map(b => {
                                const on = picked.has(b.LOCAL_ID);
                                const bg = bagSummary(b);
                                return (
                                    <button type="button" key={b.LOCAL_ID} onClick={() => toggle(b.LOCAL_ID)}
                                        className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left ${on ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                        <Checkbox checked={on} className="scale-150" />
                                        <div className="flex-1">
                                            <div className="text-lg font-bold text-slate-900">{b.CUSTOMER_NAME || 'Walk-in'}</div>
                                            <div className="font-mono text-sm text-slate-500">{b.INVOICE_NO} · {dayjs(b.CREATED_DATE || b.DATE).format('D MMM h:mm A')}</div>
                                        </div>
                                        <div className="text-right text-base text-slate-700">{isBlankBill(b) ? <Chip status="blank" /> : <>{bg.total} bags<br />{money(billAmount(b))}</>}</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <Card className="space-y-4 self-start">
                    <div className="text-xl font-extrabold text-slate-800">2. <T k="vehicle" inline /></div>
                    <Select size="large" showSearch className="w-full" placeholder={tx('vehicle')} value={lorryNo || undefined}
                        onChange={(v) => { setLorryNo(v); const f = refs.vehicles.find(x => x.value === v); if (f?.driver) setDriverName(f.driver); }}
                        options={refs.vehicles.map(v => ({ value: v.value, label: v.driver ? `${v.value} (${v.driver})` : v.value }))} />
                    <div className="text-base font-bold text-slate-600"><T k="driver" inline /></div>
                    <Select size="large" showSearch allowClear className="w-full" value={driverName || undefined} onChange={(v) => setDriverName(v || '')}
                        options={refs.drivers.map(d => ({ value: d, label: d }))} />
                    <div className="text-base font-bold text-slate-600"><T k="staff" inline /></div>
                    <Select size="large" showSearch allowClear className="w-full" value={staffName || undefined} onChange={(v) => setStaffName(v || '')}
                        options={refs.staff.map(s => ({ value: s, label: s }))} />
                    <div className="text-base font-bold text-slate-600"><T k="date" inline /></div>
                    <div className="flex flex-wrap gap-2">
                        <ChoiceRow size="md" value={date.isSame(dayjs(), 'day') ? 'today' : date.isSame(dayjs().add(1, 'day'), 'day') ? 'tomorrow' : 'x'}
                            onChange={(v) => setDate(v === 'tomorrow' ? dayjs().add(1, 'day') : dayjs())}
                            options={[{ value: 'today', label: <T k="today" inline /> }, { value: 'tomorrow', label: <T k="tomorrow" inline /> }]} />
                        <DatePicker size="large" value={date} onChange={(d) => setDate(d || dayjs())} allowClear={false} />
                    </div>
                    <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
                        <div className="text-base font-bold text-slate-600">Bags loaded on the lorry</div>
                        {[5, 10, 25].map(w => (
                            <div key={w} className="flex items-center justify-between gap-2">
                                <span className="w-16 text-xl font-black text-slate-900">{w} kg</span>
                                <Stepper value={bags[w]} onChange={(n) => setLoadedSize(w, n)} />
                            </div>
                        ))}
                        <div className="border-t border-slate-200 pt-2 text-2xl font-black text-slate-900">{bags.total} bags · {chosen.length} bills</div>
                        {extra !== 0 && (
                            <div className={`rounded-xl px-3 py-2 text-base font-bold ${extra > 0 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800'}`}>
                                {extra > 0 ? `Extra on lorry: +${extra} bags (not on any bill — settle them with blank / handwritten bills)` : `${-extra} bags fewer than the bills`}
                            </div>
                        )}
                        {hasExtra && <button type="button" className="text-base font-bold text-blue-700" onClick={() => setExtraBags({ 5: 0, 10: 0, 25: 0 })}>Use bill counts ({billBags.total})</button>}
                    </div>
                    <BigButton color="green" icon={<PrinterOutlined />} loading={busy} onClick={save} hint="F9" className="w-full"><T k="saveAndPrint" inline /></BigButton>
                    {chosen.length > 0 && (
                        <div className="pt-2">
                            <div className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Gate pass preview</div>
                            <PrintPreview paper="gatepass" title={nextNo}
                                html={gatePassHtml(buildDispatch({ dispatchNo: nextNo || '…', bills: chosen, date, lorryNo, driverName, staffName, bagTotals: loaded }), chosen)} />
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
