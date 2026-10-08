// Exact print preview: renders the SAME HTML the printer receives, on a page of the real paper size.
import React, { useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import { PrinterOutlined, ExpandOutlined } from '@ant-design/icons';
import { BigButton } from './ui';
import { T } from './i18n';

// CSS inches at 96 dpi (what Chromium uses for print layout)
const PAPER = {
    bill: { w: 816, h: 1056, label: 'Bill paper 8.5" × 11"' },
    gatepass: { w: 1056, h: 816, label: 'Gate pass 11" × 8.5" (landscape)' }
};

// Screen view of print HTML: apply the print page rules on screen too (white page, no extra margins)
const forScreen = (html) => (html || '').replace('</head>', '<style>html,body{margin:0;background:#fff;}</style></head>');

function Page({ html, paper = 'bill', width }) {
    const p = PAPER[paper];
    const scale = width / p.w;
    return (
        <div style={{ width, height: p.h * scale }} className="relative overflow-hidden rounded-md bg-white shadow-[0_2px_12px_rgba(0,0,0,0.25)] ring-1 ring-slate-300">
            <iframe
                title="print-preview"
                srcDoc={forScreen(html)}
                sandbox="allow-same-origin"
                style={{ width: p.w, height: p.h, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
            />
        </div>
    );
}

// Fits the page into its container; click = full-size view
export default function PrintPreview({ html, paper = 'bill', onPrint, printing, title }) {
    const boxRef = useRef(null);
    const [width, setWidth] = useState(300);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!boxRef.current) return undefined;
        const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
        ro.observe(boxRef.current);
        return () => ro.disconnect();
    }, []);

    return (
        <div className="space-y-2">
            <div ref={boxRef} className="w-full">
                <button type="button" onClick={() => setOpen(true)} className="group relative block w-full text-left" title="Click to see full size">
                    <Page html={html} paper={paper} width={width} />
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1 text-xs font-bold text-white opacity-80 group-hover:opacity-100">
                        <ExpandOutlined /> Full size
                    </span>
                </button>
            </div>
            <div className="text-center text-xs text-slate-400">{PAPER[paper].label}</div>
            <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={Math.min(PAPER[paper].w + 64, window.innerWidth - 40)} centered
                title={title || 'Print preview'}>
                <div className="flex justify-center overflow-auto bg-slate-200 p-4" style={{ maxHeight: '75vh' }}>
                    <Page html={html} paper={paper} width={Math.min(PAPER[paper].w, window.innerWidth - 140)} />
                </div>
                {onPrint && (
                    <div className="mt-4 flex justify-end">
                        <BigButton color="green" icon={<PrinterOutlined />} loading={printing} onClick={() => { onPrint(); setOpen(false); }}><T k="print" inline /></BigButton>
                    </div>
                )}
            </Modal>
        </div>
    );
}

// Stand-alone preview window (e.g. from the Bills list)
export function PreviewModal({ open, onClose, html, paper = 'bill', onPrint, printing, title }) {
    const p = PAPER[paper];
    return (
        <Modal open={open} onCancel={onClose} footer={null} width={Math.min(p.w + 64, window.innerWidth - 40)} centered title={title || 'Print preview'} destroyOnClose>
            <div className="flex justify-center overflow-auto bg-slate-200 p-4" style={{ maxHeight: '75vh' }}>
                <Page html={html} paper={paper} width={Math.min(p.w, window.innerWidth - 140)} />
            </div>
            <div className="mt-2 text-center text-xs text-slate-400">{p.label}</div>
            {onPrint && (
                <div className="mt-4 flex justify-end gap-3">
                    <BigButton color="light" onClick={onClose}><T k="cancel" inline /></BigButton>
                    <BigButton color="green" icon={<PrinterOutlined />} loading={printing} onClick={onPrint}><T k="print" inline /></BigButton>
                </div>
            )}
        </Modal>
    );
}
