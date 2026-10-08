import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Modal, Tooltip } from 'antd';
import {
    HomeOutlined, FileAddOutlined, FileTextOutlined, CarOutlined, InboxOutlined, DollarOutlined,
    ThunderboltOutlined, CalculatorOutlined, BarcodeOutlined, RollbackOutlined, AppstoreOutlined,
    TeamOutlined, SettingOutlined, LogoutOutlined, SyncOutlined, WifiOutlined, DisconnectOutlined, WarningFilled
} from '@ant-design/icons';
import syncService from '../services/syncService';
import { useAuth } from '../context/AuthContext';
import { T, tx } from './i18n';

const MENU = [
    { group: 'daily', items: [
        { to: '/', k: 'home', icon: <HomeOutlined /> },
        { to: '/new-bill', k: 'newBill', icon: <FileAddOutlined /> },
        { to: '/bills', k: 'bills', icon: <FileTextOutlined /> },
        { to: '/lorries', k: 'lorries', icon: <CarOutlined /> },
        { to: '/stock-inward', k: 'stockIn', icon: <InboxOutlined /> },
        { to: '/expenses', k: 'expenses', icon: <DollarOutlined /> }
    ] },
    { group: 'tools', items: [
        { to: '/quick-pos', k: 'quickPos', icon: <ThunderboltOutlined /> },
        { to: '/price-calculator', k: 'priceCal', icon: <CalculatorOutlined /> },
        { to: '/labels', k: 'labels', icon: <BarcodeOutlined /> }
    ] },
    { group: 'records', items: [
        { to: '/sales-returns', k: 'returns', icon: <RollbackOutlined /> }
    ] },
    { group: 'setup', items: [
        { to: '/items', k: 'items', icon: <AppstoreOutlined /> },
        { to: '/resources', k: 'resources', icon: <TeamOutlined /> },
        { to: '/settings', k: 'settings', icon: <SettingOutlined /> }
    ] }
];

export default function SimpleLayout({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [isOnline, setIsOnline] = useState(syncService.isOnline);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pending, setPending] = useState(0);
    const [errors, setErrors] = useState(0);

    useEffect(() => {
        syncService.updatePendingCount();
        const unsub = syncService.subscribe((event, data) => {
            if (event === 'connectionStatus') setIsOnline(data.online);
            if (event === 'syncStart') setIsSyncing(true);
            if (event === 'syncComplete' || event === 'syncError') {
                setIsSyncing(false);
                syncService.updatePendingCount();
            }
            if (event === 'pendingCountChanged') {
                setPending(typeof data === 'number' ? data : (data?.total || 0));
                setErrors(typeof data === 'number' ? 0 : (data?.errors || 0));
            }
        });
        syncService.initSocket();
        return () => unsub && unsub();
    }, [user]);

    const sync = async () => {
        setIsSyncing(true);
        await syncService.syncAll();
        setIsSyncing(false);
    };

    const askLogout = () => Modal.confirm({
        title: tx('logout'),
        okText: tx('logout'),
        okButtonProps: { danger: true, size: 'large' },
        cancelText: tx('cancel'),
        cancelButtonProps: { size: 'large' },
        onOk: () => logout()
    });

    const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

    return (
        <div className="simple-ui flex min-h-screen bg-slate-100 text-[15px]">
            {/* Left menu */}
            <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
                <div className="flex items-center gap-3 px-5 py-5">
                    <img src="./logo-light.png" alt="" className="h-10 w-10 rounded-xl object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="text-base font-black uppercase leading-tight tracking-wide text-slate-900">Chamika<br />Rice Mill</div>
                </div>
                <nav className="flex-1 space-y-5 px-3 pb-4">
                    {MENU.map(sec => (
                        <div key={sec.group}>
                            <div className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400"><T k={sec.group} inline /></div>
                            {sec.items.map(it => (
                                <Link key={it.to} to={it.to}
                                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-base font-bold no-underline transition-colors ${isActive(it.to) ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-100'}`}>
                                    <span className="text-xl">{it.icon}</span>
                                    <T k={it.k} />
                                </Link>
                            ))}
                        </div>
                    ))}
                </nav>
                <div className="border-t border-slate-200 p-4">
                    <div className="mb-3 text-sm text-slate-500">{user?.NAME || 'Officer'} · {user?.ROLE || ''}</div>
                    <button type="button" onClick={askLogout}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 py-3 text-base font-bold text-slate-700 hover:bg-slate-50">
                        <LogoutOutlined /> <T k="logout" inline />
                    </button>
                </div>
            </aside>

            {/* Main */}
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-40 flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
                    {!isOnline && (
                        <span className="mr-auto flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-2 text-base font-bold text-amber-800">
                            <DisconnectOutlined /> <T k="offlineSafe" inline />
                        </span>
                    )}
                    {isOnline && (
                        <span className="flex items-center gap-2 text-base font-bold text-emerald-700"><WifiOutlined /> <T k="online" inline /></span>
                    )}
                    {errors > 0 && (
                        <Tooltip title={`${errors} ${tx('needsAttention')}`}>
                            <button type="button" onClick={() => navigate('/bills?filter=problem')}
                                className="flex items-center gap-2 rounded-2xl bg-rose-100 px-4 py-2 text-base font-bold text-rose-700">
                                <WarningFilled /> {errors} <T k="needsAttention" inline />
                            </button>
                        </Tooltip>
                    )}
                    <button type="button" onClick={sync} disabled={isSyncing}
                        className="flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-2 text-base font-bold text-white hover:bg-slate-900 disabled:opacity-60">
                        <SyncOutlined spin={isSyncing} /> <T k="sync" inline />
                        {pending > 0 && <span className="rounded-full bg-amber-400 px-2 text-sm font-black text-slate-900">{pending}</span>}
                    </button>
                </header>
                <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
            </div>
        </div>
    );
}
