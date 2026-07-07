import React, { useState, useEffect } from 'react';
import { DatePicker, Avatar, Tooltip, Empty, Spin, message } from 'antd';
import { ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import { useStores } from '../../contexts/StoresContext';

const WEIGHING_HEX = '#10b981';

const TimeTracker = () => {
    const { stores, getName, getHex } = useStores();
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [loading, setLoading] = useState(false);
    const [terminalData, setTerminalData] = useState([]);

    const fetchSessions = async (date) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/getTerminalSessions', { DATE: date.format('YYYY-MM-DD') });
            if (response.data.success) setTerminalData(response.data.terminals || []);
            else message.error('Failed to fetch session data');
        } catch {
            message.error('Network error fetching session data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions(selectedDate);
        const interval = setInterval(() => {
            if (selectedDate.isSame(dayjs(), 'day')) fetchSessions(selectedDate);
        }, 60000);
        return () => clearInterval(interval);
    }, [selectedDate]);

    const disabledDate = (current) =>
        current && (current > dayjs().endOf('day') || current < dayjs().subtract(60, 'days').startOf('day'));

    const getTimelineStyle = (start, end, isActive, dateStr) => {
        const dayStart = dayjs(dateStr).startOf('day');
        const dayEnd = dayjs(dateStr).endOf('day');
        let sessionStart = dayjs(start + (start.includes('Z') ? '' : 'Z'));
        let sessionEnd = isActive ? dayjs() : (end ? dayjs(end + (end.includes('Z') ? '' : 'Z')) : dayjs());
        if (sessionStart.isBefore(dayStart)) sessionStart = dayStart;
        if (sessionEnd.isAfter(dayEnd)) sessionEnd = dayEnd;
        const totalMinutes = 24 * 60;
        const startMins = sessionStart.diff(dayStart, 'minute');
        const durMins = sessionEnd.diff(sessionStart, 'minute');
        return { left: `${(startMins / totalMinutes) * 100}%`, width: `${Math.max((durMins / totalMinutes) * 100, 0.5)}%` };
    };

    const formatDuration = (start, end, isActive) => {
        const s = dayjs(start + (start.includes('Z') ? '' : 'Z'));
        const e = isActive ? dayjs() : (end ? dayjs(end + (end.includes('Z') ? '' : 'Z')) : dayjs());
        const mins = e.diff(s, 'minute');
        if (mins < 60) return `${mins}m`;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    // Group terminals by store, in stores-context order
    const storeGroups = (() => {
        const map = {};
        terminalData.forEach(t => {
            const key = String(t.storeNo ?? 1);
            if (!map[key]) map[key] = { storeNo: t.storeNo, storeName: t.storeName, terminals: [] };
            map[key].terminals.push(t);
        });
        const ordered = [];
        const seen = new Set();
        stores.forEach(s => {
            const key = String(s.STORE_NO);
            if (map[key]) { ordered.push({ ...map[key], store: s }); seen.add(key); }
        });
        Object.keys(map).forEach(k => { if (!seen.has(k)) ordered.push({ ...map[k], store: null }); });
        return ordered;
    })();

    const getStoreHex = (store, storeNo) =>
        store?.IS_WEIGHING_STATION ? WEIGHING_HEX : getHex(storeNo);

    const typeIcon = (type) => type === 'Weighing' ? '⚖️' : '🏪';
    const typeLabel = (type) => type === 'Weighing' ? 'Weighing Station' : 'POS';

    // Timeline sub-component for a single terminal
    const TerminalTimeline = ({ terminal, hex, dateStr }) => (
        <div className="p-4 md:p-5">
            {/* Time axis */}
            <div className="relative h-6 border-b mb-5 text-xs text-gray-400" style={{ borderColor: hex + '30' }}>
                {[0, 6, 12, 18, 24].map(h => (
                    <div key={h} className="absolute -ml-3" style={{ left: `${(h / 24) * 100}%` }}>
                        <div className="flex flex-col items-center">
                            <span>{h === 24 ? '12 AM' : dayjs().hour(h).minute(0).format('h A')}</span>
                            <div className="h-2 w-px mt-1" style={{ background: hex + '60' }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Timeline track */}
            <div className="relative h-10 rounded-lg w-full mt-3" style={{ background: hex + '15' }}>
                {terminal.sessions.map((session, idx) => {
                    const style = getTimelineStyle(session.connectedAt, session.disconnectedAt, session.isActive, dateStr);
                    return (
                        <Tooltip
                            key={session.id || idx}
                            color="transparent"
                            overlayInnerStyle={{ padding: 0, boxShadow: 'none' }}
                            title={
                                <div className="p-3 shadow-xl rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#18181b]/95 backdrop-blur-md text-gray-800 dark:text-gray-200">
                                    <div className="flex items-center gap-3 border-b border-gray-100 dark:border-white/10 pb-2 mb-2">
                                        <Avatar icon={<UserOutlined />} src={`https://api.dicebear.com/7.x/initials/svg?seed=${session.cashier}`} />
                                        <div className="font-bold">{session.cashier}</div>
                                    </div>
                                    <div className="text-xs space-y-1">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">In:</span>
                                            <span className="font-medium">{dayjs(session.connectedAt + (session.connectedAt.includes('Z') ? '' : 'Z')).format('h:mm:ss A')}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-500">Out:</span>
                                            <span className="font-medium">
                                                {session.isActive ? 'Active Now' : dayjs(session.disconnectedAt + (session.disconnectedAt.includes('Z') ? '' : 'Z')).format('h:mm:ss A')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-4 pt-1 border-t border-gray-100 dark:border-white/10 mt-1">
                                            <span className="text-gray-500">Duration:</span>
                                            <span className="font-medium" style={{ color: hex }}>
                                                {formatDuration(session.connectedAt, session.disconnectedAt, session.isActive)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            }
                        >
                            <div
                                className={`absolute h-full rounded-md cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md border ${session.isActive ? 'animate-pulse' : ''}`}
                                style={{
                                    ...style,
                                    background: session.isActive ? '#22c55e' : hex,
                                    borderColor: session.isActive ? '#16a34a' : hex,
                                    opacity: 0.85,
                                }}
                            >
                                {parseFloat(style.width) > 5 && (
                                    <div className="w-full h-full flex items-center justify-center truncate px-2 text-white text-xs font-semibold">
                                        {session.cashier}
                                    </div>
                                )}
                            </div>
                        </Tooltip>
                    );
                })}
            </div>

            {/* Session detail cards */}
            {terminal.sessions.length > 0 && (
                <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: hex + 'aa' }}>
                        Session Details ({terminal.sessions.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {[...terminal.sessions].reverse().map((session, idx) => {
                            const s = dayjs(session.connectedAt + (session.connectedAt.includes('Z') ? '' : 'Z'));
                            const e = session.isActive ? dayjs() : (session.disconnectedAt ? dayjs(session.disconnectedAt + (session.disconnectedAt.includes('Z') ? '' : 'Z')) : dayjs());
                            return (
                                <div
                                    key={session.id || idx}
                                    className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                                    style={{
                                        borderColor: session.isActive ? '#22c55e50' : hex + '30',
                                        background: session.isActive ? '#22c55e10' : hex + '08',
                                    }}
                                >
                                    <Avatar
                                        size="default"
                                        className="flex-shrink-0"
                                        style={{ border: `2px solid ${session.isActive ? '#22c55e' : hex}` }}
                                        icon={<UserOutlined />}
                                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${session.cashier}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">
                                            {session.cashier}
                                            {session.isActive && (
                                                <span className="ml-2 text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider relative -top-0.5">Live</span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
                                            <span className="font-mono">{s.format('h:mm A')}</span>
                                            <span>→</span>
                                            <span className={session.isActive ? 'text-green-500 font-medium' : 'font-mono'}>
                                                {session.isActive ? 'Now' : e.format('h:mm A')}
                                            </span>
                                            <span className="opacity-60">({formatDuration(session.connectedAt, session.disconnectedAt, session.isActive)})</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-4 rounded-2xl border border-white/5">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2 m-0">
                        <ClockCircleOutlined className="text-blue-500" />
                        Terminal Time Tracker
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 m-0 mt-0.5">
                        Connection history and cashier sessions
                    </p>
                </div>
                <DatePicker
                    value={selectedDate}
                    onChange={setSelectedDate}
                    disabledDate={disabledDate}
                    allowClear={false}
                    className="w-full sm:w-auto min-w-[200px]"
                    size="large"
                />
            </div>

            {/* Content */}
            {loading && terminalData.length === 0 ? (
                <div className="flex justify-center items-center py-20">
                    <Spin size="large" tip="Loading session data..." />
                </div>
            ) : storeGroups.length === 0 ? (
                <Empty
                    description={`No sessions found for ${selectedDate.format('MMM DD, YYYY')}`}
                    className="py-12 glass-card rounded-2xl border border-white/5"
                />
            ) : (
                <div className="space-y-5">
                    {storeGroups.map(({ storeNo, storeName, store, terminals }) => {
                        const hex = getStoreHex(store, storeNo);
                        const isWeighing = store?.IS_WEIGHING_STATION;
                        const displayName = store ? getName(storeNo) : (storeName || `Store ${storeNo}`);
                        const totalSessions = terminals.reduce((a, t) => a + t.sessions.length, 0);

                        return (
                            <div
                                key={storeNo}
                                className="rounded-2xl overflow-hidden border"
                                style={{ borderColor: hex + '40' }}
                            >
                                {/* Store header */}
                                <div
                                    className="flex items-center justify-between px-5 py-3"
                                    style={{ background: hex + '18', borderBottom: `1px solid ${hex}30` }}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: hex }} />
                                        <span className="font-bold text-base text-gray-800 dark:text-white">
                                            {displayName}
                                        </span>
                                        <span
                                            className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                                            style={{ background: hex + '25', color: hex }}
                                        >
                                            {isWeighing ? '⚖️ Weighing Station' : '🏪 POS'}
                                        </span>
                                    </div>
                                    <div className="text-right hidden sm:block">
                                        <div className="text-[10px] uppercase text-gray-400 tracking-wider">Terminals / Sessions</div>
                                        <div className="text-sm font-bold" style={{ color: hex }}>
                                            {terminals.length} / {totalSessions}
                                        </div>
                                    </div>
                                </div>

                                {/* Terminal sub-cards */}
                                <div className="divide-y" style={{ '--tw-divide-opacity': 1 }}>
                                    {terminals.map((terminal, tIdx) => (
                                        <div key={terminal.terminalId || tIdx} className="bg-white/2 dark:bg-black/5">
                                            {/* Terminal header */}
                                            <div
                                                className="flex items-center justify-between px-5 py-2.5"
                                                style={{ borderLeft: `3px solid ${hex}`, background: hex + '08' }}
                                            >
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span
                                                        className="font-mono text-xs px-2 py-0.5 rounded-md font-bold"
                                                        style={{ background: hex + '20', color: hex }}
                                                    >
                                                        {terminal.terminalId}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {typeIcon(terminal.type)} {typeLabel(terminal.type)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-400 sm:hidden">
                                                    {terminal.sessions.length} session{terminal.sessions.length !== 1 ? 's' : ''}
                                                </div>
                                                <div className="text-xs text-gray-400 hidden sm:block">
                                                    {terminal.sessions.length} session{terminal.sessions.length !== 1 ? 's' : ''}
                                                </div>
                                            </div>

                                            {/* Timeline + session details */}
                                            <TerminalTimeline
                                                terminal={terminal}
                                                hex={hex}
                                                dateStr={selectedDate.format('YYYY-MM-DD')}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TimeTracker;
