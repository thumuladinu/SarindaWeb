import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Select, Modal } from 'antd';
import { SaveOutlined, CalculatorOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';
import { memory, money, isToday } from '../../services/millActions';
import { BigButton, Card, ChoiceRow, PageHeader, ResultPanel, useHotkeys } from '../ui';
import { T, tx } from '../i18n';

const DEFAULT_CATS = ['Driver Trip & Fuel', 'Lorry Handling (Load Up/Down)', 'Dryer Labor (Load Up/Down)', 'Fuel & Transportation',
    'Electricity & Utilities', 'Machinery Maintenance', 'Office & Supplies', 'Miscellaneous'];
const ICONS = ['🚚', '🏗', '🔥', '⛽', '💡', '🔧', '📎', '📦', '🧾', '👷'];

// Big number pad for the amount
function Keypad({ value, onChange }) {
    const press = (k) => {
        if (k === 'C') return onChange('');
        if (k === '⌫') return onChange(value.slice(0, -1));
        if (k === '.' && value.includes('.')) return;
        if (value.includes('.') && value.split('.')[1].length >= 2) return;
        onChange((value === '0' ? '' : value) + k);
    };
    return (
        <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => (
                <button key={k} type="button" onClick={() => press(k)}
                    className="h-16 rounded-2xl bg-slate-100 text-3xl font-black text-slate-800 hover:bg-slate-200 active:bg-slate-300">{k}</button>
            ))}
            <button type="button" onClick={() => press('C')} className="col-span-3 h-12 rounded-2xl bg-slate-200 text-lg font-bold text-slate-600"><T k="clear" inline /></button>
        </div>
    );
}

