import React, { useState, useEffect } from 'react';
import { DatePicker, Button } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

/**
 * Mobile-friendly Date Range Picker
 * - On desktop: Shows standard Ant Design RangePicker
 * - On mobile: Shows simple from/to inputs with quick preset buttons
 */
export default function MobileDateRange({ value, onChange, className = '' }) {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Quick preset handlers
    const setToday = () => {
        const today = dayjs();
        onChange([today, today]);
    };

    const setYesterday = () => {
        const yesterday = dayjs().subtract(1, 'day');
        onChange([yesterday, yesterday]);
    };

    const setLast7Days = () => {
        onChange([dayjs().subtract(6, 'day'), dayjs()]);
    };

    const setThisMonth = () => {
        onChange([dayjs().startOf('month'), dayjs()]);
    };

    const setLastMonth = () => {
        const lastMonth = dayjs().subtract(1, 'month');
        onChange([lastMonth.startOf('month'), lastMonth.endOf('month')]);
    };

    const handleFromChange = (e) => {
        const fromDate = e.target.value ? dayjs(e.target.value) : null;
        const toDate = value?.[1] || null;
        if (fromDate && toDate && fromDate.isAfter(toDate)) {
            onChange([fromDate, fromDate]);
        } else {
            onChange([fromDate, toDate]);
        }
    };

    const handleToChange = (e) => {
        const toDate = e.target.value ? dayjs(e.target.value) : null;
        const fromDate = value?.[0] || null;
        if (fromDate && toDate && toDate.isBefore(fromDate)) {
            onChange([toDate, toDate]);
        } else {
            onChange([fromDate, toDate]);
        }
    };

    // Desktop: Use standard RangePicker
    if (!isMobile) {
        return (
            <RangePicker
                className={`w-full h-10 border-gray-300 dark:border-white/10 bg-transparent rounded-xl ${className}`}
                popupClassName="glass-dropdown"
                value={value}
                onChange={onChange}
            />
        );
    }

    // Mobile: Simple inputs with presets
    return (
        <div className="mobile-date-range">
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1 mb-2">
                <button
                    onClick={setToday}
                    className={`text-xs px-2 h-7 rounded-lg border transition-colors ${value?.[0]?.isSame(dayjs(), 'day') && value?.[1]?.isSame(dayjs(), 'day')
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-white/10 hover:border-emerald-500'
                        }`}
                >
                    Today
                </button>
                <button
                    onClick={setYesterday}
                    className={`text-xs px-2 h-7 rounded-lg border transition-colors ${value?.[0]?.isSame(dayjs().subtract(1, 'day'), 'day') && value?.[1]?.isSame(dayjs().subtract(1, 'day'), 'day')
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-white/10 hover:border-emerald-500'
                        }`}
                >
                    Yesterday
                </button>
                <button
                    onClick={setLast7Days}
                    className={`text-xs px-2 h-7 rounded-lg border transition-colors ${value?.[0]?.isSame(dayjs().subtract(6, 'day'), 'day') && value?.[1]?.isSame(dayjs(), 'day')
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-white/10 hover:border-emerald-500'
                        }`}
                >
                    Last 7 Days
                </button>
                <button
                    onClick={setThisMonth}
                    className={`text-xs px-2 h-7 rounded-lg border transition-colors ${value?.[0]?.isSame(dayjs().startOf('month'), 'day') && value?.[1]?.isSame(dayjs(), 'day')
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-white/10 hover:border-emerald-500'
                        }`}
                >
                    This Month
                </button>
                <button
                    onClick={setLastMonth}
                    className={`text-xs px-2 h-7 rounded-lg border transition-colors ${value?.[0]?.isSame(dayjs().subtract(1, 'month').startOf('month'), 'day') && value?.[1]?.isSame(dayjs().subtract(1, 'month').endOf('month'), 'day')
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-white/10 hover:border-emerald-500'
                        }`}
                >
                    Last Month
                </button>
            </div>

            {/* From/To Date Inputs */}
            <div className="flex gap-1 items-center">
                <div className="flex-1 relative">
                    <input
                        type="date"
                        value={value?.[0]?.format('YYYY-MM-DD') || ''}
                        onChange={handleFromChange}
                        className="w-full h-9 px-2 text-xs border border-gray-300 dark:border-white/10 rounded-lg bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        placeholder="From"
                    />
                </div>
                <span className="text-gray-400 text-xs px-1">→</span>
                <div className="flex-1 relative">
                    <input
                        type="date"
                        value={value?.[1]?.format('YYYY-MM-DD') || ''}
                        onChange={handleToChange}
                        className="w-full h-9 px-2 text-xs border border-gray-300 dark:border-white/10 rounded-lg bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        placeholder="To"
                    />
                </div>
            </div>
        </div>
    );
}
