import React, { useState, useEffect } from 'react';
import { DatePicker, Avatar, Tooltip, Empty, Spin, Tag, message } from 'antd';
import { ClockCircleOutlined, UserOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');

export default function TimeTracker() {
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [loading, setLoading] = useState(false);
    const [terminalData, setTerminalData] = useState([]);

    const fetchSessions = async (date) => {
        setLoading(true);
        try {
            const url = API_BASE.endsWith('/') ? `${API_BASE}api/getTerminalSessions` : `${API_BASE}/api/getTerminalSessions`;
            const response = await axios.post(url, { DATE: date.format('YYYY-MM-DD') });
            if (response.data.success) {
                const rawTerminals = response.data.terminals || [];
                const millTerminals = rawTerminals.filter(t => 
                    String(t.storeNo) === '999' || 
                    t.storeName?.toLowerCase().includes('mill') || 
                    t.type?.toLowerCase().includes('mill') ||
                    t.terminalId?.toLowerCase().includes('mill') ||
                    t.terminalId === 'POS'
                );
                setTerminalData(millTerminals);
            } else {
                message.error('Failed to fetch session data');
            }
        } catch (e) {
            console.error('Error fetching terminal sessions:', e);
            message.error('Network error fetching session data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions(selectedDate);
        const interval = setInterval(() => {
            if (selectedDate.isSame(dayjs(), 'day')) fetchSessions(selectedDate);
        }, 30000);
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

    const TerminalTimeline = ({ terminal, dateStr }) => (
        <div className="p-4 md:p-5">
            {/* Time axis */}
            <div className="relative h-6 border-b border-blue-500/20 mb-5 text-xs text-gray-400">
                {[0, 6, 12, 18, 24].map(h => (
                    <div key={h} className="absolute -ml-3" style={{ left: `${(h / 24) * 100}%` }}>
                        <div className="flex flex-col items-center">
                            <span>{h === 24 ? '12 AM' : dayjs().hour(h).minute(0).format('h A')}</span>
                            <div className="h-2 w-px mt-1 bg-blue-500/40" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Timeline track */}
            <div className="relative h-10 rounded-xl w-full mt-3 bg-blue-500/10 border border-blue-500/20 overflow-hidden">
                {terminal.sessions.map((session, idx) => {
                    const style = getTimelineStyle(session.connectedAt, session.disconnectedAt, session.isActive, dateStr);
                    return (
                        <Tooltip
                            key={session.id || idx}
                            color="transparent"
                            overlayInnerStyle={{ padding: 0, boxShadow: 'none' }}
                            title={
                                <div className="p-3 shadow-xl rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-md text-gray-200">
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-2 mb-2">
                                        <Avatar icon={<UserOutlined />} src={`https://api.dicebear.com/7.x/initials/svg?seed=${session.cashier}`} />
                                        <div className="font-bold text-white">{session.cashier}</div>
                                    </div>
                                    <div className="text-xs space-y-1">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-400">Connected:</span>
                                            <span className="font-medium text-white">{dayjs(session.connectedAt + (session.connectedAt.includes('Z') ? '' : 'Z')).format('h:mm:ss A')}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-gray-400">Disconnected:</span>
                                            <span className="font-medium text-white">
                                                {session.isActive ? 'Active Now' : dayjs(session.disconnectedAt + (session.disconnectedAt.includes('Z') ? '' : 'Z')).format('h:mm:ss A')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-4 pt-1 border-t border-white/10 mt-1">
                                            <span className="text-gray-400">Duration:</span>
                                            <span className="font-medium text-blue-400">
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
                                    background: session.isActive ? '#22c55e' : '#3b82f6',
                                    borderColor: session.isActive ? '#16a34a' : '#2563eb',
                                    opacity: 0.9,
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
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-2 text-blue-400/80">
                        Session History ({terminal.sessions.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {[...terminal.sessions].reverse().map((session, idx) => {
                            const s = dayjs(session.connectedAt + (session.connectedAt.includes('Z') ? '' : 'Z'));
                            const e = session.isActive ? dayjs() : (session.disconnectedAt ? dayjs(session.disconnectedAt + (session.disconnectedAt.includes('Z') ? '' : 'Z')) : dayjs());
                            return (
                                <div
                                    key={session.id || idx}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                        session.isActive
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                                            : 'bg-zinc-900/60 border-white/5 text-gray-200'
                                    }`}
                                >
                                    <Avatar
                                        size="default"
                                        className="flex-shrink-0"
                                        style={{ border: `2px solid ${session.isActive ? '#22c55e' : '#3b82f6'}` }}
                                        icon={<UserOutlined />}
                                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${session.cashier}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm text-white truncate flex items-center justify-between">
                                            <span>{session.cashier}</span>
                                            {session.isActive && (
                                                <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">Live</span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                                            <span className="font-mono">{s.format('h:mm A')}</span>
                                            <span>→</span>
                                            <span className={session.isActive ? 'text-emerald-400 font-medium' : 'font-mono'}>
                                                {session.isActive ? 'Now' : e.format('h:mm A')}
                                            </span>
                                            <span className="text-blue-400">({formatDuration(session.connectedAt, session.disconnectedAt, session.isActive)})</span>
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-4 rounded-2xl border border-white/10 bg-gradient-to-r from-blue-900/20 to-zinc-900">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 m-0">
                        <ClockCircleOutlined className="text-blue-400" />
                        Mill Terminal Time Tracker
                    </h2>
                    <p className="text-xs text-gray-400 m-0 mt-1">
                        Real-time desktop app connection history & officer active sessions
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={() => fetchSessions(selectedDate)}
                        className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-all flex items-center gap-1.5 text-xs font-semibold"
                    >
                        <SyncOutlined spin={loading} /> Refresh
                    </button>
                    <DatePicker
                        value={selectedDate}
                        onChange={setSelectedDate}
                        disabledDate={disabledDate}
                        allowClear={false}
                        className="w-full sm:w-auto min-w-[180px]"
                        size="large"
                    />
                </div>
            </div>

            {/* Content */}
            {loading && terminalData.length === 0 ? (
                <div className="flex justify-center items-center py-20">
                    <Spin size="large" tip="Loading terminal session timeline..." />
                </div>
            ) : terminalData.length === 0 ? (
                <Empty
                    description={`No terminal sessions recorded for ${selectedDate.format('MMM DD, YYYY')}`}
                    className="py-12 glass-card rounded-2xl border border-white/5"
                />
            ) : (
                <div className="space-y-5">
                    {terminalData.map((terminal, idx) => (
                        <div
                            key={terminal.terminalId || idx}
                            className="glass-card rounded-2xl overflow-hidden border border-white/10 bg-zinc-900/80"
                        >
                            {/* Terminal header */}
                            <div className="flex items-center justify-between px-5 py-3 bg-blue-950/40 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                                    <span className="font-bold text-base text-white">
                                        {terminal.storeName || `Mill Terminal ${terminal.storeNo}`}
                                    </span>
                                    <Tag color="blue" className="font-mono font-bold text-xs m-0 border-blue-500/40">
                                        {terminal.terminalId}
                                    </Tag>
                                </div>
                                <div className="text-xs text-gray-400 font-medium">
                                    {terminal.sessions.length} session{terminal.sessions.length !== 1 ? 's' : ''}
                                </div>
                            </div>

                            {/* Timeline + session details */}
                            <TerminalTimeline
                                terminal={terminal}
                                dateStr={selectedDate.format('YYYY-MM-DD')}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
