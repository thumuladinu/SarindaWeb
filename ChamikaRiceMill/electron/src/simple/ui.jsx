// Big, calm building blocks for the Simple screens (large touch targets, high contrast).
import React, { useEffect, useRef } from 'react';
import { Modal } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, LockFilled } from '@ant-design/icons';
import { T, tx } from './i18n';

const COLORS = {
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    green: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    amber: 'bg-amber-500 hover:bg-amber-600 text-white',
    red: 'bg-rose-600 hover:bg-rose-700 text-white',
    slate: 'bg-slate-700 hover:bg-slate-800 text-white',
    light: 'bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-300'
};

export function BigButton({ color = 'blue', icon, children, onClick, disabled, loading, className = '', hint, type = 'button' }) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-bold shadow-sm transition-colors min-h-[60px] disabled:opacity-50 disabled:cursor-not-allowed ${COLORS[color]} ${className}`}
        >
            {loading ? <LoadingOutlined /> : icon}
            <span className="text-left">{children}</span>
            {hint && <kbd className="ml-1 rounded-md bg-black/20 px-2 py-0.5 text-xs font-mono">{hint}</kbd>}
        </button>
    );
}

const TILE_COLORS = {
    blue: 'from-blue-600 to-blue-500',
    green: 'from-emerald-600 to-emerald-500',
    amber: 'from-amber-500 to-amber-400',
    violet: 'from-violet-600 to-violet-500',
    rose: 'from-rose-600 to-rose-500',
    slate: 'from-slate-700 to-slate-600',
    teal: 'from-teal-600 to-teal-500'
};

export function Tile({ icon, k, sub, color = 'blue', onClick, badge }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative flex flex-col items-start justify-between rounded-3xl bg-gradient-to-br ${TILE_COLORS[color]} p-5 text-left text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] min-h-[140px]`}
        >
            <span className="text-4xl">{icon}</span>
            <span className="text-xl font-extrabold"><T k={k} /></span>
            {sub && <span className="text-sm opacity-90">{sub}</span>}
            {badge > 0 && (
                <span className="absolute right-4 top-4 rounded-full bg-white px-3 py-1 text-base font-black text-slate-800">{badge}</span>
            )}
        </button>
    );
}

// −  [ number ]  +   (big; typing works too; clicking the box selects the number)
export function Stepper({ value, onChange, min = 0, step = 1, disabled, inputRef, onEnter }) {
    const v = Number(value) || 0;
    const set = (n) => onChange(Math.max(min, Math.round(n * 100) / 100));
    return (
        <div className="inline-flex items-center gap-1.5">
            <button type="button" disabled={disabled || v <= min} onClick={() => set(v - step)}
                className="h-12 w-12 shrink-0 rounded-xl bg-slate-200 text-2xl font-black text-slate-700 hover:bg-slate-300 disabled:opacity-40">−</button>
            <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                min={min}
                value={v === 0 ? '' : v}
                placeholder="0"
                disabled={disabled}
                onFocus={(e) => e.target.select()}
                onChange={(e) => set(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
                className="h-12 w-[72px] min-w-0 rounded-xl border-2 border-slate-300 text-center text-2xl font-black text-slate-900 focus:border-blue-500 focus:outline-none"
            />
            <button type="button" disabled={disabled} onClick={() => set(v + step)}
                className="h-12 w-12 shrink-0 rounded-xl bg-blue-600 text-2xl font-black text-white hover:bg-blue-700 disabled:opacity-40">+</button>
        </div>
    );
}

const STATUS_STYLE = {
    pending: 'bg-amber-100 text-amber-800 border-amber-300',
    onLorry: 'bg-blue-100 text-blue-800 border-blue-300',
    settled: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    blank: 'bg-slate-100 text-slate-700 border-slate-300',
    notSynced: 'bg-orange-100 text-orange-800 border-orange-300',
    syncProblem: 'bg-rose-100 text-rose-800 border-rose-300'
};

export function Chip({ status, children }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold ${STATUS_STYLE[status] || STATUS_STYLE.blank}`}>
            {status === 'settled' && <LockFilled />}
            {children || <T k={status} inline />}
        </span>
    );
}

// Result that stays on screen until the next action (replaces short pop-up messages)
export function ResultPanel({ state = 'success', title, lines = [], actions }) {
    const style = state === 'error' ? 'border-rose-300 bg-rose-50' : state === 'busy' ? 'border-blue-300 bg-blue-50' : 'border-emerald-300 bg-emerald-50';
    const icon = state === 'error' ? <CloseCircleFilled className="text-rose-600" /> : state === 'busy' ? <LoadingOutlined className="text-blue-600" /> : <CheckCircleFilled className="text-emerald-600" />;
    return (
        <div className={`rounded-3xl border-2 p-6 ${style}`}>
            <div className="flex items-start gap-4">
                <span className="text-4xl leading-none">{icon}</span>
                <div className="flex-1 space-y-1">
                    <div className="text-2xl font-extrabold text-slate-900">{title}</div>
                    {lines.filter(Boolean).map((l, i) => <div key={i} className="text-lg text-slate-700">{l}</div>)}
                </div>
            </div>
            {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
        </div>
    );
}

export function PageHeader({ k, icon, right, sub }) {
    return (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
                {icon && <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-3xl text-white shadow">{icon}</span>}
                <div>
                    <h1 className="m-0 text-3xl font-extrabold text-slate-900"><T k={k} inline /></h1>
                    {sub && <div className="text-base text-slate-500">{sub}</div>}
                </div>
            </div>
            {right}
        </div>
    );
}

export function Card({ children, className = '' }) {
    return <div className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

// Choice buttons (instead of dropdowns) for short lists
export function ChoiceRow({ options, value, onChange, size = 'lg' }) {
    return (
        <div className="flex flex-wrap gap-3">
            {options.map(o => {
                const active = o.value === value;
                return (
                    <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
                        className={`rounded-2xl border-2 px-5 ${size === 'lg' ? 'py-4 text-lg' : 'py-2 text-base'} font-bold transition-colors ${active ? 'border-blue-600 bg-blue-600 text-white shadow' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400'}`}>
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

// Keyboard shortcuts, e.g. useHotkeys({ F9: save, Escape: close })
export function useHotkeys(map, deps = []) {
    const ref = useRef(map);
    ref.current = map;
    useEffect(() => {
        const h = (e) => {
            const fn = ref.current[e.key];
            if (fn) { e.preventDefault(); fn(e); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, deps);
}

// Ask before throwing away typed work
export function confirmDiscard(onDiscard) {
    Modal.confirm({
        title: tx('discardQ'),
        okText: tx('discard'),
        okButtonProps: { danger: true, size: 'large' },
        cancelText: tx('keepEditing'),
        cancelButtonProps: { size: 'large' },
        onOk: onDiscard
    });
}
