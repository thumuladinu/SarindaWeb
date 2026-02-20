/* =====================================================
   STOCK OPERATIONS PAGE - SARINDA WEB
   Refactored UI:
   - "Add Operation" Modal
   - Advanced History View (Replica of Inventory Page)
   ===================================================== */

import React, { useState, useEffect, useMemo } from 'react';
import { message, notification, Modal, Button, Input, Select, DatePicker, Radio, Tag, Spin, InputNumber, Popconfirm, Table, Descriptions, Checkbox } from 'antd';
import {
    DeleteOutlined,
    StockOutlined,
    HistoryOutlined,
    ShopOutlined,
    CheckOutlined,
    CloseOutlined,
    SwapOutlined,
    SearchOutlined,
    PlusOutlined,
    RiseOutlined,
    FallOutlined,
    EyeOutlined,
    UserOutlined,
    UndoOutlined,
    FilterOutlined,
    ClearOutlined
} from '@ant-design/icons';
import Cookies from 'js-cookie';
import axios from 'axios';
import dayjs from 'dayjs';
import './StockOperations.css';
import InventoryHistoryFilters from './inventory/InventoryHistoryFilters';

// Operation type definitions
const OPERATION_TYPES = [
    { id: 1, name: 'Full Stock Clearance', shortName: 'Full Clear', icon: '🗑️', color: '#dc3545' },
    { id: 2, name: 'Partial Stock Clearance', shortName: 'Half Clear', icon: '📤', color: '#fd7e14' },
    { id: 3, name: 'Full Clear + Sales Bill', shortName: 'Full + Bill', icon: '🧾', color: '#28a745' },
    { id: 4, name: 'Partial Clear + Sales Bill', shortName: 'Half + Bill', icon: '📝', color: '#17a2b8' },
    { id: 9, name: 'Item Conversion', shortName: 'Convert', icon: '🔄', color: '#007bff' },
    { id: 11, name: 'Stock Return', shortName: 'Return', icon: '↩️', color: '#20c997' },
    { id: 12, name: 'Stock Transfer (Store 1 -> Store 2)', shortName: 'S1 -> S2', icon: '📥', color: '#6f42c1' }
];