export default function QuickExpense() {
    const navigate = useNavigate();
    const [cats, setCats] = useState([]);
    const [staff, setStaff] = useState([]);
    const [category, setCategory] = useState(memory.get('expenseCategory'));
    const [amount, setAmount] = useState('');
    const [paidTo, setPaidTo] = useState('');
    const [method, setMethod] = useState('cash');
    const [note, setNote] = useState('');
    const [day, setDay] = useState('today');
    const [today, setToday] = useState([]);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const load = async () => {
        const [catList, stf, exps] = await Promise.all([
            db.expense_categories.toArray().catch(() => []),
            db.staff.toArray().catch(() => []),
            db.expenses.toArray().catch(() => [])
        ]);
        const names = (catList.length ? catList.filter(c => Number(c.IS_ACTIVE ?? 1) !== 0).map(c => c.NAME) : DEFAULT_CATS).filter(Boolean);
        setCats(names);
        setStaff(stf.map(s => s.NAME).filter(Boolean));
        setToday(exps.filter(e => isToday(e.DATE)).sort((a, b) => String(b.DATE).localeCompare(String(a.DATE))));
    };
    useEffect(() => { load(); }, []);

    const save = async () => {
        if (busy) return;
        const amt = parseFloat(amount);
        if (!category) { Modal.info({ title: 'Choose what the money was for' }); return; }
        if (!(amt > 0)) { Modal.info({ title: 'Enter the amount' }); return; }
        setBusy(true);
        try {
            const terminalCode = getTerminalDeviceCode();
            const base = day === 'yesterday' ? dayjs().subtract(1, 'day') : dayjs();
            // Same record as the classic Expenses form
            const payload = {
                EXPENSE_NO: `EXP-${dayjs().format('YYYYMMDD')}-${terminalCode}-${Date.now().toString().slice(-4)}`,
                DEVICE_ID: terminalCode,
                ADDED_BY: getCurrentUserName(),
                CATEGORY_NAME: category,
                AMOUNT: amt,
                PAYMENT_METHOD: method,
                PAID_TO: paidTo || null,
                REF_NO: null,
                DATE: base.hour(dayjs().hour()).minute(dayjs().minute()).second(dayjs().second()).toISOString(),
                NOTES: note || null,
                IS_SYNCED: 0
            };
            await db.expenses.add(payload);
            memory.set('expenseCategory', category);
            if (syncService.isOnline) syncService.syncAll();
            syncService.updatePendingCount();
            setResult(payload);
            load();
        } catch (e) {
            Modal.error({ title: 'Could not save the expense', content: e.message });
        } finally {
            setBusy(false);
        }
    };

    const reset = () => { setAmount(''); setPaidTo(''); setNote(''); setResult(null); };
    useHotkeys({ F9: () => (result ? reset() : save()), Escape: () => (result ? reset() : navigate('/')) }, [category, amount, paidTo, method, note, day, busy, result]);

    const todayTotal = today.reduce((s, e) => s + Number(e.AMOUNT || 0), 0);
    const header = <PageHeader k="expenses" icon="💵" right={<BigButton color="light" icon={<CalculatorOutlined />} onClick={() => navigate('/expenses/full')}>Calculators & history</BigButton>} />;

    if (result) {
        return (
            <div className="space-y-5">
                {header}
                <ResultPanel title={`${tx('saved')} ✓ · ${money(result.AMOUNT)}`} lines={[result.CATEGORY_NAME, result.PAID_TO && `→ ${result.PAID_TO}`, result.EXPENSE_NO]}
                    actions={<>
                        <BigButton color="blue" onClick={reset} hint="F9"><T k="another" inline /></BigButton>
                        <BigButton color="light" onClick={() => navigate('/')}><T k="home" inline /></BigButton>
                    </>} />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {header}
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
                <div className="space-y-5">
                    <Card>
                        <div className="mb-3 text-xl font-extrabold text-slate-800">1. What for?</div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            {cats.map((c, i) => (
                                <button key={c} type="button" onClick={() => setCategory(c)}
                                    className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left text-base font-bold ${category === c ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-800 hover:border-blue-300'}`}>
                                    <span className="text-2xl">{ICONS[i % ICONS.length]}</span>{c}
                                </button>
                            ))}
                        </div>
                    </Card>
                    <Card className="space-y-4">
                        <div className="text-xl font-extrabold text-slate-800">3. Details <span className="text-base font-normal text-slate-400">(optional)</span></div>
                        <div>
                            <div className="mb-2 text-base font-bold text-slate-600">Paid to</div>
                            <Select size="large" showSearch allowClear className="w-full" value={paidTo || undefined} onChange={(v) => setPaidTo(v || '')}
                                options={staff.map(s => ({ value: s, label: s }))} placeholder="Name" />
                        </div>
                        <ChoiceRow size="md" value={method} onChange={setMethod} options={[
                            { value: 'cash', label: <>💵 <T k="cash" inline /></> }, { value: 'bank_transfer', label: '🏦 Bank' }, { value: 'cheque', label: <T k="cheque" inline /> }
                        ]} />
                        <ChoiceRow size="md" value={day} onChange={setDay} options={[{ value: 'today', label: <T k="today" inline /> }, { value: 'yesterday', label: 'Yesterday' }]} />
                        <Input.TextArea rows={2} size="large" placeholder={tx('remark')} value={note} onChange={(e) => setNote(e.target.value)} />
                    </Card>
                    <Card>
                        <div className="mb-2 text-lg font-extrabold text-slate-800"><T k="today" inline /> · {money(todayTotal)}</div>
                        {today.length === 0 ? <div className="text-base text-slate-400">—</div> : today.slice(0, 8).map(e => (
                            <div key={e.LOCAL_ID} className="flex justify-between border-b border-slate-100 py-2 text-base">
                                <span>{e.CATEGORY_NAME}{e.PAID_TO ? ` → ${e.PAID_TO}` : ''}</span><b>{money(e.AMOUNT)}</b>
                            </div>
                        ))}
                    </Card>
                </div>
                <Card className="space-y-4 self-start">
                    <div className="text-xl font-extrabold text-slate-800">2. <T k="amount" inline /></div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right text-4xl font-black text-slate-900">Rs. {amount || '0'}</div>
                    <Keypad value={amount} onChange={setAmount} />
                    <BigButton color="green" icon={<SaveOutlined />} loading={busy} onClick={save} hint="F9" className="w-full"><T k="save" inline /></BigButton>
                </Card>
            </div>
        </div>
    );
}
