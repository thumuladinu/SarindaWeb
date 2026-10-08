import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { useAuth } from '../../context/AuthContext';
import { billStatus, bagSummary, billAmount, isBlankBill, isToday, money } from '../../services/millActions';
import { Tile, Card, Chip, BigButton } from '../ui';
import { T } from '../i18n';

export default function Home() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [bills, setBills] = useState([]);
    const [lorries, setLorries] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);

    const load = async () => {
        const [allBills, notes] = await Promise.all([db.sales_bills.toArray(), db.dispatch_notes.toArray()]);
        const live = allBills.filter(b => !b.DELETE_PENDING);
        setPendingCount(live.filter(b => billStatus(b) === 'pending').length);
        setBills(live.filter(b => isToday(b.CREATED_DATE || b.DATE))
            .sort((a, b) => String(b.CREATED_DATE || '').localeCompare(String(a.CREATED_DATE || ''))));
        setLorries(notes.filter(n => !n.DELETE_PENDING && String(n.STATUS || 'PENDING').toUpperCase() !== 'SETTLED')
            .sort((a, b) => String(b.CREATED_DATE || '').localeCompare(String(a.CREATED_DATE || ''))));
    };

    useEffect(() => {
        load();
        return syncService.subscribe((e) => {
            if (['salesUpdated', 'dispatchUpdated', 'syncComplete'].includes(e)) load();
        });
    }, []);

    const todayTotal = bills.reduce((s, b) => s + billAmount(b), 0);

    return (
        <div className="space-y-6">
            <div>
                <div className="text-3xl font-extrabold text-slate-900">
                    {user?.NAME ? `${user.NAME}, ` : ''}<T k="home" inline />
                </div>
                <div className="text-lg text-slate-500">{dayjs().format('dddd, D MMMM YYYY')}</div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <Tile k="newBill" icon="🧾" color="blue" onClick={() => navigate('/new-bill')} />
                <Tile k="bills" icon="📋" color="slate" onClick={() => navigate('/bills')} />
                <Tile k="makeDispatch" icon="🚚" color="violet" badge={pendingCount} onClick={() => navigate('/lorries/new')} />
                <Tile k="settleLorry" icon="✅" color="green" badge={lorries.length} onClick={() => navigate('/lorries')} />
                <Tile k="stockIn" icon="🌾" color="amber" onClick={() => navigate('/stock-inward')} />
                <Tile k="expenses" icon="💵" color="rose" onClick={() => navigate('/expenses')} />
            </div>

            {lorries.length > 0 && (
                <Card>
                    <div className="mb-3 text-xl font-extrabold text-slate-800"><T k="onLorry" inline /> ({lorries.length})</div>
                    <div className="space-y-3">
                        {lorries.slice(0, 5).map(n => (
                            <div key={n.LOCAL_ID} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                                <div>
                                    <div className="text-lg font-bold text-slate-900">🚚 {n.LORRY_NO || '-'} · {n.DRIVER_NAME || '-'}</div>
                                    <div className="text-base text-slate-500">{n.DISPATCH_NO} · {n.BILLS_COUNT || (n.INVOICE_NOS_JSON || []).length || 0} bills · {n.TOTAL_BAGS || 0} <T k="bags" inline /></div>
                                </div>
                                <BigButton color="green" onClick={() => navigate(`/lorries/${encodeURIComponent(n.DISPATCH_NO)}/settle`)}>
                                    <T k="settleLorry" inline />
                                </BigButton>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Card>
                <div className="mb-3 flex items-center justify-between">
                    <div className="text-xl font-extrabold text-slate-800"><T k="today" inline /> · {bills.length} <T k="bills" inline /> · {money(todayTotal)}</div>
                    <button type="button" className="text-base font-bold text-blue-700" onClick={() => navigate('/bills')}><T k="all" inline /> →</button>
                </div>
                {bills.length === 0 ? (
                    <div className="py-8 text-center text-lg text-slate-400"><T k="noBills" inline /></div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {bills.slice(0, 8).map(b => {
                            const st = billStatus(b);
                            const bags = bagSummary(b);
                            return (
                                <div key={b.LOCAL_ID} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                    <div>
                                        <div className="text-lg font-bold text-slate-900">{b.CUSTOMER_NAME || 'Walk-in'}</div>
                                        <div className="text-sm text-slate-500 font-mono">{b.INVOICE_NO} · {dayjs(b.CREATED_DATE).format('h:mm A')}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-base text-slate-600">{isBlankBill(b) ? <Chip status="blank" /> : `${bags.total} bags · ${money(billAmount(b))}`}</span>
                                        <Chip status={st} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
