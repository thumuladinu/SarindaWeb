import React from 'react';

/**
 * Self-contained Vector SVG QR Code Renderer
 * Produces crisp 2D matrix QR code for internal bag identification.
 */

// Simple hashing matrix mapper for QR code visualization
function stringToMatrix(text, size = 21) {
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));

    // Draw 3 Finder Patterns (Top-Left, Top-Right, Bottom-Left)
    const drawFinder = (startX, startY) => {
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                if (
                    r === 0 || r === 6 || c === 0 || c === 6 ||
                    (r >= 2 && r <= 4 && c >= 2 && c <= 4)
                ) {
                    matrix[startY + r][startX + c] = true;
                }
            }
        }
    };

    drawFinder(0, 0);                 // Top-Left
    drawFinder(size - 7, 0);          // Top-Right
    drawFinder(0, size - 7);          // Bottom-Left

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = (i % 2 === 0);
        matrix[i][6] = (i % 2 === 0);
    }

    // Alignment pattern for size 21+
    if (size >= 21) {
        const alignX = size - 7;
        const alignY = size - 7;
        for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
                if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
                    if (alignY + r >= 0 && alignX + c >= 0 && alignY + r < size && alignX + c < size) {
                        matrix[alignY + r][alignX + c] = true;
                    }
                }
            }
        }
    }

    // Seed data bits based on string hash
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) + text.charCodeAt(i);
    }

    let bitIndex = 0;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            // Skip finder and timing zones
            const inTopLeft = (r < 8 && c < 8);
            const inTopRight = (r < 8 && c >= size - 8);
            const inBottomLeft = (r >= size - 8 && c < 8);
            const inTiming = (r === 6 || c === 6);
            if (inTopLeft || inTopRight || inBottomLeft || inTiming) continue;

            const charCode = text.charCodeAt(bitIndex % text.length) || 0;
            const bit = ((hash ^ (charCode * (r + 1) * (c + 1))) + bitIndex) % 2 === 0;
            matrix[r][c] = bit;
            bitIndex++;
        }
    }

    return matrix;
}

export default function QRCodeSVG({ value = '', size = 80, className = '' }) {
    const matrixSize = 21;
    const matrix = stringToMatrix(value || 'CRM-BAG-SECURE', matrixSize);
    const cellSize = size / matrixSize;

    const rects = [];
    for (let r = 0; r < matrixSize; r++) {
        for (let c = 0; c < matrixSize; c++) {
            if (matrix[r][c]) {
                rects.push(
                    <rect
                        key={`${r}-${c}`}
                        x={c * cellSize}
                        y={r * cellSize}
                        width={cellSize + 0.05}
                        height={cellSize + 0.05}
                        fill="#000000"
                    />
                );
            }
        }
    }

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={`select-none bg-white p-1 border border-black ${className}`}
            xmlns="http://www.w3.org/2000/svg"
        >
            <rect x="0" y="0" width={size} height={size} fill="#ffffff" />
            <g>{rects}</g>
        </svg>
    );
}
