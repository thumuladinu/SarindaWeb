import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Avatar, Tooltip, Empty, Spin, message, Typography } from 'antd';
import { ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const { Title, Text } = Typography;

const TimeTracker = () => {
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [loading, setLoading] = useState(false);
    const [terminalData, setTerminalData] = useState([]);

    const fetchSessions = async (date) => {
        setLoading(true);
        try {
            const formattedDate = date.format('YYYY-MM-DD');

            const response = await axios.post('/api/getTerminalSessions', { DATE: formattedDate });

            if (response.data.success) {
                setTerminalData(response.data.terminals || []);
            } else {
                message.error('Failed to fetch session data');
            }
        } catch (error) {
            console.error('Error fetching sessions:', error);
            message.error('Network error fetching session data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions(selectedDate);
        // Refresh every minute to show up-to-date Active status for today
        const interval = setInterval(() => {
            if (selectedDate.isSame(dayjs(), 'day')) {
                fetchSessions(selectedDate);
            }
        }, 60000);
        return () => clearInterval(interval);
    }, [selectedDate]);

    // Handle date selection with 60 days past constraint
    const disabledDate = (current) => {
        return current && (current > dayjs().endOf('day') || current < dayjs().subtract(60, 'days').startOf('day'));
    };

    // Calculate position and width for timeline blocks
    const getTimelineStyle = (start, end, isActive, dateStr) => {
        const dayStart = dayjs(dateStr).startOf('day');
        const dayEnd = dayjs(dateStr).endOf('day');

        let sessionStart = dayjs(start + (start.includes('Z') ? '' : 'Z'));
        let sessionEnd = isActive ? dayjs() : (end ? dayjs(end + (end.includes('Z') ? '' : 'Z')) : dayjs());

        // Clamp to selected day
        if (sessionStart.isBefore(dayStart)) sessionStart = dayStart;
        if (sessionEnd.isAfter(dayEnd)) sessionEnd = dayEnd;

        const totalMinutesInDay = 24 * 60;
        const startMinutes = sessionStart.diff(dayStart, 'minute');
        const durationMinutes = sessionEnd.diff(sessionStart, 'minute');

        const leftPercent = (startMinutes / totalMinutesInDay) * 100;
        const widthPercent = (durationMinutes / totalMinutesInDay) * 100;

        // Ensure minimum visibility for very short sessions (e.g. 1% width)
        return {
            left: `${leftPercent}%`,
            width: `${Math.max(widthPercent, 0.5)}%`,
        };
    };

    // Format duration nicely
    const formatDuration = (start, end, isActive) => {
        const startTime = dayjs(start + (start.includes('Z') ? '' : 'Z'));
        const endTime = isActive ? dayjs() : (end ? dayjs(end + (end.includes('Z') ? '' : 'Z')) : dayjs());
        const diffMins = endTime.diff(startTime, 'minute');

        if (diffMins < 60) return `${diffMins}m`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
    };

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#1f1f1f] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
                <div>
                    <Title level={4} className="!m-0 flex items-center gap-2">
                        <ClockCircleOutlined className="text-blue-500" />
                        Terminal Time Tracker
                    </Title>
                    <Text type="secondary" className="text-sm">
                        View connection history and cashier sessions
                    </Text>
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

            {/* Timeline Area */}
            <div className="space-y-4">
                {loading && terminalData.length === 0 ? (
                    <div className="flex justify-center items-center py-20">
                        <Spin size="large" tip="Loading session data..." />
                    </div>
                ) : terminalData.length === 0 ? (
                    <Empty
                        description={`No terminal sessions found for ${selectedDate.format('MMM DD, YYYY')}`}
                        className="py-12 bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-gray-800"
                    />
                ) : (
                    terminalData.map(terminal => (
                        <Card
                            key={terminal.terminalId}
                            className="w-full shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                            bodyStyle={{ padding: '0px' }}
                        >
                            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#262626]/50 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-lg text-gray-800 dark:text-gray-200">
                                        {terminal.storeName || `Store ${terminal.storeNo}`}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">
                                            {terminal.terminalId}
                                        </span>
                                        <span className="uppercase tracking-wider">{terminal.type}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-gray-500">Total Sessions</div>
                                    <div className="font-bold text-lg">{terminal.sessions.length}</div>
                                </div>
                            </div>

                            <div className="p-4 md:p-6">
                                {/* Time Axis Header */}
                                <div className="relative h-6 border-b border-gray-200 dark:border-gray-700 mb-6 text-xs text-gray-400">
                                    {[0, 6, 12, 18, 24].map(hour => (
                                        <div
                                            key={hour}
                                            className="absolute -ml-3"
                                            style={{ left: `${(hour / 24) * 100}%` }}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span>{hour === 24 ? '12 AM' : dayjs().hour(hour).minute(0).format('h A')}</span>
                                                <div className="h-2 w-px bg-gray-300 dark:bg-gray-600 mt-1"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Timeline Track */}
                                <div className="relative h-12 bg-gray-100 dark:bg-gray-800 rounded-lg w-full mt-4">
                                    {terminal.sessions.map((session, idx) => {
                                        const style = getTimelineStyle(session.connectedAt, session.disconnectedAt, session.isActive, selectedDate.format('YYYY-MM-DD'));

                                        return (
                                            <Tooltip
                                                key={session.id || idx}
                                                color="transparent"
                                                overlayInnerStyle={{ padding: 0, boxShadow: 'none' }}
                                                title={
                                                    <div className="p-3 shadow-xl rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#18181b]/95 backdrop-blur-md text-gray-800 dark:text-gray-200">
                                                        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-white/10 pb-2 mb-2">
                                                            <Avatar
                                                                icon={<UserOutlined />}
                                                                src={session.cashierPhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${session.cashier}`}
                                                            />
                                                            <div>
                                                                <div className="font-bold text-gray-800 dark:text-white">{session.cashier}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs space-y-1">
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-gray-500 dark:text-gray-400">In:</span>
                                                                <span className="font-medium text-gray-800 dark:text-gray-200">{dayjs(session.connectedAt + (session.connectedAt.includes('Z') ? '' : 'Z')).format('h:mm:ss A')}</span>
                                                            </div>
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-gray-500 dark:text-gray-400">Out:</span>
                                                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                                                    {session.isActive ? 'Active Now' : dayjs(session.disconnectedAt + (session.disconnectedAt.includes('Z') ? '' : 'Z')).format('h:mm:ss A')}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between gap-4 pt-1 mt-1 border-t border-gray-100 dark:border-white/10">
                                                                <span className="text-gray-500 dark:text-gray-400">Duration:</span>
                                                                <span className="font-medium text-blue-600 dark:text-blue-400">
                                                                    {formatDuration(session.connectedAt, session.disconnectedAt, session.isActive)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                }
                                            >
                                                <div
                                                    className={`absolute h-full rounded-md cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md border-2 
                                                        ${session.isActive
                                                            ? 'bg-green-500/80 border-green-600 animate-pulse'
                                                            : 'bg-blue-500/80 border-blue-600'
                                                        }`}
                                                    style={style}
                                                >
                                                    {parseFloat(style.width) > 5 && (
                                                        <div className="w-full h-full flex items-center justify-center truncate px-2 text-white text-xs font-semibold shadow-sm">
                                                            {session.cashier}
                                                        </div>
                                                    )}
                                                </div>
                                            </Tooltip>
                                        );
                                    })}
                                </div>

                                {/* Detailed Session Cards */}
                                {terminal.sessions.length > 0 && (
                                    <div className="mt-8 space-y-3">
                                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Session Details</div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {/* Render sessions in reverse chronological order (newest first) */}
                                            {[...terminal.sessions].reverse().map((session, idx) => {
                                                const startTime = dayjs(session.connectedAt + (session.connectedAt.includes('Z') ? '' : 'Z'));
                                                const endTime = session.isActive ? dayjs() : (session.disconnectedAt ? dayjs(session.disconnectedAt + (session.disconnectedAt.includes('Z') ? '' : 'Z')) : dayjs());
                                                const duration = formatDuration(session.connectedAt, session.disconnectedAt, session.isActive);

                                                return (
                                                    <div
                                                        key={session.id || `card-${idx}`}
                                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:bg-white/50 dark:hover:bg-white/5
                                                            ${session.isActive
                                                                ? 'border-green-200 dark:border-green-500/30 bg-green-50/50 dark:bg-green-500/10'
                                                                : 'border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-[#1f1f1f]'
                                                            }`}
                                                    >
                                                        <Avatar
                                                            size="large"
                                                            className={`flex-shrink-0 border-2 ${session.isActive ? 'border-green-500' : 'border-transparent'}`}
                                                            icon={<UserOutlined />}
                                                            src={session.cashierPhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${session.cashier}`}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-gray-800 dark:text-gray-200 truncate pr-2">
                                                                {session.cashier}
                                                                {session.isActive && <span className="ml-2 text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider relative -top-0.5">Active</span>}
                                                            </div>
                                                            <div className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate flex items-center gap-1">
                                                                <span className="font-mono">{startTime.format('h:mm:ss A')}</span>
                                                                <span>-</span>
                                                                <span className={session.isActive ? 'text-green-600 dark:text-green-400 font-medium whitespace-nowrap' : 'font-mono whitespace-nowrap'}>
                                                                    {session.isActive ? 'Now' : endTime.format('h:mm:ss A')}
                                                                </span>
                                                                <span className="opacity-60 ml-1">({duration})</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

export default TimeTracker;
