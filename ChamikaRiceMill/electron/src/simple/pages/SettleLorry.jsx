import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input, InputNumber, DatePicker, Modal, Spin } from 'antd';
import { CheckCircleFilled, EditOutlined, PlusOutlined, DeleteOutlined, LockFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import db from '../../services/db';
import syncService from '../../services/syncService';
import {
    BAG_SIZES, TYPES, getVarietyCatalog, rowsForVariety, rowsFromItems, rowsTotal, rowsBags, parseItems, billAmount,
    billsOfNote, saveDispatchSettlement, memory, money
} from '../../services/millActions';
import { BigButton, Card, Stepper, ChoiceRow, ResultPanel, PageHeader, useHotkeys, confirmDiscard } from '../ui';
import { T, tx } from '../i18n';

const draftKey = (no) => `settle_draft_${no}`;

// Bag entry for one bill: steppers + price per bag
function BagEditor({ rows, onChange, variety }) {
    const set = (t, w, field, val) => onChange({ ...rows, [t]: { ...rows[t], [w]: { ...rows[t][w], [field]: val } } });
    return (
        <div className="space-y-5">
            {TYPES.filter(t => variety?.[t]).map(t => (
                <div key={t}>
                    <span className={`mb-2 inline-block rounded-xl px-3 py-1 text-base font-black text-white ${t === 'P' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{t}</span>
                    <div className="grid gap-3 md:grid-cols-3">
                        {BAG_SIZES.map(w => (
                            <div key={w} className={`rounded-2xl border-2 p-3 ${rows[t][w].qty > 0 ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="text-xl font-black">{w} kg</span>
                                    <span className="flex items-center gap-1 text-sm text-slate-500">Rs
                                        <InputNumber min={0} value={rows[t][w].price} onChange={(v) => set(t, w, 'price', v || 0)} style={{ width: 100 }} />
                                    </span>
                                </div>
                                <Stepper value={rows[t][w].qty} onChange={(n) => set(t, w, 'qty', n)} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function PaymentEditor({ entry, onChange, total }) {
    const cheques = entry.cheques || [];
    const setChq = (i, field, val) => onChange({ ...entry, cheques: cheques.map((c, idx) => idx === i ? { ...c, [field]: val } : c) });
    return (
        <div className="space-y-3">
            <ChoiceRow value={entry.paymentMethod} onChange={(m) => onChange({ ...entry, paymentMethod: m, cheques: m === 'cheque' && cheques.length === 0 ? [{ AMOUNT: total }] : cheques })}
                options={[{ value: 'cash', label: <>💵 <T k="cash" inline /></> }, { value: 'cheque', label: <>🏦 <T k="cheque" inline /></> }]} />
            {entry.paymentMethod === 'cheque' && cheques.map((c, i) => (
                <div key={i} className="grid gap-2 rounded-2xl bg-slate-50 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                    <Input size="large" placeholder={tx('chequeNo')} value={c.CHEQUE_NUMBER} onChange={(e) => setChq(i, 'CHEQUE_NUMBER', e.target.value)} />
                    <Input size="large" placeholder={tx('bank')} value={c.BANK} onChange={(e) => setChq(i, 'BANK', e.target.value)} />
                    <DatePicker size="large" placeholder={tx('dueDate')} value={c.DUE_DATE ? dayjs(c.DUE_DATE) : null} onChange={(d) => setChq(i, 'DUE_DATE', d ? d.format('YYYY-MM-DD') : null)} />
                    <InputNumber size="large" placeholder={tx('amount')} value={c.AMOUNT} onChange={(v) => setChq(i, 'AMOUNT', v)} style={{ width: '100%' }} />
                    <button type="button" className="px-3 text-xl text-rose-600" onClick={() => onChange({ ...entry, cheques: cheques.filter((_, idx) => idx !== i) })}><DeleteOutlined /></button>
                </div>
            ))}
            {entry.paymentMethod === 'cheque' && (
                <button type="button" className="text-base font-bold text-blue-700" onClick={() => onChange({ ...entry, cheques: [...cheques, {}] })}><PlusOutlined /> Add cheque</button>
            )}
            <Input size="large" placeholder={tx('remark')} value={entry.remark} onChange={(e) => onChange({ ...entry, remark: e.target.value })} />
        </div>
    );
}

export default function SettleLorry() {
    const navigate = useNavigate();
    const { dispatchNo } = useParams();
    const [note, setNote] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [entries, setEntries] = useState([]);   // one per printed bill
    const [extras, setExtras] = useState([]);     // handwritten bills written on the trip
    const [step, setStep] = useState(0);          // 0..n-1 bills, n = extras, n+1 = review
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            const no = decodeURIComponent(dispatchNo);
            const n = await db.dispatch_notes.where('DISPATCH_NO').equals(no).first();
            if (!n) { setError('Lorry trip not found on this PC. Press Sync and try again.'); return; }
            const [bills, cat] = await Promise.all([billsOfNote(n), getVarietyCatalog()]);
            // Bills made on another PC / the web have no item lines here -> take them from the server trip details
            const serverItems = {};
            if (syncService.isOnline && n.DISPATCH_ID && bills.some(b => parseItems(b).length === 0)) {
                try {
                    const res = await axios.get(`${syncService.apiBase}/api/mill/dispatch/${n.DISPATCH_ID}`, { timeout: 8000 });
                    (res.data?.result?.BILLS || []).forEach(sb => { if (sb.INVOICE_NO) serverItems[sb.INVOICE_NO] = sb.ITEMS || []; });
                } catch (e) { /* offline or slow: officer enters bags */ }
            }
            const printedOf = (b) => { const local = parseItems(b); return local.length > 0 ? local : (serverItems[b.INVOICE_NO] || []); };
            setNote(n);
            setCatalog(cat);
            const draft = memory.get(draftKey(no));
            const defaultBase = memory.get('variety') || cat[0]?.base;
            const built = bills.map(b => {
                const printedItems = printedOf(b);
                const saved = draft?.entries?.find(e => e.invoice === b.INVOICE_NO);
                if (saved) return { ...saved, bill: b, printedItems };
                const { base, rows } = rowsFromItems(printedItems, cat);
                const blank = printedItems.length === 0;
                const v = cat.find(x => x.base === (base || defaultBase));
                return {
                    invoice: b.INVOICE_NO,
                    bill: b,
                    printedItems,
                    unknownPrint: blank && billAmount(b) > 0,
                    base: base || defaultBase,
                    rows: blank ? rowsForVariety(v) : rows,
                    decided: blank ? 'changed' : null,
                    paymentMethod: b.PAYMENT_METHOD === 'cheque' ? 'cheque' : 'cash',
                    remark: b.REMARK || '',
                    cheques: []
                };
            });
            setEntries(built);
            setExtras(draft?.extras || []);
            if (typeof draft?.step === 'number') setStep(Math.min(draft.step, built.length + 1));
        })();
    }, [dispatchNo]);

    // Autosave draft so nothing typed is lost (power cut, closing the app...)
    useEffect(() => {
        if (!note || result) return;
        memory.set(draftKey(note.DISPATCH_NO), {
            step,
            entries: entries.map(({ bill, printedItems, ...rest }) => rest),
            extras
        });
    }, [entries, extras, step, note, result]);

    const varietyOf = (base) => catalog.find(v => v.base === base);
    const settledAlready = (e) => Number(e.bill.IS_SETTLED) === 1 && !note?.SETTLE_PENDING;
    const n = entries.length;
    const updateEntry = (i, patch) => setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e));
    const entryTotal = (e) => rowsTotal(e.rows);

    const totals = useMemo(() => {
        const all = [...entries.filter(e => !settledAlready(e)), ...extras];
        return {
            cash: all.filter(e => e.paymentMethod !== 'cheque').reduce((s, e) => s + entryTotal(e), 0),
            cheque: all.filter(e => e.paymentMethod === 'cheque').reduce((s, e) => s + entryTotal(e), 0),
            bags: all.reduce((s, e) => s + rowsBags(e.rows), 0)
        };
    }, [entries, extras]);

    // Bags loaded on the lorry (trip note) vs bags settled on bills + handwritten bills, per size
    const bagCheck = useMemo(() => {
        const settledBy = { 5: 0, 10: 0, 25: 0 };
        [...entries.map(e => (settledAlready(e) ? null : e.rows)), ...extras.map(x => x.rows)].filter(Boolean).forEach(rows => {
            TYPES.forEach(t => BAG_SIZES.forEach(w => { settledBy[w] += Number(rows[t][w].qty) || 0; }));
        });
        // already-settled bills keep their own (printed) bags
        entries.filter(settledAlready).forEach(e => (e.printedItems || []).forEach(i => {
            const w = Number(i.BAG_WEIGHT); if (settledBy[w] !== undefined) settledBy[w] += Number(i.BAG_COUNT) || 0;
        }));
        const loadedBy = note ? { 5: Number(note.TOTAL_5KG) || 0, 10: Number(note.TOTAL_10KG) || 0, 25: Number(note.TOTAL_25KG) || 0 } : { 5: 0, 10: 0, 25: 0 };
        const known = note && (note.TOTAL_5KG != null || note.TOTAL_10KG != null || note.TOTAL_25KG != null);
        return { settledBy, loadedBy, known, off: known && BAG_SIZES.some(w => loadedBy[w] !== settledBy[w]) };
    }, [entries, extras, note]);

    const canNext = () => {
        if (step < n) {
            const e = entries[step];
            return settledAlready(e) || e.decided !== null;
        }
        return true;
    };

    const goNext = () => { if (canNext()) setStep(s => Math.min(s + 1, n + 1)); };
    const goBack = () => setStep(s => Math.max(0, s - 1));

    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const billEntries = entries.filter(e => !settledAlready(e)).map(e => ({
                bill: e.bill, variety: varietyOf(e.base), rows: e.rows, paymentMethod: e.paymentMethod, remark: e.remark, cheques: e.cheques
            }));
            const extraEntries = extras.map(x => ({ variety: varietyOf(x.base), rows: x.rows, paymentMethod: x.paymentMethod, remark: x.remark, cheques: x.cheques }));
            const res = await saveDispatchSettlement(note, billEntries, extraEntries);
            memory.set(draftKey(note.DISPATCH_NO), null);
            setResult(res);
        } catch (e) {
            Modal.error({ title: 'Could not settle', content: e.message });
        } finally {
            setBusy(false);
        }
    };

    const leave = () => confirmDiscard(() => { memory.set(draftKey(note?.DISPATCH_NO), null); navigate('/lorries'); });

    useHotkeys({
        Enter: (e) => { if (e.target?.tagName !== 'INPUT' && e.target?.tagName !== 'TEXTAREA') { if (step <= n) goNext(); } },
        F9: () => { if (step === n + 1) confirm(); }
    }, [step, entries, extras, busy, note]);

    if (error) return <ResultPanel state="error" title={error} actions={<BigButton color="light" onClick={() => navigate('/lorries')}><T k="back" inline /></BigButton>} />;
    if (!note) return <div className="py-24 text-center"><Spin size="large" /></div>;

    if (String(note.STATUS || '').toUpperCase() === 'SETTLED' && !result) {
        return <ResultPanel title={`${note.DISPATCH_NO} · ${tx('settled')}`} lines={['This lorry trip is already settled and locked.']}
            actions={<BigButton color="light" onClick={() => navigate('/lorries')}><T k="lorries" inline /></BigButton>} />;
    }

    if (result) {
        return (
            <div className="space-y-5">
                <PageHeader k="settleLorry" icon="✅" />
                <ResultPanel title={`${tx('settled')} ✓ · ${note.DISPATCH_NO}`}
                    lines={[`${tx('cashToCollect')}: ${money(result.cash)}`, result.cheque > 0 && `${tx('chequesToCollect')}: ${money(result.cheque)}`, `${result.bills} bills${result.extras ? ` + ${result.extras} handwritten` : ''}`]}
                    actions={<>
                        <BigButton color="blue" onClick={() => navigate('/lorries')}><T k="lorries" inline /></BigButton>
                        <BigButton color="light" onClick={() => navigate('/')}><T k="home" inline /></BigButton>
                    </>} />
            </div>
        );
    }

    const progress = (
        <div className="flex flex-wrap gap-2">
            {entries.map((e, i) => (
                <button key={e.invoice} type="button" onClick={() => setStep(i)}
                    className={`h-10 min-w-[40px] rounded-xl px-3 text-base font-black ${i === step ? 'bg-blue-600 text-white' : (settledAlready(e) || e.decided) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {i + 1}
                </button>
            ))}
            <button type="button" onClick={() => setStep(n)} className={`h-10 rounded-xl px-3 text-base font-black ${step === n ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>+</button>
            <button type="button" onClick={() => setStep(n + 1)} className={`h-10 rounded-xl px-3 text-base font-black ${step === n + 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>✓</button>
        </div>
    );

    const nav = (
        <div className="flex flex-wrap justify-between gap-3">
            <BigButton color="light" onClick={step === 0 ? leave : goBack}>← <T k={step === 0 ? 'cancel' : 'back'} inline /></BigButton>
            {step <= n && <BigButton color="blue" disabled={!canNext()} onClick={goNext} hint="Enter"><T k="next" inline /> →</BigButton>}
            {step === n + 1 && <BigButton color="green" loading={busy} onClick={confirm} hint="F9"><CheckCircleFilled /> <T k="confirm" inline /></BigButton>}
        </div>
    );

    let body;
    if (step < n) {
        const e = entries[step];
        const locked = settledAlready(e);
        const printed = e.printedItems || [];
        body = (
            <Card className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-base text-slate-500">Bill {step + 1} / {n}</div>
                        <div className="text-2xl font-extrabold text-slate-900">{e.bill.CUSTOMER_NAME || 'Walk-in'}</div>
                        <div className="font-mono text-sm text-slate-500">{e.invoice}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-base text-slate-500">Printed</div>
                        <div className="text-2xl font-black">{printed.length === 0 ? <T k="blank" inline /> : money(billAmount(e.bill))}</div>
                    </div>
                </div>

                {e.unknownPrint && !locked && (
                    <div className="rounded-2xl bg-amber-50 p-4 text-base text-amber-800">⚠ The printed bags of this bill are not on this PC (made on another PC). Enter the bags as delivered.</div>
                )}
                {locked ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-lg text-emerald-800"><LockFilled /> Already settled on its own — nothing to do.</div>
                ) : (
                    <>
                        {printed.length > 0 && (
                            <div className="rounded-2xl bg-slate-50 p-4 text-lg">
                                {printed.map((i, idx) => <div key={idx}>{i.ITEM_NAME || i.SYSTEM_CODE} · {i.BAG_WEIGHT}kg × {i.BAG_COUNT}</div>)}
                            </div>
                        )}
                        {printed.length > 0 && (
                            <ChoiceRow value={e.decided} onChange={(d) => {
                                if (d === 'asPrinted') updateEntry(step, { decided: d, rows: rowsFromItems(printed, catalog).rows });
                                else updateEntry(step, { decided: d });
                            }} options={[
                                { value: 'asPrinted', label: <>✓ <T k="asPrinted" inline /></> },
                                { value: 'changed', label: <><EditOutlined /> <T k="changeBags" inline /></> }
                            ]} />
                        )}
                        {e.decided === 'changed' && (
                            <div className="space-y-4">
                                {printed.length === 0 && (
                                    <div>
                                        <div className="mb-2 text-base font-bold text-slate-600"><T k="variety" inline /></div>
                                        <ChoiceRow size="md" value={e.base} onChange={(b) => updateEntry(step, { base: b, rows: rowsForVariety(varietyOf(b), e.rows) })}
                                            options={catalog.map(v => ({ value: v.base, label: v.base }))} />
                                    </div>
                                )}
                                <BagEditor rows={e.rows} variety={varietyOf(e.base)} onChange={(rows) => updateEntry(step, { rows })} />
                            </div>
                        )}
                        {e.decided && (
                            <div className="space-y-3 border-t-2 border-dashed border-slate-200 pt-4">
                                <div className="text-3xl font-black text-slate-900">{money(entryTotal(e))} <span className="text-base font-normal text-slate-500">· {rowsBags(e.rows)} bags</span></div>
                                <PaymentEditor entry={e} total={entryTotal(e)} onChange={(patch) => updateEntry(step, patch)} />
                            </div>
                        )}
                    </>
                )}
            </Card>
        );
    } else if (step === n) {
        body = (
            <Card className="space-y-5">
                <div className="text-2xl font-extrabold text-slate-900"><T k="addHandwritten" inline /></div>
                <div className="text-base text-slate-500">Bills written by hand on the trip (not printed). Skip if none.</div>
                {extras.map((x, i) => (
                    <div key={i} className="space-y-4 rounded-3xl border-2 border-amber-200 bg-amber-50/40 p-4">
                        <div className="flex items-center justify-between">
                            <div className="text-xl font-extrabold">Handwritten bill {i + 1}</div>
                            <button type="button" className="text-lg font-bold text-rose-600" onClick={() => setExtras(prev => prev.filter((_, idx) => idx !== i))}><DeleteOutlined /> Remove</button>
                        </div>
                        <ChoiceRow size="md" value={x.base} onChange={(b) => setExtras(prev => prev.map((e, idx) => idx === i ? { ...e, base: b, rows: rowsForVariety(varietyOf(b), e.rows) } : e))}
                            options={catalog.map(v => ({ value: v.base, label: v.base }))} />
                        <BagEditor rows={x.rows} variety={varietyOf(x.base)} onChange={(rows) => setExtras(prev => prev.map((e, idx) => idx === i ? { ...e, rows } : e))} />
                        <div className="text-2xl font-black">{money(entryTotal(x))}</div>
                        <PaymentEditor entry={x} total={entryTotal(x)} onChange={(patch) => setExtras(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))} />
                    </div>
                ))}
                <BigButton color="amber" icon={<PlusOutlined />} onClick={() => {
                    const base = memory.get('variety') || catalog[0]?.base;
                    setExtras(prev => [...prev, { base, rows: rowsForVariety(varietyOf(base)), paymentMethod: 'cash', remark: '', cheques: [] }]);
                }}><T k="addHandwritten" inline /></BigButton>
            </Card>
        );
    } else {
        body = (
            <Card className="space-y-4">
                <div className="text-2xl font-extrabold text-slate-900"><T k="review" inline /></div>
                <div className="divide-y divide-slate-100">
                    {entries.map((e, i) => (
                        <button key={e.invoice} type="button" onClick={() => setStep(i)} className="flex w-full items-center justify-between py-3 text-left text-lg hover:bg-slate-50">
                            <span>{i + 1}. {e.bill.CUSTOMER_NAME || 'Walk-in'} <span className="font-mono text-sm text-slate-400">{e.invoice}</span></span>
                            <span className="font-bold">{settledAlready(e) ? <LockFilled /> : `${rowsBags(e.rows)} bags · ${money(entryTotal(e))} · ${e.paymentMethod === 'cheque' ? tx('cheque') : tx('cash')}`}</span>
                        </button>
                    ))}
                    {extras.map((x, i) => (
                        <div key={`x${i}`} className="flex items-center justify-between py-3 text-lg">
                            <span>✍ Handwritten {i + 1}</span>
                            <span className="font-bold">{rowsBags(x.rows)} bags · {money(entryTotal(x))}</span>
                        </div>
                    ))}
                </div>
                {bagCheck.known && (
                    <div className={`rounded-3xl border-2 p-4 ${bagCheck.off ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-white'}`}>
                        <div className="mb-2 text-lg font-extrabold text-slate-900">Bags: loaded vs settled</div>
                        <table className="w-full text-lg">
                            <thead><tr className="text-left text-base text-slate-500"><th>Size</th><th>Loaded</th><th>Settled</th><th>Difference</th></tr></thead>
                            <tbody>
                                {BAG_SIZES.map(w => {
                                    const d = bagCheck.loadedBy[w] - bagCheck.settledBy[w];
                                    return (
                                        <tr key={w} className="border-t border-slate-200">
                                            <td className="py-1 font-bold">{w} kg</td>
                                            <td>{bagCheck.loadedBy[w]}</td>
                                            <td>{bagCheck.settledBy[w]}</td>
                                            <td className={`font-black ${d === 0 ? 'text-emerald-700' : 'text-amber-800'}`}>{d === 0 ? '✓' : d > 0 ? `${d} not settled` : `${-d} more than loaded`}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {bagCheck.off && (
                            <div className="mt-2 text-base font-bold text-amber-900">
                                Bags do not match. Fill the blank bills or add a handwritten bill for the extra bags (or the lorry brought them back).
                            </div>
                        )}
                    </div>
                )}
                <div className="rounded-3xl bg-emerald-50 p-5">
                    <div className="text-lg text-emerald-800"><T k="cashToCollect" inline /></div>
                    <div className="text-5xl font-black text-emerald-900">{money(totals.cash)}</div>
                    {totals.cheque > 0 && <div className="mt-2 text-xl text-slate-700"><T k="chequesToCollect" inline />: <b>{money(totals.cheque)}</b></div>}
                    <div className="mt-1 text-base text-slate-600">{totals.bags} bags delivered</div>
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader k="settleLorry" icon="✅" sub={`🚚 ${note.LORRY_NO || '-'} · ${note.DRIVER_NAME || '-'} · ${note.DISPATCH_NO}`} />
            <Card className="!p-4">{progress}</Card>
            {body}
            {nav}
        </div>
    );
}
