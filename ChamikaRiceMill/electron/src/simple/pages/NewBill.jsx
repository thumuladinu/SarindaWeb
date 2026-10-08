import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, DatePicker, InputNumber, Modal, Spin } from 'antd';
import { PrinterOutlined, SaveOutlined, FileAddOutlined, BarcodeOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    BAG_SIZES, TYPES, getVarietyCatalog, rowsForVariety, rowsTotal, rowsBags, itemsFromRows, loadSaleRefs,
    createSaleBill, buildSaleBill, nextInvoiceNo, billPrintHtml, printBill, syncSoon, memory, money, kgPrice
} from '../../services/millActions';
import { BigButton, Card, Stepper, ChoiceRow, ResultPanel, PageHeader, useHotkeys, confirmDiscard } from '../ui';
import PrintPreview from '../PrintPreview';
import { T, tx } from '../i18n';

const TYPE_NAME = { P: 'P (Polished)', N: 'N (Niudu)' };

export default function NewBill() {
    const navigate = useNavigate();
    const [catalog, setCatalog] = useState(null);
    const [refs, setRefs] = useState({ customers: [], vehicles: [], drivers: [] });
    const [base, setBase] = useState(memory.get('variety'));
    const [rows, setRows] = useState(null);
    const [kgRates, setKgRates] = useState({ P: 0, N: 0 });
    const [editPrices, setEditPrices] = useState(false);
    const [customerId, setCustomerId] = useState(undefined);
    const [vehicleNo, setVehicleNo] = useState(memory.get('vehicle', ''));
    const [driverName, setDriverName] = useState(memory.get('driver', ''));
    const [date, setDate] = useState(dayjs());
    const [invoicePreviewNo, setInvoicePreviewNo] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const stepperRefs = useRef([]);

    useEffect(() => {
        (async () => {
            const [cat, r, inv] = await Promise.all([getVarietyCatalog(), loadSaleRefs(), nextInvoiceNo()]);
            setCatalog(cat);
            setRefs(r);
            setInvoicePreviewNo(inv);
            const chosen = cat.find(v => v.base === base) || cat[0];
            if (chosen) selectVariety(chosen);
        })();
    }, []);

    const variety = useMemo(() => (catalog || []).find(v => v.base === base), [catalog, base]);

    const selectVariety = (v) => {
        setBase(v.base);
        memory.set('variety', v.base);
        setKgRates({ P: kgPrice(v.P), N: kgPrice(v.N) });
        setRows(prev => rowsForVariety(v, prev));
    };

    const setQty = (t, w, qty) => setRows(prev => ({ ...prev, [t]: { ...prev[t], [w]: { ...prev[t][w], qty } } }));
    const setKgRate = (t, rate) => {
        setKgRates(prev => ({ ...prev, [t]: rate || 0 }));
        setRows(prev => ({ ...prev, [t]: Object.fromEntries(BAG_SIZES.map(w => [w, { ...prev[t][w], price: (rate || 0) * w }])) }));
    };
    const setBagPrice = (t, w, price) => setRows(prev => ({ ...prev, [t]: { ...prev[t], [w]: { ...prev[t][w], price: price || 0 } } }));
    const pickVehicle = (v) => {
        setVehicleNo(v || '');
        const found = refs.vehicles.find(x => x.value === v);
        if (found?.driver) setDriverName(found.driver);
    };

    const total = rows ? rowsTotal(rows) : 0;
    const bagCount = rows ? rowsBags(rows) : 0;
    const isBlank = bagCount === 0;
    const customer = refs.customers.find(c => c.id === customerId) || null;
    const recentVehicles = memory.get('recentVehicles', []);

    // Live preview = exactly the bill that will be saved and printed
    const draftItems = useMemo(() => {
        try { return rows && variety ? itemsFromRows(rows, variety) : []; } catch (e) { return []; }
    }, [rows, variety]);
    const previewHtml = useMemo(() => billPrintHtml(buildSaleBill({
        invoiceNo: invoicePreviewNo || '…', customer, vehicleNo, driverName, date, items: draftItems
    })), [invoicePreviewNo, customer, vehicleNo, driverName, date, draftItems]);

    const rememberDelivery = () => {
        memory.set('vehicle', vehicleNo);
        memory.set('driver', driverName);
        if (vehicleNo) memory.set('recentVehicles', [vehicleNo, ...recentVehicles.filter(v => v !== vehicleNo)].slice(0, 5));
    };

    const resetForm = async () => {
        if (variety) setRows(rowsForVariety(variety));
        setCustomerId(undefined);
        setDate(dayjs());
        setResult(null);
        setInvoicePreviewNo(await nextInvoiceNo());
        setTimeout(() => stepperRefs.current[0]?.focus(), 50);
    };

    const doPrint = async (bill) => {
        setResult(r => ({ ...r, printing: true, printError: null }));
        const res = await printBill(bill);
        setResult(r => ({ ...r, printing: false, printed: res.success, printError: res.success ? null : res.message }));
    };

    const save = async (andPrint) => {
        if (busy || !rows) return;
        let items;
        try {
            items = itemsFromRows(rows, variety, tx('newBill'));
        } catch (e) {
            Modal.error({ title: e.message });
            return;
        }
        const zeroPrice = items.find(i => !(Number(i.UNIT_PRICE) > 0));
        if (zeroPrice) {
            setEditPrices(true);
            Modal.warning({ title: `${zeroPrice.BAG_WEIGHT}kg price is Rs 0`, content: 'Enter the price per kg (Change price), then save again.' });
            return;
        }
        // No bags = blank bill (Rs 0) on purpose: amounts are written by hand and settled later
        setBusy(true);
        try {
            const bill = await createSaleBill({ customer, vehicleNo, driverName, date, items });
            rememberDelivery();
            setResult({ bill, printing: false, printed: false });
            syncSoon();
            if (andPrint) await doPrint(bill);
        } catch (e) {
            Modal.error({ title: 'Could not save the bill', content: e.message });
        } finally {
            setBusy(false);
        }
    };

    const leave = () => {
        if (bagCount > 0 && !result) confirmDiscard(() => navigate('/'));
        else navigate('/');
    };

    useHotkeys({
        F9: () => (result ? resetForm() : save(true)),
        Escape: () => (result ? resetForm() : leave())
    }, [rows, busy, result, customerId, vehicleNo, driverName, date, base]);

    // ── After saving: result stays on screen ──
    if (result) {
        const b = result.bill;
        const blank = Number(b.TOTAL_AMOUNT) === 0;
        return (
            <div className="space-y-5">
                <PageHeader k="newBill" icon={<FileAddOutlined />} />
                <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
                    <ResultPanel
                        state={result.printing ? 'busy' : result.printError ? 'error' : 'success'}
                        title={result.printing ? tx('printing') : result.printError ? `${tx('saved')} ✓ · ${tx('printFailed')}` : `${tx('saved')} ✓${result.printed ? ` · ${tx('printed')}` : ''}`}
                        lines={[
                            b.INVOICE_NO,
                            `${b.CUSTOMER_NAME || 'Walk-in'} · ${blank ? tx('blank') + ' (Rs 0)' : money(b.TOTAL_AMOUNT)}`,
                            result.printError && `Printer: ${result.printError}`
                        ]}
                        actions={<>
                            <BigButton color="blue" icon={<FileAddOutlined />} onClick={resetForm} hint="F9"><T k="another" inline /></BigButton>
                            <BigButton color="light" icon={<PrinterOutlined />} loading={result.printing} onClick={() => doPrint(b)}><T k="printAgain" inline /></BigButton>
                            {!blank && <BigButton color="light" icon={<BarcodeOutlined />} onClick={() => navigate(`/labels?billId=${b.LOCAL_ID}`)}><T k="labels" inline /></BigButton>}
                            <BigButton color="light" onClick={() => navigate('/')}><T k="home" inline /></BigButton>
                        </>}
                    />
                    <Card><PrintPreview html={billPrintHtml(b)} onPrint={() => doPrint(b)} printing={result.printing} title={b.INVOICE_NO} /></Card>
                </div>
            </div>
        );
    }

    if (!catalog || !rows) return <div className="py-24 text-center"><Spin size="large" /></div>;

    let stepIndex = 0;
    return (
        <div className="space-y-5">
            <PageHeader k="newBill" icon={<FileAddOutlined />} />
            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                    {/* 1. Who / which lorry / date — always visible, it is on every bill */}
                    <Card>
                        <div className="mb-4 text-xl font-extrabold text-slate-800">1. <T k="customer" inline /> · <T k="vehicle" inline /> · <T k="driver" inline /></div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <div className="mb-2 text-base font-bold text-slate-600"><T k="customer" inline /></div>
                                <Select size="large" showSearch allowClear className="w-full" placeholder={tx('walkIn')} value={customerId}
                                    onChange={setCustomerId} optionFilterProp="label"
                                    options={refs.customers.map(c => ({ value: c.id, label: [c.name, c.phone, c.address].filter(Boolean).join(' - ') }))} />
                            </div>
                            <div>
                                <div className="mb-2 text-base font-bold text-slate-600"><T k="vehicle" inline /></div>
                                <Select size="large" showSearch allowClear className="w-full" placeholder={tx('vehicle')} value={vehicleNo || undefined}
                                    onChange={pickVehicle}
                                    options={refs.vehicles.map(v => ({ value: v.value, label: v.driver ? `${v.value} (${v.driver})` : v.value }))} />
                                {recentVehicles.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {recentVehicles.map(v => (
                                            <button key={v} type="button" onClick={() => pickVehicle(v)}
                                                className={`rounded-xl border-2 px-3 py-1 text-sm font-bold ${vehicleNo === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-600 hover:border-blue-400'}`}>{v}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="mb-2 text-base font-bold text-slate-600"><T k="driver" inline /></div>
                                <Select size="large" showSearch allowClear className="w-full" placeholder={tx('driver')} value={driverName || undefined}
                                    onChange={(v) => setDriverName(v || '')} options={refs.drivers.map(d => ({ value: d, label: d }))} />
                            </div>
                            <div className="md:col-span-2">
                                <div className="mb-2 text-base font-bold text-slate-600"><T k="date" inline /></div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <ChoiceRow size="md" value={date.isSame(dayjs(), 'day') ? 'today' : date.isSame(dayjs().add(1, 'day'), 'day') ? 'tomorrow' : 'other'}
                                        onChange={(v) => setDate(v === 'tomorrow' ? dayjs().add(1, 'day') : dayjs())}
                                        options={[{ value: 'today', label: <T k="today" inline /> }, { value: 'tomorrow', label: <T k="tomorrow" inline /> }]} />
                                    <DatePicker size="large" value={date} onChange={(d) => setDate(d || dayjs())} format="YYYY-MM-DD" allowClear={false} />
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* 2. Rice variety */}
                    <Card>
                        <div className="mb-3 text-xl font-extrabold text-slate-800">2. <T k="variety" inline /></div>
                        <ChoiceRow value={base} onChange={(b) => selectVariety(catalog.find(v => v.base === b))}
                            options={catalog.map(v => ({ value: v.base, label: v.base }))} />
                    </Card>

                    {/* 3. Bags (leave all 0 for a blank Rs 0 bill) */}
                    <Card>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xl font-extrabold text-slate-800">3. Bags <span className="text-base font-normal text-slate-400">(0 = blank bill, written by hand)</span></div>
                            <button type="button" onClick={() => setEditPrices(v => !v)}
                                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-base font-bold ${editPrices ? 'bg-amber-100 text-amber-800' : 'text-slate-500 hover:bg-slate-100'}`}>
                                <EditOutlined /> <T k="changePrice" inline />
                            </button>
                        </div>
                        <div className="space-y-6">
                            {TYPES.filter(t => variety?.[t]).map(t => (
                                <div key={t}>
                                    <div className="mb-2 flex flex-wrap items-center gap-3">
                                        <span className={`rounded-xl px-3 py-1 text-base font-black text-white ${t === 'P' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{TYPE_NAME[t]}</span>
                                        {editPrices ? (
                                            <span className="flex items-center gap-2 text-base text-slate-600">1 kg = Rs
                                                <InputNumber size="large" min={0} step={0.5} value={kgRates[t]} onChange={(v) => setKgRate(t, v)} />
                                            </span>
                                        ) : kgRates[t] > 0 ? (
                                            <span className="text-base text-slate-500">1 kg = {money(kgRates[t])}</span>
                                        ) : (
                                            <button type="button" onClick={() => setEditPrices(true)} className="rounded-lg bg-amber-100 px-3 py-1 text-base font-bold text-amber-800">⚠ Set price per kg</button>
                                        )}
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        {BAG_SIZES.map(w => {
                                            const idx = stepIndex++;
                                            const qty = rows[t][w].qty;
                                            return (
                                                <div key={w} className={`rounded-2xl border-2 p-4 ${qty > 0 ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                                                    <div className="mb-2 flex items-baseline justify-between">
                                                        <span className="text-2xl font-black text-slate-900">{w} kg</span>
                                                        {editPrices ? (
                                                            <InputNumber min={0} value={rows[t][w].price} onChange={(v) => setBagPrice(t, w, v)} />
                                                        ) : (
                                                            <span className="text-sm text-slate-500">{money(rows[t][w].price)}</span>
                                                        )}
                                                    </div>
                                                    <Stepper value={qty} onChange={(n) => setQty(t, w, n)}
                                                        inputRef={(el) => { stepperRefs.current[idx] = el; }}
                                                        onEnter={() => stepperRefs.current[idx + 1]?.focus()} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Summary + exact print preview */}
                <div className="space-y-4 self-start lg:sticky lg:top-24">
                    <Card className="space-y-4">
                        <div className="text-base text-slate-500">{customer ? customer.name : tx('walkIn')} · {vehicleNo || '-'}</div>
                        <div className="space-y-1">
                            {TYPES.flatMap(t => BAG_SIZES.filter(w => rows[t][w].qty > 0).map(w => (
                                <div key={`${t}${w}`} className="flex justify-between text-lg">
                                    <span>{t} {w}kg × {rows[t][w].qty}</span>
                                    <span className="font-mono">{money(rows[t][w].qty * rows[t][w].price)}</span>
                                </div>
                            )))}
                        </div>
                        <div className="border-t-2 border-dashed border-slate-200 pt-3">
                            {isBlank ? (
                                <div className="text-2xl font-black text-slate-700">📄 <T k="blank" inline /> (Rs 0)</div>
                            ) : (
                                <>
                                    <div className="text-base text-slate-500">{bagCount} <T k="bags" inline /></div>
                                    <div className="text-4xl font-black text-slate-900">{money(total)}</div>
                                </>
                            )}
                        </div>
                        <BigButton color="green" icon={<PrinterOutlined />} loading={busy} onClick={() => save(true)} hint="F9" className="w-full">
                            <T k="saveAndPrint" inline />
                        </BigButton>
                        <BigButton color="light" icon={<SaveOutlined />} disabled={busy} onClick={() => save(false)} className="w-full">
                            <T k="saveOnly" inline />
                        </BigButton>
                    </Card>
                    <Card className="!p-3">
                        <div className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Print preview</div>
                        <PrintPreview html={previewHtml} title={invoicePreviewNo} />
                    </Card>
                </div>
            </div>
        </div>
    );
}
