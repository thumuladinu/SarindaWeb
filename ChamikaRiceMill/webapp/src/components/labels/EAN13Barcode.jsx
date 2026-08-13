import React from 'react';
import { getEAN13Modules } from '../../utils/labelUtils';

/**
 * Pure SVG GS1 Lanka Compliant EAN-13 Barcode Component
 * Optimized for 60×40mm thermal stickers — uniform bar height for clean printing
 */
export default function EAN13Barcode({ code = '4790000000011', width = 200, height = 40, className = '' }) {
    const code13 = String(code || '4790000000011').padStart(13, '0').slice(0, 13);
    const modules = getEAN13Modules(code13);

    if (!modules) {
        return (
            <div className="text-xs text-red-500 font-mono p-1 border border-red-300">
                Invalid EAN-13: {code}
            </div>
        );
    }

    const firstDigit = code13[0];
    const leftGroup = code13.slice(1, 7);
    const rightGroup = code13.slice(7, 13);

    const quietZoneLeft = 8;
    const totalModules = 95;
    const barcodeWidth = width - (quietZoneLeft + 8);
    const moduleWidth = barcodeWidth / totalModules;

    // Uniform bar height for cleaner thermal printing (no taller guards)
    const barHeight = Math.floor(height * 0.62);
    const barY = 1;

    const rects = [];
    for (let i = 0; i < totalModules; i++) {
        if (modules[i] === '1') {
            const x = quietZoneLeft + (i * moduleWidth);
            rects.push(
                <rect
                    key={i}
                    x={x}
                    y={barY}
                    width={moduleWidth + 0.2}
                    height={barHeight}
                    fill="#000000"
                />
            );
        }
    }

    const textY = height - 1.5;
    const leftTextX = quietZoneLeft + (24 * moduleWidth);
    const rightTextX = quietZoneLeft + (70 * moduleWidth);
    const textSize = Math.max(7, Math.floor(height * 0.22));

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'block' }}
        >
            <rect width={width} height={height} fill="#ffffff" />
            {rects}
            <g fontFamily="monospace, 'Courier New', Courier" fontSize={textSize} fontWeight="bold" fill="#000000" textAnchor="middle">
                <text x={quietZoneLeft - 3} y={textY} textAnchor="end">{firstDigit}</text>
                <text x={leftTextX} y={textY} letterSpacing="0.8">{leftGroup}</text>
                <text x={rightTextX} y={textY} letterSpacing="0.8">{rightGroup}</text>
            </g>
        </svg>
    );
}