export default function StockOperations() {
    // Auth & Context
    const userStr = Cookies.get('rememberedUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const currentUser = user; // For permission checks matching Inventory page logic

    // View State
    const [step, setStep] = useState(1); // 1 = Op Type, 2 = Store, 3 = Form
    const [selectedStore, setSelectedStore] = useState(1); // 1 = Store 1, 2 = Store 2
    const [showOpModal, setShowOpModal] = useState(false); // Controls the main operation entry modal

    // Data State
    const [products, setProducts] = useState([]);
    const [history, setHistory] = useState([]);
    const [customers, setCustomers] = useState([]); // New Customer State
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);

    // History Filters State
    const [historyFilters, setHistoryFilters] = useState({
        search: '',
        store: 'all',
        type: 'all', // 'AdjIn', 'AdjOut', 'StockClear', 'Opening' - mapped from Op Types
        item: 'all',
        dateRange: null
    });
    const [filtersCollapsed, setFiltersCollapsed] = useState(true);

    // Detail View Modal State
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewRecord, setViewRecord] = useState(null);

    // Delete State
    const [deletingId, setDeletingId] = useState(null);

    // Operation State
    const [selectedOpType, setSelectedOpType] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Input States
    const [mainQuantity, setMainQuantity] = useState('');
    const [sellQuantity, setSellQuantity] = useState('');
    const [sellPrice, setSellPrice] = useState(null);
    const [comments, setComments] = useState('');

    // Conversion State
    const [conversionEnabled, setConversionEnabled] = useState(false);
    const [conversions, setConversions] = useState([]); // Array of { destId, destCode, destName, qty }


    // Transfer State
    const [transferTargetStore, setTransferTargetStore] = useState(2); // If source is 1, target is 2
    const [transferType, setTransferType] = useState('FULL'); // FULL or PARTIAL
    const [conversionType, setConversionType] = useState('FULL'); // FULL or PARTIAL (For Op 9)

    // Return State
    const [returnQty, setReturnQty] = useState('');
    const [returnSearchTerm, setReturnSearchTerm] = useState('');
    const [returnableOps, setReturnableOps] = useState([]);
    const [selectedReturnOp, setSelectedReturnOp] = useState(null);
    const [returnLoading, setReturnLoading] = useState(false);
    const [returnExpenseAmount, setReturnExpenseAmount] = useState(''); // New for Returns

    // Lorry & Customer

    const [customerDetails, setCustomerDetails] = useState({ id: null, name: '', contact: '' }); // Updated for Select
    const [lorryDetails, setLorryDetails] = useState({ name: '', driver: '', destination: '' });

    // UI State
    const [saving, setSaving] = useState(false);

    // Real-Time Preview State
    const [previewStock, setPreviewStock] = useState({ current: 0, projected: 0, diff: 0, wastage: null });
    const [previewConvStock, setPreviewConvStock] = useState([]); // Array of { id, name, current, projected }

    // POS-Like Toggles
    // POS-Like Toggles
    const [generateTripIdEnabled, setGenerateTripIdEnabled] = useState(false);
    // Print ticket removed as per request
    const [printSalesBill, setPrintSalesBill] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);

    // Initial Load
    useEffect(() => {
        fetchProducts();
        fetchHistory();
        fetchCustomers(); // Fetch customers
    }, []); // Only fetch once on mount, filtering handles the rest or manual refresh

    // Update Preview when inputs change
    useEffect(() => {
        updateStockPreview();
    }, [selectedItem, selectedOpType, mainQuantity, sellQuantity, conversions, selectedStore, transferType, returnQty, conversionType]);

    // Auto-set Transfer Target
    useEffect(() => {
        setTransferTargetStore(selectedStore === 1 ? 2 : 1);
        // Clear return selection if store changes to avoid cross-store return confusion
        setSelectedReturnOp(null);
        setReturnableOps([]);
    }, [selectedStore]);

    const handleOpTypeChange = (type) => {
        setSelectedOpType(type);
        setSelectedItem(null);
        setSelectedReturnOp(null);
        setMainQuantity('');
        setSellQuantity('');
        setSellPrice(null);
        setReturnQty('');
        setConversions([]);
        setConversionEnabled(false);
        setComments('');
        setReturnExpenseAmount('');
        if (type === 11) {
            fetchReturnableOps('');
        }
    };

    const fetchProducts = async () => {
        try {
            const response = await axios.post('/api/getAllItemStocksRealTime', {});
            if (response.data.success) {
                setProducts(response.data.result);
            }
        } catch (error) {
            console.error('Failed to fetch products', error);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            // Using getInventoryHistory to match Inventory page logic
            // Allow fetching a wider range to show history properly
            const response = await axios.post('/api/getInventoryHistory', {
                startDate: historyFilters.dateRange ? historyFilters.dateRange[0].format('YYYY-MM-DD') : dayjs().subtract(14, 'day').format('YYYY-MM-DD'),
                endDate: historyFilters.dateRange ? historyFilters.dateRange[1].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
            });
            if (response.data.success) {
                // Filter to show ONLY Stock Operations
                const filtered = response.data.result.filter(h => h.SOURCE_TYPE === 'stock_operation');
                setHistory(filtered);
            }
        } catch (error) {
            console.error('Failed to fetch history', error);
            message.error('Failed to load history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchCustomers = async () => {
        try {
            const response = await axios.get('/api/customers');
            if (response.data.success) {
                setCustomers(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch customers', error);
        }
    };

    const fetchReturnableOps = async (search = '') => {
        setReturnLoading(true);
        try {
            const response = await axios.post('/api/stock-ops/get-returnable', {
                search: search,
                limit: 50
            });
            if (response.data.success) {
                setReturnableOps(response.data.operations);
            }
        } catch (error) {
            console.error('Failed to fetch returnable ops', error);
            message.error('Failed to load returnable operations');
        } finally {
            setReturnLoading(false);
        }
    };

    const handleSelectReturnOp = (op) => {
        if (op.OP_ID === 'DIRECT') {
            setSelectedReturnOp(op);
            setSelectedItem(null); // Force manual selection
            setReturnQty('');
            setComments('Direct Stock Return (No Reference)');
            setPreviewStock({ current: 0, projected: 0, diff: 0, wastage: null });
            return;
        }

        // Find latest stock from product list
        const latestProd = products.find(p => p.ITEM_ID === op.ITEM_ID);

        setSelectedReturnOp(op);
        setSelectedItem({
            ITEM_ID: op.ITEM_ID,
            CODE: op.ITEM_CODE,
            NAME: op.ITEM_NAME,
            STOCK_S1: latestProd?.STOCK_S1 || 0,
            STOCK_S2: latestProd?.STOCK_S2 || 0
        });

        // Auto-apply SOLD quantity if it's a sale op, otherwise use CLEARED quantity
        const autoQty = (parseFloat(op.SOLD_QUANTITY) > 0) ? op.SOLD_QUANTITY : op.CLEARED_QUANTITY;
        setReturnQty(autoQty || '');

        setComments(`Return for ${op.OP_CODE}`);

        const currentStock = selectedStore === 1 ? (latestProd?.STOCK_S1 || 0) : (latestProd?.STOCK_S2 || 0);
        setPreviewStock({
            current: currentStock,
            projected: currentStock + (parseFloat(autoQty) || 0),
            diff: parseFloat(autoQty) || 0,
            wastage: null
        });
    };

    // Filter History Data locally based on UI filters
    const filteredHistory = useMemo(() => {
        return history.filter(item => {
            const matchSearch = historyFilters.search === '' ||
                (item.CODE && item.CODE.toLowerCase().includes(historyFilters.search.toLowerCase())) ||
                (item.ITEM_NAME && item.ITEM_NAME.toLowerCase().includes(historyFilters.search.toLowerCase()));

            const matchStore = historyFilters.store === 'all' || String(item.STORE_NO) === String(historyFilters.store);

            const matchType = historyFilters.type === 'all' || item.DISPLAY_TYPE === historyFilters.type;

            const matchItem = historyFilters.item === 'all' || String(item.ITEM_ID) === String(historyFilters.item);

            return matchSearch && matchStore && matchType && matchItem;
        });
    }, [history, historyFilters]);

    const updateStockPreview = async () => {
        const currentStock = selectedStore === 1
            ? (parseFloat(selectedItem?.STOCK_S1) || 0)
            : (parseFloat(selectedItem?.STOCK_S2) || 0);

        if (!selectedItem || !selectedItem.ITEM_ID || selectedItem === null) {
            setPreviewStock({ current: 0, projected: 0, diff: 0, wastage: null });
            setPreviewConvStock([]);
            return;
        }

        const qty = parseFloat(mainQuantity) || 0;
        const sQty = parseFloat(sellQuantity) || 0;
        const cQty = parseFloat(mainQuantity) || 0; // For Op 9 Partial, we use main qty as amount to convert

        // Calculate total converted quantity from list
        let convTotal = 0;
        if ((conversionEnabled || selectedOpType === 9) && conversions.length > 0) {
            convTotal = conversions.reduce((acc, curr) => acc + (parseFloat(curr.val) || 0), 0);
        }

        // Calculate Deduction based on Op Type
        let deduction = 0;
        switch (selectedOpType) {
            case 1: // Full Clear
                deduction = currentStock; // Clears everything
                break;
            case 2: // Partial Clear
                deduction = qty + convTotal; // Main Qty + Converted Qty
                break;
            case 3: // Full Clear + Bill
                deduction = currentStock;
                break;
            case 4: // Partial Clear + Bill
                deduction = sQty + convTotal; // Sell Qty + Converted Qty
                break;
            case 9: // Convert
                if (conversionType === 'FULL') deduction = currentStock;
                else deduction = convTotal; // Partial: Deduct only what is being converted
                break;
            case 12: // Transfer
                if (transferType === 'FULL') deduction = currentStock;
                else if (conversionEnabled) deduction = convTotal; // If conversion enabled, deduct converted total (Main Qty header hidden)
                else deduction = qty; // Direct partial transfer
                break;
            case 11: // Return
                // If conversion is enabled, change to main item is ONLY what's in selfAddition.
                // If disabled, it's the full returnQty.
                deduction = conversionEnabled ? 0 : -(parseFloat(returnQty) || 0);
                break;
            default:
                deduction = 0;
        }

        // Preview New Stock
        // For Full ops, it becomes 0. For partial, Current - Deduction.
        // Exception: If we add stock (self-conversion into same item)
        const selfAddition = (conversionEnabled || selectedOpType === 9) ? conversions.reduce((acc, curr) =>
            curr.destId === selectedItem?.ITEM_ID ? acc + (parseFloat(curr.val) || 0) : acc, 0
        ) : 0;

        const isFullOp = [1, 3, 6, 8].includes(selectedOpType) || (selectedOpType === 12 && transferType === 'FULL') || (selectedOpType === 9 && conversionType === 'FULL');

        // For Transfers (Op 12), if selectedStore is S1 (the source), we do NOT add selfAddition to THIS store's projection.
        // selfAddition in a transfer strictly belongs to Store 2.
        const effectiveSelfAddition = (selectedOpType === 12 && selectedStore === 1) ? 0 : selfAddition;

        let newStock = isFullOp ? effectiveSelfAddition : (currentStock - deduction + effectiveSelfAddition);
        // if (newStock < 0) newStock = 0; // Removed clamp to allow negative stock for partial ops as requested

        // Wastage / Surplus Calculation for Full Operations
        // ALWAYS calculate for Full Ops to ensure card visibility
        let wastage = null;

        // Logic Alignment with Backend/History:
        // Op 1 (Full Clear): Wastage = ActualFound (Input) - CurrentStock
        // Op 3 (Full Sales): Wastage = SoldQty - CurrentStock
        // Op 9 (Full Conv):  Wastage = TotalConverted - CurrentStock
        // Op 12 (Full Trans): Wastage = ActualTransfer (Input) - CurrentStock

        if ([1, 3].includes(selectedOpType) || (selectedOpType === 12 && transferType === 'FULL') || (selectedOpType === 9 && conversionType === 'FULL')) {

            let primaryOutput = 0;
            if (selectedOpType === 1) primaryOutput = qty; // Input is "Actual Quantity Found"
            else if (selectedOpType === 3) primaryOutput = sQty; // Input is Sold Qty
            else if (selectedOpType === 12) primaryOutput = qty; // Input is Transfer Qty

            // Total Output includes Primary Input + All Conversions
            // For Op 9, primaryOutput is 0, so actualQty = convTotal
            let actualQty = primaryOutput + convTotal;

            // Wastage = Actual (Total Output) - System (Previous Stock)
            // Example: System=100, Found=90. Wastage = 90 - 100 = -10 (Loss)
            // Example: System=100, Found=110. Wastage = 110 - 100 = +10 (Surplus)
            wastage = actualQty - currentStock;
        }

        // Transfer specialized preview (Op 12)
        let transferPreview = null;
        if (selectedOpType === 12) {
            const s1Current = parseFloat(selectedItem?.STOCK_S1) || 0;
            const s2Current = parseFloat(selectedItem?.STOCK_S2) || 0;

            // S1 is always the source for Op 12 (Transfer)
            const s1Deduction = deduction; // calculated above as currentStock if FULL, else convTotal or qty
            const s1Projected = transferType === 'FULL' ? 0 : (s1Current - s1Deduction); // S1 never gets selfAddition from transfer list

            // S2 Addition: The amount of main item moving to S2
            // If conversion enabled, addition to main item at S2 is only what's in selfAddition
            // If conversion disabled, addition is full 'qty'
            const s2Addition = conversionEnabled ? selfAddition : qty;
            const s2Projected = s2Current + s2Addition;

            transferPreview = {
                s1: { current: s1Current, projected: s1Projected, diff: s1Projected - s1Current },
                s2: { current: s2Current, projected: s2Projected, diff: s2Projected - s2Current }
            };

            // Specialized Wastage for Transfer
            // Wastage = (Arrived at S2) - (Left S1)
            // Left S1 = s1Deduction (what left the system at Store 1)
            // Arrived at S2 = convTotal (if conversions) OR qty (if direct)
            if (transferType === 'FULL') {
                const totalOutput = conversionEnabled ? convTotal : qty;
                wastage = totalOutput - s1Current;
            }
        }

        setPreviewStock({
            current: currentStock,
            projected: newStock,
            diff: newStock - currentStock,
            wastage: (wastage !== null && !isNaN(wastage)) ? wastage : null,
            transfer: transferPreview
        });

        // Conversion Previews (Destination Items)
        const convPreviews = conversions.map(c => {
            if (!c.destId) return null;
            const destItem = products.find(p => p.ITEM_ID === c.destId);
            if (!destItem) return null;

            // For Op 12 (Transfer), destination stock is ALWAYS from the TARGET store
            // For other conversions (Op 2, 4, 9, 10), it's the CURRENT store
            const targetStoreNum = selectedOpType === 12 ? transferTargetStore : selectedStore;
            const destCurrent = targetStoreNum === 1 ? (destItem.STOCK_S1 || 0) : (destItem.STOCK_S2 || 0);
            const added = parseFloat(c.val) || 0;
            // Dest stock increases
            const destProjected = destCurrent + added;

            return {
                id: c.id,
                name: c.destName,
                destId: c.destId,
                current: destCurrent,
                projected: destProjected
            };
        }).filter(Boolean);

        setPreviewConvStock(convPreviews);
    };

    // SEARCH PRODUCTS
    const filteredProducts = useMemo(() => {
        if (!searchTerm) {
            // If search is focused but empty, show first 50 items
            if (searchFocused) return products.slice(0, 50);
            return []; // Otherwise don't show list (unless logic changes)
        }
        const term = searchTerm.toLowerCase();
        return products.filter(p =>
            (p.NAME && p.NAME.toLowerCase().includes(term)) ||
            (p.CODE && p.CODE.toLowerCase().includes(term))
        ).slice(0, 50);
    }, [products, searchTerm, searchFocused]);

    // HANDLERS
    const handleSelectItem = (item) => {
        setSelectedItem(item);
        setSearchTerm('');

        // Auto-set Quantities based on Op Type
        const currentStock = parseFloat(selectedStore === 1 ? item.STOCK_S1 : item.STOCK_S2) || 0;

        // For "Full" operations, default main/sell qty to current stock
        if ([1, 3, 9, 12].includes(selectedOpType)) {
            setMainQuantity(currentStock > 0 ? currentStock.toFixed(2) : '');
            if (selectedOpType === 3) {
                setSellQuantity(currentStock > 0 ? currentStock.toFixed(2) : '');
            } else {
                setSellQuantity('');
            }
        } else {
            setMainQuantity('');
            setSellQuantity('');
        }

        setSellPrice(item.SELLING_PRICE || null);
        setConversions([]);
    };

    // Modal & Form Reset
    const openAddModal = () => {
        // Reset form state
        setStep(1);
        setSelectedItem(null);
        setSelectedOpType(null);
        setMainQuantity('');
        setSellQuantity('');
        setSellPrice(null);
        setReturnQty('');
        setComments('');
        setConversions([]);
        setCustomerDetails({ id: null, name: '', contact: '' });
        setLorryDetails({ name: '', driver: '', destination: '' });
        setLorryDetails({ name: '', driver: '', destination: '' });

        // Reset Toggles
        setGenerateTripIdEnabled(false);
        setPrintSalesBill(false);
        setConversionEnabled(false);
        setSearchFocused(false);

        setShowOpModal(true);
    };

    const handleAddConversion = () => {
        const newConv = { id: Date.now(), destId: null, destName: '', val: '' };
        setConversions([...conversions, newConv]);
    };

    const updateConversion = (id, field, value) => {
        setConversions(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const removeConversion = (id) => {
        setConversions(prev => prev.filter(c => c.id !== id));
    };



    const generateWebOpCode = () => {
        const dateStr = dayjs().format('YYMMDD');
        const storeStr = `S${selectedStore}`;
        const terminalStr = selectedStore === 1 ? 'POS' : 'WEIGH';
        const randomNum = Math.floor(Math.random() * 999) + 1;
        const counterStr = String(randomNum).padStart(3, '0');
        // Format: WEB-S1-260218-CLR-POS-001
        return `WEB-${storeStr}-${dateStr}-CLR-${terminalStr}-${counterStr}`;
    };

    const validate = () => {
        if (!selectedOpType || !selectedItem) return false;

        // Full operations (1, 3) are always valid once item is selected
        if ([1, 3].includes(selectedOpType)) return true;

        // Conversion (9) MUST have at least one conversion destination
        if (selectedOpType === 9 && conversions.length === 0) return false;

        // Transfer (12)
        if (selectedOpType === 12) {
            if (transferType === 'FULL') return true;
            if (conversionEnabled) return conversions.length > 0;
            return parseFloat(mainQuantity) > 0;
        }

        // Partial Sales (4)
        if (selectedOpType === 4) return parseFloat(sellQuantity) > 0;

        // Partial Clear (2)
        if (selectedOpType === 2) {
            return parseFloat(mainQuantity) > 0 || (conversionEnabled && conversions.length > 0);
        }

        // Stock Return (11)
        if (selectedOpType === 11) {
            if (!selectedReturnOp) return false;
            if (conversionEnabled) return conversions.length > 0;
            return parseFloat(returnQty) > 0;
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validate()) {
            message.error('Please fill all required fields');
            return;
        }

        setSaving(true);
        try {
            let tripId = null;
            if ([1, 2, 3, 4].includes(selectedOpType) && generateTripIdEnabled) {
                const response = await axios.get(`/api/stock-ops/next-web-trip-id/${selectedStore}`);
                if (response.data.success) {
                    tripId = response.data.nextTripId;
                }
            }
            const opCode = generateWebOpCode();

            // Calculate remove qty
            let quantityToRemove = 0;
            const mQty = parseFloat(mainQuantity) || 0;
            const sQty = parseFloat(sellQuantity) || 0;
            // Only count conversions if enabled
            const cQty = (conversionEnabled || selectedOpType === 9)
                ? conversions.reduce((sum, c) => sum + (parseFloat(c.val) || 0), 0)
                : 0;

            if (selectedOpType === 2) quantityToRemove = mQty + cQty;
            else if (selectedOpType === 4) quantityToRemove = sQty + cQty;
            else if (selectedOpType === 9) {
                if (conversionType === 'FULL') quantityToRemove = 'FULL';
                else quantityToRemove = cQty;
            }
            else if (selectedOpType === 12) {
                if (transferType === 'FULL') quantityToRemove = 'FULL';
                else if (conversionEnabled) quantityToRemove = cQty; // Matches preview logic
                else quantityToRemove = mQty;
            }
            else if ([1, 6, 8, 3].includes(selectedOpType)) quantityToRemove = 'FULL';
            else quantityToRemove = mQty;

            let finalOpType = selectedOpType;
            let finalClearanceType = null;
            if (selectedOpType === 12) finalClearanceType = transferType;
            if (selectedOpType === 9) finalClearanceType = conversionType; // Save conversion type as clearance type for clarity

            const payload = {
                OP_TYPE: finalOpType,
                STORE_NO: selectedStore,
                TERMINAL_CODE: 'WEB_APP',
                CONVERSION_TYPE: selectedOpType === 9 ? conversionType : null,
                items: [{
                    ITEM_ID: selectedItem.ITEM_ID,
                    ITEM_CODE: selectedItem.CODE,
                    ITEM_NAME: selectedItem.NAME,
                    QUANTITY: quantityToRemove,
                    CLEARED_QUANTITY: quantityToRemove,
                    SOLD_QUANTITY: [3, 4].includes(selectedOpType) ? sQty : 0,
                    PRICE: parseFloat(sellPrice) || 0,
                    TOTAL: ([3, 4].includes(selectedOpType) ? sQty : 0) * (parseFloat(sellPrice) || 0),
                    HAS_CONVERSION: conversions.length > 0
                }],
                SELL_QUANTITY: [3, 4].includes(selectedOpType) ? sQty : 0,
                SELL_PRICE: parseFloat(sellPrice) || 0,
                BILL_AMOUNT: ([3, 4].includes(selectedOpType) ? sQty : 0) * (parseFloat(sellPrice) || 0),
                conversions: (conversionEnabled || selectedOpType === 9) ? conversions.map(c => ({
                    SOURCE_ITEM_ID: selectedItem.ITEM_ID,
                    SOURCE_ITEM_CODE: selectedItem.CODE,
                    DEST_ITEM_ID: c.destId,
                    DEST_ITEM_CODE: c.destCode,
                    DEST_ITEM_NAME: c.destName,
                    DEST_QUANTITY: parseFloat(c.val) || 0
                })) : [],
                CUSTOMER_NAME: customerDetails.name,
                CUSTOMER_CONTACT: customerDetails.contact,
                LORRY_NAME: lorryDetails.name,
                DRIVER_NAME: lorryDetails.driver,
                DESTINATION: lorryDetails.destination,
                CREATED_BY: user?.USER_ID || user?.ID || 0,
                CREATED_BY_NAME: user?.NAME || 'Web User',
                COMMENTS: comments,
                LOCAL_ID: `WEB-${Date.now()}`,
                TRIP_ID: tripId,
                OP_CODE: opCode,

                STORE_TO: selectedOpType === 12 ? transferTargetStore : null,
                CLEARANCE_TYPE: finalClearanceType
            };

            let endpoint = '/api/stock-ops/create';
            if (selectedOpType === 12) {
                endpoint = '/api/stock-transfers/request';
                const transferPayload = {
                    mainItemId: selectedItem.ITEM_ID,
                    mainItemCode: selectedItem.CODE,
                    mainItemName: selectedItem.NAME,
                    mainItemQty: (transferType === 'FULL') ? 'FULL' : (conversionEnabled ? cQty : mQty),
                    hasConversion: conversionEnabled && conversions.length > 0,
                    storeFrom: selectedStore,
                    storeTo: transferTargetStore,
                    createdBy: user?.USER_ID,
                    createdByName: user?.NAME,
                    comments: comments || 'Direct Web Transfer',
                    conversions: conversionEnabled ? conversions.map(c => ({
                        DEST_ITEM_ID: c.destId,
                        DEST_ITEM_CODE: c.destCode,
                        DEST_ITEM_NAME: c.destName,
                        DEST_QUANTITY: parseFloat(c.val) || 0
                    })) : [],
                    autoApprove: true,
                    approvedBy: user?.USER_ID,
                    approvedByName: user?.NAME,
                    clearanceType: transferType
                };

                await axios.post(endpoint, transferPayload);
            } else if (selectedOpType === 11) {
                endpoint = '/api/stock-ops/create-return';
                const retQuantity = conversionEnabled ? cQty : parseFloat(returnQty);
                const returnPayload = {
                    LOCAL_ID: `WEB-RET-${Date.now()}`,
                    REFERENCE_OP_ID: selectedReturnOp.OP_ID === 'DIRECT' ? 'DIRECT' : selectedReturnOp.OP_ID,
                    REFERENCE_OP_CODE: selectedReturnOp.OP_CODE,
                    STORE_NO: selectedStore,
                    RETURN_QUANTITY: retQuantity,
                    ITEM_ID: selectedItem.ITEM_ID,
                    ITEM_CODE: selectedItem.CODE,
                    ITEM_NAME: selectedItem.NAME,
                    conversions: conversionEnabled ? conversions.map(c => ({
                        DEST_ITEM_ID: c.destId,
                        DEST_ITEM_CODE: c.destCode,
                        DEST_ITEM_NAME: c.destName,
                        DEST_QUANTITY: parseFloat(c.val) || 0
                    })) : [],
                    COMMENTS: comments,
                    CREATED_BY: user?.USER_ID || user?.ID || 0,
                    CREATED_BY_NAME: user?.NAME || 'Web User',
                    TERMINAL_CODE: 'WEB_APP',
                    returnExpenseAmount: returnExpenseAmount // Optional expense automation
                };
                await axios.post(endpoint, returnPayload);
            } else {
                await axios.post(endpoint, payload);
            }

            message.success('Operation saved successfully');
            // notification.success({ message: 'Success', description: `Trip ID: ${tripId || 'N/A'}` });

            setShowOpModal(false);
            setSelectedItem(null);
            setSelectedReturnOp(null);
            setReturnQty('');
            setReturnSearchTerm('');
            setReturnableOps([]);
            fetchProducts();
            fetchHistory();

        } catch (error) {
            console.error(error);
            message.error('Failed to save operation: ' + (error.response?.data?.message || 'Unknown error'));
        } finally {
            setSaving(false);
        }
    };

    // History View Handler
    // History View Handler
    const openHistoryDetail = (record) => {
        // API returns 'breakdown' (lowercase) as an object directly
        setViewRecord(record);
        setViewModalOpen(true);
    };

    const handleDeleteTransaction = async (id) => {
        try {
            // Find the transaction/operation record
            const record = history.find(h => h.TRANSACTION_ID === id || h.OP_ID === id);
            if (!record) return;

            // If it's a Stock Operation, use the dedicated endpoint which handles full rollback
            if (record.SOURCE_TYPE === 'stock_operation') {
                const response = await axios.post('/api/stock-ops/delete', {
                    OP_ID: record.OP_ID, OP_CODE: record.OP_CODE
                });

                if (response.data.success) {
                    message.success('Stock operation reversed successfully');
                    fetchHistory(); // Reload history
                    fetchProducts(); // Reload stock
                } else {
                    message.error('Failed to reverse operation: ' + response.data.message);
                }
            } else {
                // Regular transaction delete
                const response = await axios.post('/api/inventory/transaction/delete', {
                    TRANSACTION_ID: id
                });

                if (response.data.success) {
                    message.success('Transaction deleted');
                    fetchHistory();
                    fetchProducts();
                } else {
                    message.error('Failed to delete: ' + response.data.message);
                }
            }
        } catch (error) {
            console.error('Delete error:', error);
            message.error('Error deleting record');
        } finally {
            setDeletingId(null);
        }
    };

    // HISTORY TABLE COLUMNS (Replicated from Inventory.jsx)
    const historyColumns = [
        { title: 'Code', dataIndex: 'CODE', key: 'CODE', width: 140, render: (code) => <span className="font-mono text-xs text-gray-500">{code}</span> },
        { title: 'Date', dataIndex: 'CREATED_DATE', key: 'DATE', width: 150, render: (date) => dayjs(date).format('DD MMM YY, hh:mm A') },
        { title: 'Type', dataIndex: 'DISPLAY_TYPE', key: 'TYPE', width: 180, render: (type) => <Tag icon={['AdjIn', 'Opening'].includes(type) ? <RiseOutlined /> : <FallOutlined />} color={['AdjIn', 'Opening'].includes(type) ? 'success' : 'error'} style={{ whiteSpace: 'nowrap' }}>{type}</Tag> },
        { title: 'Item', dataIndex: 'ITEM_NAME', key: 'ITEM', render: (text, record) => <div className="flex flex-col"><span className="font-medium">{record.ITEM_NAME}</span><span className="text-xs text-gray-400">{record.ITEM_CODE}</span></div> },
        { title: 'Store', dataIndex: 'STORE_NO', key: 'STORE', width: 70, align: 'center', render: (store) => <Tag>S{store}</Tag> },
        { title: 'Reason / Notes', dataIndex: 'COMMENTS', key: 'NOTE', ellipsis: true, className: 'text-xs text-gray-500' },
        {
            title: '', key: 'action', width: 50, render: (_, record) => (
                currentUser?.ROLE !== 'MONITOR' ? (
                    <div onClick={(e) => e.stopPropagation()}>
                        <Popconfirm
                            title="Delete this record?"
                            description="Stock will be recalculated"
                            onConfirm={() => {
                                if (deletingId) return;
                                setDeletingId(record.TRANSACTION_ID || record.OP_ID);
                                handleDeleteTransaction(record.TRANSACTION_ID || record.OP_ID);
                            }}
                            okText="Delete"
                            cancelText="Cancel"
                            okButtonProps={{ danger: true, loading: deletingId === (record.TRANSACTION_ID || record.OP_ID) }}
                        >
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} loading={deletingId === (record.TRANSACTION_ID || record.OP_ID)} />
                        </Popconfirm>
                    </div>
                ) : null
            )
        }
    ];

    return (
        <div className="stock-ops-container p-4 pb-24 md:pb-8">
            {/* PAGE HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <StockOutlined /> Stock Operations
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Perform stock clearances, conversions, and transfers.</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    className="bg-emerald-600 hover:bg-emerald-500 border-none shadow-lg shadow-emerald-500/30"
                    onClick={openAddModal}
                >
                    Add Stock Operation
                </Button>
            </div>

            {/* FILTERS */}
            <InventoryHistoryFilters
                filters={historyFilters}
                setFilters={setHistoryFilters}
                collapsed={filtersCollapsed}
                setCollapsed={setFiltersCollapsed}
                itemOptions={[...new Map(history.map(h => [h.ITEM_ID, { id: h.ITEM_ID, name: h.ITEM_NAME }])).values()]}
            />

            {/* HISTORY TABLE */}
            {/* HISTORY TABLE (Desktop) */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1 bg-white shadow-sm">
                <Table
                    columns={historyColumns}
                    dataSource={filteredHistory}
                    rowKey={record => record.TRANSACTION_ID || record.OP_ID}
                    loading={historyLoading}
                    pagination={{ pageSize: 12 }}
                    size="middle"
                    scroll={{ x: 900 }}
                    onRow={(record) => ({
                        onClick: () => openHistoryDetail(record),
                        className: 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors'
                    })}
                />
            </div>

            {/* MOBILE LIST VIEW (Copied from Inventory.jsx) */}
            <div className="md:hidden flex flex-col gap-4">
                {historyLoading ? <div className="flex justify-center p-8"><Spin /></div> : filteredHistory.map(item => (
                    <div key={item.TRANSACTION_ID || item.OP_ID} onClick={() => openHistoryDetail(item)} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative cursor-pointer active:scale-95 transition-transform">
                        {/* Delete Button */}
                        {currentUser?.ROLE !== 'MONITOR' && (
                            <div onClick={(e) => e.stopPropagation()} className="absolute top-3 right-3 z-10">
                                <Popconfirm
                                    title="Delete?"
                                    description="Stock will recalculate"
                                    onConfirm={() => {
                                        if (deletingId) return;
                                        setDeletingId(item.TRANSACTION_ID || item.OP_ID);
                                        handleDeleteTransaction(item.TRANSACTION_ID || item.OP_ID);
                                    }}
                                    okText="Yes"
                                    cancelText="No"
                                    okButtonProps={{ danger: true, loading: deletingId === (item.TRANSACTION_ID || item.OP_ID) }}
                                >
                                    <Button type="text" danger size="small" icon={<DeleteOutlined />} loading={deletingId === (item.TRANSACTION_ID || item.OP_ID)} />
                                </Popconfirm>
                            </div>
                        )}

                        <div className="flex justify-between items-start pr-8">
                            <div className="flex flex-col">
                                <span className="font-mono text-[10px] text-gray-400">{item.CODE}</span>
                                <span className="text-xs text-gray-500">{dayjs(item.CREATED_DATE).format('DD MMM YY, hh:mm A')}</span>
                                <span className="text-gray-800 dark:text-white font-semibold">{item.ITEM_NAME || 'Unknown'}</span>
                            </div>
                            <Tag icon={['AdjIn', 'Opening'].includes(item.DISPLAY_TYPE) ? <RiseOutlined /> : <FallOutlined />} color={['AdjIn', 'Opening'].includes(item.DISPLAY_TYPE) ? 'success' : 'error'}>{item.DISPLAY_TYPE}</Tag>
                        </div>

                        <div className="flex justify-between items-center border-t border-gray-200 dark:border-white/5 pt-3">
                            <div className="flex gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Store</span>
                                    <Tag>S{item.STORE_NO}</Tag>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Qty</span>
                                    <span className={`font-bold ${['AdjOut', 'StockClear'].includes(item.DISPLAY_TYPE) ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {['AdjOut', 'StockClear'].includes(item.DISPLAY_TYPE) ? '-' : '+'}{Number(item.ITEM_QTY).toFixed(1)} Kg
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {!historyLoading && filteredHistory.length === 0 && <div className="text-center py-10 text-gray-500">No history records</div>}
            </div>

            {/* == OPERATION MODAL (3-STEP WIZARD) == */}
            <Modal
                title={null}
                open={showOpModal}
                onCancel={() => setShowOpModal(false)}
                footer={null}
                width="89%"
                className="stock-op-modal"
                centered
                destroyOnClose
            >
                <div className="p-4 md:p-8" style={{ minHeight: '600px' }}>
                    {/* Header - Common for all steps */}
                    <div className="flex justify-between items-center mb-8 border-b dark:border-white/10 pb-4">
                        <h3 className="text-2xl font-bold flex items-center gap-3 text-gray-800 dark:text-white">
                            {step === 1 && <><StockOutlined className="text-emerald-500" /> Select Operation Type</>}
                            {step === 2 && <><ShopOutlined className="text-blue-500" /> Select Store</>}
                            {step === 3 && (
                                <>
                                    <StockOutlined className="text-purple-500" />
                                    Operation Details {selectedOpType ? `- ${OPERATION_TYPES.find(o => o.id === selectedOpType)?.shortName}` : ''}
                                </>
                            )}
                        </h3>
                        <div className="flex items-center gap-2">
                            {[1, 2, 3].map(s => (
                                <div key={s} className={`w-3 h-3 rounded-full transition-all ${step >= s ? 'bg-emerald-500 scale-110' : 'bg-gray-200 dark:bg-white/10'}`} />
                            ))}
                            <span className="ml-2 text-gray-400 font-mono text-sm">Step {step}/3</span>
                        </div>
                    </div>

                    {/* STEP 1: Operation Selection */}
                    {step === 1 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-fade-in">
                            {OPERATION_TYPES.map(op => (
                                <div
                                    key={op.id}
                                    className="p-8 rounded-3xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 cursor-pointer flex flex-col items-center gap-6 transition-all hover:bg-white dark:hover:bg-white/10 hover:shadow-xl hover:scale-105 group"
                                    onClick={() => {
                                        handleOpTypeChange(op.id);
                                        if (op.id === 12) {
                                            // Transfer: Auto-select Source=1, Step=3 (Skip Store)
                                            setSelectedStore(1);
                                            setTransferTargetStore(2); // Auto target
                                            setStep(3);
                                        } else {
                                            setStep(2);
                                        }
                                    }}
                                >
                                    <span className="text-6xl group-hover:scale-110 transition-transform filter drop-shadow-lg">{op.icon}</span>
                                    <div className="text-center">
                                        <div className="font-bold text-xl text-gray-800 dark:text-gray-100 mb-1">{op.shortName}</div>
                                        <div className="text-xs text-gray-400">{op.name}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* STEP 2: Store Selection */}
                    {step === 2 && (
                        <div className="flex flex-col h-full py-8 animate-fade-in relative">
                            {/* Back Button positioned absolutely or in flow */}
                            <div className="absolute top-0 left-0">
                                <Button
                                    icon={<UndoOutlined />}
                                    onClick={() => setStep(1)}
                                    className="border-gray-200 dark:border-white/10 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                                >
                                    Back to Operations
                                </Button>
                            </div>

                            <div className="flex flex-col md:flex-row gap-8 justify-center items-center flex-1 mt-12">
                                <button
                                    className="flex-1 w-full max-w-sm p-10 rounded-3xl bg-emerald-50 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-800 hover:border-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:shadow-2xl transition-all flex flex-col items-center gap-6 group"
                                    onClick={() => { setSelectedStore(1); setStep(3); }}
                                >
                                    <div className="w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <ShopOutlined className="text-5xl text-emerald-600 dark:text-white" />
                                    </div>
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">Store 1</div>
                                        <div className="text-emerald-600 dark:text-emerald-400 mt-2">Main POS Store</div>
                                    </div>
                                </button>
                                <div className="text-gray-300 font-bold text-2xl">OR</div>
                                <button
                                    className="flex-1 w-full max-w-sm p-10 rounded-3xl bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-100 dark:border-blue-800 hover:border-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:shadow-2xl transition-all flex flex-col items-center gap-6 group"
                                    onClick={() => { setSelectedStore(2); setStep(3); }}
                                >
                                    <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <ShopOutlined className="text-5xl text-blue-600 dark:text-white" />
                                    </div>
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">Store 2</div>
                                        <div className="text-blue-600 dark:text-blue-400 mt-2">Weighing Station</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Detailed Form */}
                    {step === 3 && (
                        <div className="animate-fade-in flex flex-col h-full">
                            {/* Back & Item Selector Row */}
                            <div className="flex gap-4 mb-6">
                                <Button
                                    icon={<UndoOutlined />}
                                    onClick={() => setStep(selectedOpType === 12 ? 1 : 2)}
                                    className="h-12 px-6 rounded-xl border-gray-300 hover:border-gray-400 hover:text-gray-600"
                                >
                                    Back
                                </Button>

                                <div className="flex-1">
                                    {selectedOpType === 11 && !selectedReturnOp && (
                                        <div className="relative">
                                            {/* Return Operation Search */}
                                            <div
                                                onClick={() => document.getElementById('return-search-input').focus()}
                                                className="h-12 w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-900/10 flex items-center px-4 cursor-text hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                            >
                                                <SearchOutlined className="text-emerald-500 mr-3 text-lg" />
                                                <input
                                                    id="return-search-input"
                                                    className="w-full bg-transparent border-none outline-none text-lg text-gray-700 dark:text-gray-200 placeholder-emerald-400/70"
                                                    placeholder="Search Op Code, Bill Code, or Trip ID to Return..."
                                                    value={returnSearchTerm}
                                                    onChange={e => {
                                                        setReturnSearchTerm(e.target.value);
                                                        fetchReturnableOps(e.target.value);
                                                    }}
                                                    onFocus={() => fetchReturnableOps(returnSearchTerm)}
                                                    autoFocus
                                                />
                                            </div>

                                            {(returnSearchTerm || returnLoading || returnableOps.length > 0) && (
                                                <div className="absolute top-14 left-0 right-0 z-50 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-xl max-h-80 overflow-y-auto">
                                                    {/* Direct Return Option (Persistent) */}
                                                    <div
                                                        className="p-3 border-b-2 border-emerald-100 dark:border-emerald-800/20 cursor-pointer bg-emerald-50/30 dark:bg-emerald-900/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 flex flex-col group"
                                                        onClick={() => handleSelectReturnOp({ OP_ID: 'DIRECT', OP_CODE: 'Direct Return' })}
                                                    >
                                                        <div className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2 group-hover:scale-[1.01] transition-transform">
                                                            <PlusOutlined /> Direct Return (No Reference Operation)
                                                        </div>
                                                        <div className="text-[10px] text-emerald-600/70 dark:text-emerald-500/50 mt-1 uppercase font-bold tracking-wider">
                                                            Select an item manually to increase its stock
                                                        </div>
                                                    </div>

                                                    {returnLoading ? <div className="p-4 text-center"><Spin /></div> : (returnSearchTerm ? returnableOps : returnableOps.slice(0, 10)).map(op => (
                                                        <div
                                                            key={`${op.OP_ID}-${op.ITEM_ID}`}
                                                            className="p-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 flex flex-col group"
                                                            onClick={() => handleSelectReturnOp(op)}
                                                        >
                                                            <div className="flex justify-between items-start mb-1">
                                                                <div className="font-bold text-gray-800 dark:text-white group-hover:text-emerald-600 transition-colors">
                                                                    {op.OP_CODE} {op.TRIP_ID ? `- #${op.TRIP_ID}` : ''}
                                                                </div>
                                                                <Tag color="cyan">{op.OP_TYPE_NAME}</Tag>
                                                            </div>
                                                            <div className="flex justify-between items-center text-xs">
                                                                <div className="text-gray-500">{op.ITEM_NAME} ({op.ITEM_CODE})</div>
                                                                <div className="text-gray-400">{dayjs(op.CREATED_DATE).format('DD MMM YY')}</div>
                                                            </div>
                                                            <div className="mt-1 text-xs font-semibold text-emerald-600">
                                                                {op.SOLD_QUANTITY > 0 ? `Sold: ${op.SOLD_QUANTITY}kg` : `Cleared: ${op.CLEARED_QUANTITY}kg`}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {!returnLoading && returnableOps.length === 0 && <div className="p-4 text-center text-gray-400">No matching operations found</div>}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(selectedOpType !== 11 && !selectedItem) || (selectedOpType === 11 && selectedReturnOp?.OP_ID === 'DIRECT' && !selectedItem) ? (
                                        <div className="relative">
                                            {/* Main Item Selector Trigger */}
                                            <div
                                                onClick={() => document.getElementById('item-search-input').focus()}
                                                className="h-12 w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-900/10 flex items-center px-4 cursor-text hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                            >
                                                <SearchOutlined className="text-emerald-500 mr-3 text-lg" />
                                                <input
                                                    id="item-search-input"
                                                    className="w-full bg-transparent border-none outline-none text-lg text-gray-700 dark:text-gray-200 placeholder-emerald-400/70"
                                                    placeholder="Search to Select Main Item..."
                                                    value={searchTerm}
                                                    onChange={e => setSearchTerm(e.target.value)}
                                                    onFocus={() => setSearchFocused(true)}
                                                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)} // Delay to allow click
                                                    autoFocus
                                                />
                                            </div>

                                            {(searchTerm || searchFocused) && (
                                                <div className="absolute top-14 left-0 right-0 z-50 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-xl max-h-80 overflow-y-auto">
                                                    {filteredProducts.map(p => (
                                                        <div key={p.ITEM_ID} className="p-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 flex justify-between items-center group" onClick={() => handleSelectItem(p)}>
                                                            <div>
                                                                <div className="font-bold text-gray-800 dark:text-white group-hover:text-emerald-600 transition-colors">{p.NAME}</div>
                                                                <div className="text-xs text-gray-500 font-mono">{p.CODE}</div>
                                                            </div>
                                                            <div className="text-right text-xs">
                                                                <Tag color={Number(selectedStore === 1 ? p.STOCK_S1 : p.STOCK_S2) > 0 ? 'success' : 'warning'}>
                                                                    S{selectedStore}: {Number(selectedStore === 1 ? p.STOCK_S1 : p.STOCK_S2).toFixed(1)} Kg
                                                                </Tag>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {filteredProducts.length === 0 && <div className="p-4 text-center text-gray-400">No items found</div>}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        (selectedItem || selectedReturnOp) && (
                                            <div className="flex flex-col gap-2">
                                                <div className="h-auto py-3 px-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl flex flex-col gap-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3 flex-wrap">
                                                            <span className="font-bold text-lg text-blue-900 dark:text-blue-100">{selectedItem?.NAME}</span>
                                                            <span className="font-mono text-sm text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">{selectedItem?.CODE}</span>
                                                            {selectedReturnOp && (
                                                                <>
                                                                    <Tag color="blue">{selectedReturnOp.OP_CODE} {selectedReturnOp.TRIP_ID ? `- #${selectedReturnOp.TRIP_ID}` : ''}</Tag>
                                                                    <Tag color="cyan">{selectedReturnOp.OP_TYPE_NAME}</Tag>
                                                                </>
                                                            )}
                                                        </div>
                                                        <Button type="text" danger icon={<CloseOutlined />} onClick={() => { setSelectedItem(null); setSelectedReturnOp(null); }} />
                                                    </div>

                                                    {selectedReturnOp && (
                                                        <div className="flex flex-col border-t border-blue-100 dark:border-blue-800/50 pt-2 mt-1">
                                                            <div className="flex justify-between items-end mb-1">
                                                                <div className="text-xs text-blue-600/70 dark:text-blue-400/70 font-medium">
                                                                    {selectedReturnOp.OP_ID === 'DIRECT' ? 'Manual Stock Add' : dayjs(selectedReturnOp.CREATED_DATE).format('DD MMM YY')}
                                                                </div>
                                                                <div className="text-sm font-bold text-blue-800 dark:text-blue-200">
                                                                    {selectedReturnOp.OP_ID === 'DIRECT' ? 'No Reference' : (selectedReturnOp.SOLD_QUANTITY > 0 ? `Sold: ${selectedReturnOp.SOLD_QUANTITY}kg` : `Cleared: ${selectedReturnOp.CLEARED_QUANTITY}kg`)}
                                                                </div>
                                                            </div>
                                                            {selectedReturnOp.OP_ID !== 'DIRECT' && selectedReturnOp.PRICE > 0 && (
                                                                <div className="flex justify-between items-center bg-white/40 dark:bg-black/10 px-2 py-1 rounded-lg text-[10px] font-mono mt-1">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-gray-400 uppercase font-bold text-[8px]">Price/Kg</span>
                                                                        <span className="text-blue-700 dark:text-blue-300">Rs {Number(selectedReturnOp.PRICE).toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-gray-400 uppercase font-bold text-[8px]">Total Value</span>
                                                                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">Rs {Number(selectedReturnOp.TOTAL).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Stock Projection (Only if NOT Return) */}
                                                    {!selectedReturnOp && (
                                                        selectedOpType === 12 && previewStock.transfer ? (
                                                            <div className="flex flex-col gap-1 mt-2 border-t border-blue-100 dark:border-blue-800/20 pt-2">
                                                                <div className="flex items-center justify-between bg-white/30 dark:bg-black/10 px-2 py-0.5 rounded">
                                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">S1 (Removal)</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-mono text-xs text-gray-500">{Number(previewStock.transfer.s1.current).toFixed(1)}</span>
                                                                        <span className="text-gray-300 text-[10px]">→</span>
                                                                        <span className={`font-mono text-xs font-bold ${previewStock.transfer.s1.projected < 0 ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
                                                                            {Number(previewStock.transfer.s1.projected).toFixed(1)}
                                                                        </span>
                                                                        <span className="text-[10px] text-gray-400">kg</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between bg-emerald-500/5 px-2 py-0.5 rounded">
                                                                    <span className="text-[10px] font-bold text-emerald-500 uppercase">S2 (Addition)</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-mono text-xs text-gray-500">{Number(previewStock.transfer.s2.current).toFixed(1)}</span>
                                                                        <span className="text-emerald-300 text-[10px]">→</span>
                                                                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                                            {Number(previewStock.transfer.s2.projected).toFixed(1)}
                                                                        </span>
                                                                        <span className="text-[10px] text-emerald-500/50">kg</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-4 mt-1">
                                                                <div className="text-right leading-tight flex items-center gap-2">
                                                                    <div className="flex flex-col items-end">
                                                                        <div className="text-[10px] uppercase text-gray-400 font-bold">Current</div>
                                                                        <div className="font-mono font-bold text-gray-600 dark:text-gray-300">
                                                                            {Number(previewStock.current).toFixed(2)}
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-gray-300">→</div>
                                                                    <div className="flex flex-col items-end">
                                                                        <div className="text-[10px] uppercase text-emerald-500 font-bold">New</div>
                                                                        <div className={`font-mono font-bold ${previewStock.projected < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                            {Number(previewStock.projected).toFixed(2)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Main Form Content - Always Visible but Disabled if No Item */}
                            <div className={`flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-y-auto pr-2 transition-all ${!selectedItem ? 'opacity-50 pointer-events-none grayscale' : ''}`} style={{ maxHeight: 'calc(100vh - 350px)' }}>
                                {/* LEFT COLUMN: Core Inputs */}
                                <div className="flex flex-col gap-6">
                                    <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-100 dark:border-white/5">



                                        {/* Operation Values Header - Hidden for Op 1 */}
                                        {selectedOpType !== 1 && <h4 className="font-bold text-gray-500 uppercase text-xs mb-4 tracking-wider">Operation Values</h4>}

                                        {/* Quantities */}
                                        {/* Op 12: Hide Main Qty if Conversion Enabled (User adds converted items directly) */}
                                        {([2, 5, 7, 10].includes(selectedOpType) || (selectedOpType === 12 && !conversionEnabled)) && (
                                            <div className="mb-4">
                                                <label className="block text-sm font-medium mb-1.5 ml-1">Quantity (Kg)</label>
                                                <InputNumber
                                                    value={mainQuantity}
                                                    onChange={setMainQuantity}
                                                    className="w-full h-12 text-lg rounded-xl"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        )}

                                        {/* Sales Details (Op 3, 4 only) */}
                                        {[3, 4].includes(selectedOpType) && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium mb-1.5 ml-1">Sold Qty (Kg)</label>
                                                    <InputNumber
                                                        value={sellQuantity}
                                                        onChange={(v) => {
                                                            setSellQuantity(v);
                                                            // For Op 4, Main Qty implicitly equals Sell Qty
                                                            if (selectedOpType === 4) setMainQuantity(v);
                                                        }}
                                                        className="w-full h-12 text-lg rounded-xl"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium mb-1.5 ml-1">Price / Kg (Rs)</label>
                                                    <InputNumber value={sellPrice} onChange={setSellPrice} className="w-full h-12 text-lg rounded-xl" placeholder="0.00" />
                                                </div>
                                                {sellQuantity && sellPrice && (
                                                    <div className="col-span-2 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl flex justify-between items-center text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-100">
                                                        <span>Total Bill Value</span>
                                                        <span className="text-xl">Rs {(parseFloat(sellQuantity) * parseFloat(sellPrice)).toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Return Qty */}
                                        {selectedOpType === 11 && !conversionEnabled && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium mb-1.5 ml-1">Return Quantity (Kg)</label>
                                                    <InputNumber value={returnQty} onChange={setReturnQty} className="w-full h-12 text-lg rounded-xl" placeholder="0.00" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium mb-1.5 ml-1 flex items-center gap-1.5">
                                                        Return Expense <span className="text-[10px] text-gray-400 uppercase">(Optional)</span>
                                                    </label>
                                                    <InputNumber
                                                        value={returnExpenseAmount}
                                                        onChange={setReturnExpenseAmount}
                                                        className="w-full h-12 text-lg rounded-xl"
                                                        placeholder="0.00"
                                                        min={0}
                                                        prefix="Rs"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Transfer Mode */}
                                        {selectedOpType === 12 && (
                                            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 mt-2">
                                                <label className="block text-xs font-bold uppercase text-gray-400 mb-3">Transfer Mode</label>
                                                <Radio.Group value={transferType} onChange={e => setTransferType(e.target.value)} buttonStyle="solid" className="w-full flex">
                                                    <Radio.Button value="FULL" className="flex-1 text-center">Full Clear</Radio.Button>
                                                    <Radio.Button value="PARTIAL" className="flex-1 text-center">Partial Qty</Radio.Button>
                                                </Radio.Group>
                                            </div>
                                        )}
                                    </div>

                                    {/* Conversion Type - Op 9 */}
                                    {selectedOpType === 9 && (
                                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 mt-2">
                                            <label className="block text-xs font-bold uppercase text-gray-400 mb-3">Conversion Type</label>
                                            <Radio.Group value={conversionType} onChange={e => setConversionType(e.target.value)} buttonStyle="solid" className="w-full flex">
                                                <Radio.Button value="FULL" className="flex-1 text-center">Full (Clear Stock)</Radio.Button>
                                                <Radio.Button value="PARTIAL" className="flex-1 text-center">Partial (Keep Rem.)</Radio.Button>
                                            </Radio.Group>
                                        </div>
                                    )}

                                    {/* Conversions Panel - Toggleable */}
                                    {/* Show Toggle if NOT pure conversion op (Op 9) */}
                                    {(![9].includes(selectedOpType)) && (
                                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${conversionEnabled ? 'bg-blue-500' : 'bg-gray-300'}`} onClick={() => setConversionEnabled(!conversionEnabled)}>
                                                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${conversionEnabled ? 'translate-x-4' : ''}`} />
                                                </div>
                                                <span className="font-medium text-gray-700 dark:text-gray-300">Enable Item Conversion</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Actual Conversion Panel with INLINE SELECT */}
                                    {([9].includes(selectedOpType) || conversionEnabled) && (
                                        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-800/30 animate-fade-in">
                                            <div className="flex justify-between items-center mb-4">
                                                <span className="font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2"><SwapOutlined /> Conversions / Destinations</span>
                                                <Button size="small" onClick={handleAddConversion} type="primary" ghost icon={<PlusOutlined />}>Add Line</Button>
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                {conversions.map((c, idx) => (
                                                    <div key={c.id} className="flex gap-2 items-center bg-white dark:bg-gray-800 p-2 rounded-xl shadow-sm">
                                                        <div className="flex-1">
                                                            <div className="flex flex-col">
                                                                <Select
                                                                    showSearch
                                                                    placeholder="Select Destination Item"
                                                                    optionFilterProp="children"
                                                                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                                                                    className="w-full"
                                                                    value={c.destId}
                                                                    onChange={(val) => {
                                                                        const item = products.find(p => p.ITEM_ID === val);
                                                                        if (item) {
                                                                            setConversions(prev => prev.map(conv => conv.id === c.id ? {
                                                                                ...conv,
                                                                                destId: item.ITEM_ID,
                                                                                destCode: item.CODE,
                                                                                destName: item.NAME
                                                                            } : conv));
                                                                        }
                                                                    }}
                                                                    options={products
                                                                        .filter(p => ([9, 12, 11].includes(selectedOpType)) ? true : p.ITEM_ID !== selectedItem?.ITEM_ID)
                                                                        .map(p => ({
                                                                            value: p.ITEM_ID,
                                                                            label: `${p.NAME} (${p.CODE})`
                                                                        }))}
                                                                    dropdownMatchSelectWidth={false}
                                                                    listHeight={300}
                                                                />

                                                                {/* Conversion Stock Data */}
                                                                {c.destId && (
                                                                    <div className="px-1 mt-1 text-[10px] text-gray-400 font-mono flex items-center gap-2">
                                                                        <span>{selectedOpType === 12 ? 'S2 Arrival' : 'Current'}:</span>
                                                                        {(() => {
                                                                            const preview = previewConvStock.find(pc => pc.id === c.id);
                                                                            if (!preview) return <span>-</span>;
                                                                            return (
                                                                                <span className="flex items-center gap-1">
                                                                                    {Number(preview.current).toFixed(1)}
                                                                                    <span className="text-gray-500">→</span>
                                                                                    <span className={`${selectedOpType === 12 ? 'text-emerald-500' : 'text-blue-500'} font-bold`}>
                                                                                        {Number(preview.projected).toFixed(1)}
                                                                                    </span>
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <InputNumber
                                                            placeholder="Qty"
                                                            value={c.val}
                                                            onChange={v => updateConversion(c.id, 'val', v)}
                                                            style={{ width: 100 }}
                                                        />
                                                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeConversion(c.id)} />
                                                    </div>
                                                ))}
                                                {conversions.length === 0 && <div className="text-center py-6 text-gray-400 bg-white/50 dark:bg-white/5 rounded-xl border border-dashed border-gray-300">No conversions added</div>}
                                            </div>
                                        </div>
                                    )}

                                    {/* Wastage / Surplus Display (Moved to Bottom of Left Column) */}
                                    {/* Wastage / Surplus Display (Moved to Bottom of Left Column) */}
                                    {previewStock.wastage !== null && (
                                        <div className={`mt-4 p-4 rounded-xl border-2 transition-colors ${previewStock.wastage < 0
                                            ? 'bg-orange-50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/30'
                                            : previewStock.wastage > 0
                                                ? 'bg-blue-50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30'
                                                : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30'
                                            }`}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className={`font-bold tracking-wide uppercase text-[10px] ${previewStock.wastage < 0
                                                    ? 'text-orange-500'
                                                    : previewStock.wastage > 0
                                                        ? 'text-blue-500'
                                                        : 'text-emerald-500'
                                                    }`}>
                                                    {selectedOpType === 12
                                                        ? (previewStock.wastage < 0 ? 'Transfer Loss (S1 → S2)' : previewStock.wastage > 0 ? 'Transfer Surplus' : 'Exact Transfer')
                                                        : (previewStock.wastage < 0 ? 'Wastage (Leakage)' : previewStock.wastage > 0 ? 'Surplus' : 'No Loss (Perfect Clear)')}
                                                </span>
                                                {previewStock.wastage < 0 ? <FallOutlined className="text-orange-500" /> : previewStock.wastage > 0 ? <RiseOutlined className="text-blue-500" /> : <CheckOutlined className="text-emerald-500" />}
                                            </div>
                                            <div className="flex items-end gap-1">
                                                <span className={`text-4xl font-bold ${previewStock.wastage < 0
                                                    ? 'text-orange-600 dark:text-orange-400'
                                                    : previewStock.wastage > 0
                                                        ? 'text-blue-600 dark:text-blue-400'
                                                        : 'text-emerald-600 dark:text-emerald-400'
                                                    }`}>
                                                    {previewStock.wastage > 0 ? '+' : ''}{Number(previewStock.wastage).toFixed(2)}
                                                </span>
                                                <span className={`pb-1 text-sm font-medium ${previewStock.wastage < 0
                                                    ? 'text-orange-400'
                                                    : previewStock.wastage > 0
                                                        ? 'text-blue-400'
                                                        : 'text-emerald-400'
                                                    }`}>Kg</span>
                                            </div>
                                            <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                                                {selectedOpType === 12
                                                    ? 'Calculated as (Arrived at S2) - (Released from S1)'
                                                    : 'Real-time calculation based on input vs current stock.'}
                                            </div>
                                        </div>
                                    )}

                                </div>

                                {/* RIGHT COLUMN: Extra Info */}
                                <div className="flex flex-col gap-6">

                                    {/* Customer Details - Select from List (Op 1, 2, 3, 4) */}
                                    {[1, 2, 3, 4].includes(selectedOpType) && (
                                        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                                            <h4 className="font-bold text-blue-800 dark:text-blue-300 uppercase text-xs mb-4 tracking-wider flex items-center gap-2"><UserOutlined /> Customer Details</h4>

                                            <Select
                                                showSearch
                                                placeholder="Select a customer"
                                                optionFilterProp="children"
                                                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                                                className="w-full h-10 mb-3"
                                                value={customerDetails.id}
                                                onChange={(val) => {
                                                    const cust = customers.find(c => c.CUSTOMER_ID === val);
                                                    if (cust) {
                                                        setCustomerDetails({
                                                            id: cust.CUSTOMER_ID,
                                                            name: cust.NAME,
                                                            contact: cust.PHONE_NUMBER || ''
                                                        });
                                                    } else {
                                                        setCustomerDetails({ id: null, name: '', contact: '' });
                                                    }
                                                }}
                                                options={customers.map(c => ({
                                                    value: c.CUSTOMER_ID,
                                                    label: `${c.NAME} ${c.PHONE_NUMBER ? `(${c.PHONE_NUMBER})` : ''}`
                                                }))}
                                            />

                                            {/* Read-Only Display of Selected Customer Info */}
                                            {customerDetails.id && (
                                                <div className="text-xs text-blue-600 dark:text-blue-400 px-1">
                                                    <div><span className="font-semibold">Name:</span> {customerDetails.name}</div>
                                                    <div><span className="font-semibold">Contact:</span> {customerDetails.contact || 'N/A'}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Lorry Details */}
                                    {[1, 2, 3, 4, 12].includes(selectedOpType) && (
                                        <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-100 dark:border-white/5">
                                            <h4 className="font-bold text-gray-500 uppercase text-xs mb-4 tracking-wider flex items-center gap-2">🚛 Transport Details</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <Input
                                                    placeholder="Lorry No"
                                                    value={lorryDetails.name}
                                                    onChange={e => setLorryDetails({ ...lorryDetails, name: e.target.value })}
                                                    className="col-span-2 h-10 rounded-lg"
                                                />
                                                <Input
                                                    placeholder="Driver Name"
                                                    value={lorryDetails.driver}
                                                    onChange={e => setLorryDetails({ ...lorryDetails, driver: e.target.value })}
                                                    className="h-10 rounded-lg"
                                                />
                                                <Input
                                                    placeholder="Destination"
                                                    value={lorryDetails.destination}
                                                    onChange={e => setLorryDetails({ ...lorryDetails, destination: e.target.value })}
                                                    className="h-10 rounded-lg"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Trip ID Toggle (Replica of POS) */}
                                    {[1, 2, 3, 4].includes(selectedOpType) && (
                                        <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-100 dark:border-amber-900/30">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        checked={generateTripIdEnabled}
                                                        onChange={(e) => setGenerateTripIdEnabled(e.target.checked)}
                                                    >
                                                        <span className="font-bold text-gray-700 dark:text-gray-200">Generate Trip ID</span>
                                                    </Checkbox>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Comments */}
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium mb-1.5 ml-1 text-gray-500">Comments</label>
                                        <Input.TextArea
                                            placeholder="Add any notes, reasons, or specific details..."
                                            rows={4}
                                            value={comments}
                                            onChange={e => setComments(e.target.value)}
                                            className="rounded-xl resize-none"
                                        />
                                    </div>

                                    {/* Preview & Submit Actions */}
                                    <div className="bg-gray-100 dark:bg-white/10 p-6 rounded-2xl flex flex-col gap-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 uppercase font-bold text-xs tracking-wider">Projected Stock Update ({selectedItem?.NAME || 'Item'})</span>
                                            <span className={`font-bold ${previewStock.diff < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                {previewStock.diff > 0 ? '+' : ''}{Number(previewStock.diff).toFixed(2)} Kg
                                            </span>
                                        </div>


                                        {/* REMOVED WASTAGE FROM FOOTER - Moved to LEFT COLUMN */}

                                        <div className="flex justify-between items-end">
                                            <div className="text-3xl font-bold text-gray-800 dark:text-white">
                                                {Number(previewStock.projected).toFixed(2)} <span className="text-sm font-normal text-gray-500">Kg</span>
                                            </div>
                                            <Button
                                                type="primary"
                                                size="large"
                                                onClick={handleSubmit}
                                                loading={saving}
                                                icon={<CheckOutlined />}
                                                className="bg-emerald-600 hover:bg-emerald-500 h-12 px-8 rounded-xl shadow-lg shadow-emerald-500/30 border-none"
                                            >
                                                {selectedOpType === 12 ? 'Submit Transfer' : 'Confirm'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </Modal>



            {/* == VIEW DETAILS MODAL == (Copied from Inventory.jsx) */}
            <Modal
                title={<div className="flex items-center gap-2"><EyeOutlined className="text-blue-500" /> {viewRecord?.SOURCE_TYPE === 'stock_operation' ? (viewRecord.OP_TYPE === 11 ? 'Stock Return Details' : 'Stock Operation Details') : 'Transaction Details'}</div>}
                open={viewModalOpen}
                onCancel={() => setViewModalOpen(false)}
                footer={[<Button key="close" onClick={() => setViewModalOpen(false)}>Close</Button>]}
                width={550}
            >
                {viewRecord && (
                    <div className="flex flex-col gap-4">
                        {/* Header */}
                        <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/10">
                            <div className="flex gap-2 items-center">
                                <Tag icon={['AdjIn', 'Opening'].includes(viewRecord.DISPLAY_TYPE) ? <RiseOutlined /> : <FallOutlined />} color={viewRecord.SOURCE_TYPE === 'stock_operation' ? 'purple' : (['AdjIn', 'Opening'].includes(viewRecord.DISPLAY_TYPE) ? 'success' : 'error')}>
                                    {viewRecord.DISPLAY_TYPE}
                                </Tag>
                                <Tag>Store {viewRecord.STORE_NO}</Tag>
                            </div>
                            <div className="text-gray-500 text-sm">
                                {dayjs(viewRecord.CREATED_DATE).format('DD MMM YYYY, hh:mm A')}
                            </div>
                        </div>

                        {/* Stock Operation Breakdown */}
                        {viewRecord.SOURCE_TYPE === 'stock_operation' && (viewRecord.breakdown || viewRecord.OP_TYPE === 11) && (
                            <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border border-purple-100 dark:border-purple-800/30">

                                {/* Specialized Stock Return View (Op 11) */}
                                {viewRecord.OP_TYPE === 11 ? (
                                    <div>
                                        {/* Rich Header Flow */}
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex flex-col items-center">
                                                <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                    <UserOutlined className="text-lg text-orange-600 dark:text-orange-400" />
                                                </div>
                                                <span className="text-xs font-bold text-gray-500 mt-1">Customer</span>
                                            </div>

                                            <div className="flex-1 h-0.5 bg-gray-300 mx-2 relative flex items-center justify-center">
                                                <div className="absolute -top-3 bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 font-mono">
                                                    {Number(viewRecord.ITEM_QTY || viewRecord.breakdown?.source?.adjustmentQty || 0).toFixed(3)} Kg
                                                </div>
                                                <UndoOutlined className="text-blue-500 text-lg" />
                                            </div>

                                            <div className="flex flex-col items-center">
                                                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                    <span className="text-lg font-bold text-green-600 dark:text-green-400">S{viewRecord.STORE_NO}</span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-500 mt-1">Store {viewRecord.STORE_NO}</span>
                                            </div>
                                        </div>

                                        {/* Main Item Detail - Show ONLY if NO conversions (Standard Return) */}
                                        {(!viewRecord.breakdown?.destinations || viewRecord.breakdown.destinations.length === 0) && (
                                            <div className="mb-4 p-3 bg-white/60 dark:bg-black/20 rounded-lg">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{viewRecord.ITEM_NAME || 'Item'}</span>
                                                    <span className="text-green-600 font-bold">+{Number(viewRecord.ITEM_QTY || viewRecord.breakdown?.source?.adjustmentQty || 0).toFixed(3)} Kg</span>
                                                </div>
                                                <div className="mt-2 text-xs flex justify-between bg-green-50 dark:bg-green-900/20 p-2 rounded">
                                                    <span className="text-gray-500">Prev: {viewRecord.breakdown?.source?.previousStock !== undefined ? Number(viewRecord.breakdown.source.previousStock).toFixed(3) : '-'}</span>
                                                    <span className="text-gray-400">→</span>
                                                    <span className="font-bold text-gray-700 dark:text-gray-300">Curr: {viewRecord.breakdown?.source ? Number((parseFloat(viewRecord.breakdown.source.previousStock) || 0) + (parseFloat(viewRecord.breakdown.source.adjustmentQty) || 0)).toFixed(3) : '-'}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Reference */}
                                        {(viewRecord.breakdown?.refOpCode || viewRecord.breakdown?.refBillCode) && (
                                            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-lg">
                                                {viewRecord.breakdown?.refOpCode && (
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Original Op</span>
                                                        <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">{viewRecord.breakdown.refOpCode}</span>
                                                    </div>
                                                )}
                                                {viewRecord.breakdown?.refBillCode && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Original Bill</span>
                                                        <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">{viewRecord.breakdown.refBillCode}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Converted Items if any */}
                                        {viewRecord.breakdown?.destinations && viewRecord.breakdown.destinations.length > 0 && (
                                            <div className="mt-2">
                                                <div className="text-xs font-bold uppercase text-gray-400 mb-2 flex items-center gap-2">
                                                    <RiseOutlined className="text-green-500" /> Converted To
                                                </div>
                                                {viewRecord.breakdown.destinations.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-center p-2 bg-white/50 dark:bg-white/5 rounded-lg mb-1 border border-gray-100 dark:border-white/10">
                                                        <span className="font-medium text-gray-700 dark:text-gray-300">
                                                            {item.itemName}
                                                        </span>
                                                        <span className="text-green-600 font-bold">+{Number(item.quantity).toFixed(3)} Kg</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : viewRecord.breakdown && (
                                    <>
                                        {/* Specialized Transfer View (Op 5, 6) */}
                                        {[5, 6].includes(viewRecord.OP_TYPE) ? (
                                            <div>
                                                {/* Transfer Flow Header */}
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className="flex flex-col items-center">
                                                        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                            <span className="text-lg font-bold text-red-600 dark:text-red-400">S1</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-500 mt-1">Source</span>
                                                    </div>

                                                    <div className="flex-1 h-0.5 bg-gray-300 mx-2 relative flex items-center justify-center">
                                                        <div className="absolute -top-3 bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 font-mono">
                                                            {Number(viewRecord.breakdown.totalDestQty || 0).toFixed(1)} Kg
                                                        </div>
                                                        <SwapOutlined className="text-blue-500 text-lg" />
                                                    </div>

                                                    <div className="flex flex-col items-center">
                                                        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                            <span className="text-lg font-bold text-green-600 dark:text-green-400">S2</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-500 mt-1">Dest</span>
                                                    </div>
                                                </div>

                                                {/* Source Detail */}
                                                <div className="mb-4 p-3 bg-white/60 dark:bg-black/20 rounded-lg">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">From Store 1: {viewRecord.breakdown.source.itemName}</span>
                                                        <span className="text-xs text-red-500 font-mono">-{Number(viewRecord.breakdown.source.adjustmentQty).toFixed(1)} Kg</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 flex justify-between">
                                                        <span>Previous Stock: {Number(viewRecord.breakdown.source.previousStock).toFixed(1)} Kg</span>
                                                        {viewRecord.OP_TYPE === 6 && (
                                                            <span>Full Clear</span>
                                                        )}
                                                    </div>
                                                    {/* Show Surplus/Wastage if Full Clear */}
                                                    {(viewRecord.breakdown.wastage > 0 || viewRecord.breakdown.surplus > 0) && (
                                                        <div className="mt-2 text-xs flex gap-2">
                                                            {viewRecord.breakdown.wastage > 0 && <Tag color="error">Wastage: {viewRecord.breakdown.wastage} Kg</Tag>}
                                                            {viewRecord.breakdown.surplus > 0 && <Tag color="warning">Surplus: {viewRecord.breakdown.surplus} Kg</Tag>}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Destinations Detail with Before/After Stock */}
                                                <div className="p-3 bg-white/60 dark:bg-black/20 rounded-lg">
                                                    <div className="text-xs text-gray-500 mb-2 uppercase">To Store 2</div>
                                                    {viewRecord.breakdown.store2Items && viewRecord.breakdown.store2Items.length > 0 ? (
                                                        viewRecord.breakdown.store2Items.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-center mb-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.itemName}</span>
                                                                    <span className="text-xs text-gray-400">{item.itemCode}</span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-sm font-bold text-green-600">+{Number(item.addedQty).toFixed(1)} Kg</span>
                                                                    <div className="text-xs text-gray-400">
                                                                        {Number(item.previousStock).toFixed(1)} → {Number(item.currentStock).toFixed(1)} Kg
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : viewRecord.breakdown.destinations && viewRecord.breakdown.destinations.length > 0 ? (
                                                        viewRecord.breakdown.destinations.map((dest, idx) => (
                                                            <div key={idx} className="flex justify-between items-center mb-1">
                                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{dest.itemName}</span>
                                                                <span className="text-sm font-bold text-green-600">+{Number(dest.quantity).toFixed(1)} Kg</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        // Fallback if destinations empty (should be main item)
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{viewRecord.breakdown.source.itemName}</span>
                                                            <span className="text-sm font-bold text-green-600">+{Number(viewRecord.breakdown.totalDestQty).toFixed(1)} Kg</span>
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        ) : (
                                            // Standard View (Existing Logic + Updated for Main/Converted breakdown) 
                                            <>
                                                {/* Source Item - Full/Partial Clear */}
                                                {(() => {
                                                    const source = viewRecord.breakdown.source || {};
                                                    const isAdjIn = source.adjustmentType === 'AdjIn';
                                                    const prevStock = parseFloat(source.previousStock || 0);
                                                    const adjQty = parseFloat(source.adjustmentQty || 0); // Total removed
                                                    const soldQty = parseFloat(source.soldQty || 0);
                                                    const isSalesOp = viewRecord.breakdown.isSalesOperation;
                                                    const convertedQty = parseFloat(viewRecord.breakdown.totalDestQty || 0);
                                                    const wastage = parseFloat(viewRecord.breakdown.wastage || 0);

                                                    // Determine Main Qty: Use backend value or calculate
                                                    // For Op 2, 4: Main Qty = Total - Converted
                                                    let mainQty = parseFloat(source.mainQty);
                                                    if (isNaN(mainQty)) {
                                                        // Fallback if backend doesn't send mainQty yet
                                                        if (isSalesOp) mainQty = soldQty;
                                                        else mainQty = Math.abs(adjQty) - convertedQty;
                                                    }
                                                    if (mainQty < 0) mainQty = 0;

                                                    return (
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isAdjIn ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                                                {isAdjIn ? <RiseOutlined className="text-green-500 text-lg" /> : <FallOutlined className="text-red-500 text-lg" />}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="text-xs text-gray-500 uppercase tracking-wider">
                                                                    Source Item ({isAdjIn ? 'Stock Added' : 'Cleared'})
                                                                </div>
                                                                <div className="font-bold text-gray-800 dark:text-white">
                                                                    {source.itemName || viewRecord.ITEM_NAME}
                                                                    <span className="ml-2 text-sm text-gray-500">({source.itemCode})</span>
                                                                </div>

                                                                {/* MAIN QUANTITY DISPLAY */}
                                                                {mainQty > 0 && (
                                                                    <div className={`font-bold text-lg ${isAdjIn ? 'text-green-500' : 'text-red-500'}`}>
                                                                        {isAdjIn ? '+' : '-'}{mainQty.toFixed(1)} Kg
                                                                        <span className="text-sm font-normal text-gray-500 ml-1">
                                                                            (Main Item)
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* CONVERTED QUANTITY DISPLAY (If any) */}
                                                                {convertedQty > 0 && (
                                                                    <div className="font-bold text-lg text-red-500 mt-1">
                                                                        - {convertedQty.toFixed(1)} Kg
                                                                        <span className="text-sm font-normal text-gray-500 ml-1">
                                                                            (Converted)
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* TOTAL REMOVED/ADDED DISPLAY */}
                                                                <div className="mt-1 text-sm font-bold text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-1">
                                                                    {isAdjIn ? 'Total Added' : 'Total Removed'}: {adjQty.toFixed(1)} Kg
                                                                    <span className="ml-2 font-normal text-gray-500">
                                                                        (prev: {prevStock.toFixed(1)} → {(isAdjIn ? prevStock + adjQty : prevStock - adjQty).toFixed(1)} Kg)
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Arrow Separator */}
                                                {viewRecord.breakdown.destinations?.length > 0 && (
                                                    <div className="flex justify-center my-2">
                                                        <div className="w-0.5 h-6 bg-gray-300 dark:bg-gray-600"></div>
                                                    </div>
                                                )}

                                                {/* Destinations */}
                                                {viewRecord.breakdown.destinations?.length > 0 && (
                                                    <div className="space-y-2 mb-4">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                            <RiseOutlined className="text-green-500" /> Converted To
                                                        </div>
                                                        {viewRecord.breakdown.destinations.map((dest, idx) => (
                                                            <div key={idx} className="flex justify-between items-center p-2 bg-white/50 dark:bg-white/5 rounded-lg">
                                                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                                                    {dest.itemName} <span className="text-xs text-gray-400">({dest.itemCode})</span>
                                                                </span>
                                                                <span className="text-green-600 font-bold">+{dest.quantity?.toFixed(1)} Kg</span>
                                                            </div>
                                                        ))}
                                                        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-white/10">
                                                            <span className="text-sm text-gray-500">Total Output</span>
                                                            <span className="text-sm font-bold text-green-600">+{viewRecord.breakdown.totalDestQty?.toFixed(1)} Kg</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Sales Bill Section - For ops 3, 4 */}
                                        {viewRecord.breakdown.isSalesOperation && viewRecord.breakdown.billCode && (
                                            <div className="p-3 my-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-700">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xl">💰</span>
                                                        <div>
                                                            <div className="text-xs text-gray-500 uppercase tracking-wider">Sales Bill</div>
                                                            <div className="font-bold text-orange-600">{viewRecord.breakdown.billCode}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-gray-500">Amount</div>
                                                        <div className="font-bold text-lg text-orange-600">
                                                            Rs {viewRecord.breakdown.billAmount?.toLocaleString() || 0}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Customer Details Section */}
                                {viewRecord.CUSTOMER_NAME && (
                                    <div className="p-3 my-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xl">👤</span>
                                            <span className="font-semibold text-blue-700 dark:text-blue-400">Customer Details</span>
                                        </div>
                                        <div className="text-sm">
                                            <div className="text-xs text-gray-500 uppercase">Customer Name</div>
                                            <div className="font-medium text-gray-800 dark:text-gray-200">{viewRecord.CUSTOMER_NAME}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Lorry Details Section - For ops 3, 4, 7, 8 */}
                                {viewRecord.breakdown?.lorryName && (
                                    <div className="p-3 my-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xl">🚛</span>
                                            <span className="font-semibold text-purple-700 dark:text-purple-400">Lorry Details</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-sm">
                                            <div>
                                                <div className="text-xs text-gray-500 uppercase">Lorry</div>
                                                <div className="font-medium">{viewRecord.breakdown.lorryName}</div>
                                            </div>
                                            {viewRecord.breakdown.driverName && (
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase">Driver</div>
                                                    <div className="font-medium">{viewRecord.breakdown.driverName}</div>
                                                </div>
                                            )}
                                            {viewRecord.breakdown.destination && (
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase">Destination</div>
                                                    <div className="font-medium">{viewRecord.breakdown.destination}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Wastage/Surplus - Show for FULL clears (ops 1, 3, 6, 8) and Op 9 full conversions */}
                                {([1, 3, 6, 8].includes(viewRecord.OP_TYPE) || (viewRecord.OP_TYPE === 9 && viewRecord.CLEARANCE_TYPE === 'FULL')) && (() => {
                                    const source = viewRecord.breakdown.source || {};
                                    const prevStock = source.previousStock || 0;
                                    const soldQty = source.soldQty || 0;
                                    const totalOutput = viewRecord.breakdown.totalDestQty || 0;
                                    let wastage = viewRecord.breakdown.wastage || 0;
                                    let surplus = viewRecord.breakdown.surplus || 0;
                                    const isSalesOp = viewRecord.breakdown.isSalesOperation;

                                    // Derive status if zero (Ensure consistency for negative stock clearance)
                                    if (!isSalesOp && wastage === 0 && surplus === 0) {
                                        const diff = totalOutput - prevStock;
                                        if (diff > 0) surplus = diff;
                                        else if (diff < 0) wastage = Math.abs(diff);
                                    }

                                    const isWastage = wastage > 0;
                                    const isSurplus = surplus > 0;
                                    const amount = isWastage ? wastage : surplus;
                                    const baseQty = Math.abs(prevStock);
                                    const percentage = baseQty > 0 ? ((amount / baseQty) * 100).toFixed(1) : 0;

                                    // Show the card for these types regardless of whether amount/output exists
                                    // (Ensures "No Loss" card visibility for standard clears)

                                    return (
                                        <div className={`p-3 rounded-lg ${isWastage ? 'bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800' : isSurplus ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800' : 'bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800'}`}>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl">{isWastage ? '⚠️' : isSurplus ? '✨' : '✅'}</span>
                                                    <span className="font-medium">
                                                        {isWastage ? 'Wastage (Leakage)' : isSurplus ? 'Surplus' : 'No Loss'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`font-bold text-lg ${isWastage ? 'text-orange-600' : isSurplus ? 'text-blue-600' : 'text-green-600'}`}>
                                                        {amount.toFixed(1)} Kg
                                                    </div>
                                                    {amount > 0 && (
                                                        <div className={`text-sm ${isWastage ? 'text-orange-500' : 'text-blue-500'}`}>
                                                            ({percentage}%)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200 dark:border-white/10">
                                                {isSalesOp
                                                    ? isSurplus
                                                        ? `(Sold ${soldQty.toFixed(1)} + Converted ${totalOutput.toFixed(1)}) - Stock ${prevStock.toFixed(1)} = Surplus ${amount.toFixed(1)} Kg`
                                                        : `Stock ${prevStock.toFixed(1)} - (Sold ${soldQty.toFixed(1)} + Converted ${totalOutput.toFixed(1)}) = Wastage ${amount.toFixed(1)} Kg`
                                                    : prevStock >= 0
                                                        ? `${prevStock.toFixed(1)} Kg cleared → ${totalOutput.toFixed(1)} Kg output = ${isWastage ? '' : '+'}${(totalOutput - prevStock).toFixed(1)} Kg`
                                                        : `${prevStock.toFixed(1)} Kg → 0 Kg (+${Math.abs(prevStock).toFixed(1)}) + ${totalOutput.toFixed(1)} Kg output = +${(Math.abs(prevStock) + totalOutput).toFixed(1)} Kg surplus`
                                                }
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Regular Transaction Details */}
                        {viewRecord.SOURCE_TYPE !== 'stock_operation' && (
                            <Descriptions bordered size="small" column={1} className="mt-2" labelStyle={{ width: '150px', fontWeight: 500 }}>
                                <Descriptions.Item label="Transaction Code">
                                    <span className="font-mono text-gray-600">{viewRecord.CODE}</span>
                                </Descriptions.Item>
                                <Descriptions.Item label="Item">
                                    <span className="font-medium">{viewRecord.ITEM_NAME}</span>
                                    <div className="text-xs text-gray-400">{viewRecord.ITEM_CODE}</div>
                                </Descriptions.Item>
                                <Descriptions.Item label="Adjustment">
                                    <span className={`font-bold text-lg ${['AdjOut', 'StockClear'].includes(viewRecord.DISPLAY_TYPE) ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {['AdjOut', 'StockClear'].includes(viewRecord.DISPLAY_TYPE) ? '-' : '+'}{Number(viewRecord.ITEM_QTY).toFixed(1)} Kg
                                    </span>
                                </Descriptions.Item>
                                <Descriptions.Item label="Reason / Notes">
                                    <span className="whitespace-pre-wrap">{viewRecord.COMMENTS || '-'}</span>
                                </Descriptions.Item>
                                <Descriptions.Item label="Action By">
                                    {viewRecord.CREATED_BY_NAME || `User ${viewRecord.CREATED_BY || '-'}`}
                                </Descriptions.Item>
                            </Descriptions>
                        )}

                        {/* Stock Operation Basic Info */}
                        {viewRecord.SOURCE_TYPE === 'stock_operation' && (
                            <Descriptions bordered size="small" column={1} labelStyle={{ width: '150px', fontWeight: 500 }}>
                                <Descriptions.Item label="Operation Code">
                                    <span className="font-mono text-gray-600">{viewRecord.CODE}</span>
                                </Descriptions.Item>
                                {viewRecord.COMMENTS && (
                                    <Descriptions.Item label="Notes">
                                        <span className="whitespace-pre-wrap">{viewRecord.COMMENTS}</span>
                                    </Descriptions.Item>
                                )}
                                <Descriptions.Item label="Action By">
                                    {viewRecord.CREATED_BY_NAME || `User ${viewRecord.CREATED_BY || '-'}`}
                                </Descriptions.Item>
                            </Descriptions>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
