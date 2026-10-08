// Labels for the Simple screens: Sinhala + English.
// Change wording here only (one place). Language is chosen in Settings: 'both' | 'si' | 'en'.
import React, { useEffect, useState } from 'react';

export const LABELS = {
    home: { si: 'අද', en: 'Today' },
    newBill: { si: 'නව බිල', en: 'New Bill' },
    blankBills: { si: 'හිස් බිල් (රු. 0)', en: 'Blank Bills (Rs 0)' },
    bills: { si: 'බිල්පත්', en: 'Bills' },
    makeDispatch: { si: 'ලොරිය යවන්න', en: 'Send Lorry' },
    lorries: { si: 'ලොරි ගමන්', en: 'Lorry Trips' },
    settleLorry: { si: 'ලොරියේ ගණන් බලන්න', en: 'Settle Lorry' },
    stockIn: { si: 'වී ගැනීම', en: 'Stock In' },
    expenses: { si: 'වියදම්', en: 'Expenses' },
    quickPos: { si: 'කවුන්ටර් විකිණීම', en: 'Counter Sale' },
    priceCal: { si: 'මිල ගණනය', en: 'Price Calculator' },
    labels: { si: 'මලු ලේබල්', en: 'Bag Labels' },
    returns: { si: 'ආපසු ලැබීම්', en: 'Returns' },
    items: { si: 'භාණ්ඩ', en: 'Items' },
    resources: { si: 'පාරිභෝගිකයින් සහ කාර්ය මණ්ඩලය', en: 'Customers & Staff' },
    settings: { si: 'සැකසුම්', en: 'Settings' },
    logout: { si: 'පිටවන්න', en: 'Log out' },

    daily: { si: 'දෛනික වැඩ', en: 'Daily work' },
    tools: { si: 'මෙවලම්', en: 'Tools' },
    records: { si: 'වාර්තා', en: 'Records' },
    setup: { si: 'සැකසීම', en: 'Setup' },

    customer: { si: 'පාරිභෝගිකයා', en: 'Customer' },
    vehicle: { si: 'වාහනය', en: 'Vehicle' },
    driver: { si: 'රියදුරු', en: 'Driver' },
    staff: { si: 'නිලධාරී', en: 'Officer' },
    date: { si: 'දිනය', en: 'Date' },
    today: { si: 'අද', en: 'Today' },
    tomorrow: { si: 'හෙට', en: 'Tomorrow' },
    variety: { si: 'සහල් වර්ගය', en: 'Rice variety' },
    bags: { si: 'මලු', en: 'bags' },
    total: { si: 'එකතුව', en: 'Total' },
    pricePerBag: { si: 'මල්ලක මිල', en: 'Price / bag' },
    changePrice: { si: 'මිල වෙනස් කරන්න', en: 'Change price' },
    moreDetails: { si: 'තවත් විස්තර', en: 'More details' },
    walkIn: { si: 'සාමාන්‍ය පාරිභෝගිකයා', en: 'Walk-in customer' },

    saveAndPrint: { si: 'සුරකින්න සහ මුද්‍රණය', en: 'Save & Print' },
    saveOnly: { si: 'සුරකින්න පමණි', en: 'Save only' },
    save: { si: 'සුරකින්න', en: 'Save' },
    print: { si: 'මුද්‍රණය', en: 'Print' },
    printAgain: { si: 'නැවත මුද්‍රණය', en: 'Print again' },
    printing: { si: 'මුද්‍රණය වෙමින්...', en: 'Printing...' },
    printed: { si: 'මුද්‍රණයට යැව්වා', en: 'Sent to printer' },
    printFailed: { si: 'මුද්‍රණය අසාර්ථකයි', en: 'Printing failed' },
    saved: { si: 'සුරකින ලදී', en: 'Saved' },
    next: { si: 'ඊළඟ', en: 'Next' },
    back: { si: 'ආපසු', en: 'Back' },
    confirm: { si: 'තහවුරු කරන්න', en: 'Confirm' },
    cancel: { si: 'අවලංගු කරන්න', en: 'Cancel' },
    done: { si: 'හරි', en: 'Done' },
    clear: { si: 'මකන්න', en: 'Clear' },
    another: { si: 'තවත් එකක්', en: 'Another one' },
    open: { si: 'විවෘත කරන්න', en: 'Open' },

    pending: { si: 'යැවීමට ඇත', en: 'Not sent' },
    onLorry: { si: 'ලොරියේ', en: 'On lorry' },
    settled: { si: 'පියවා ඇත', en: 'Settled' },
    blank: { si: 'හිස් බිල', en: 'Blank bill' },
    notSynced: { si: 'මෙම පරිගණකයේ සුරකින ලදී', en: 'Saved on this PC' },
    synced: { si: 'සමමුහුර්ත විය', en: 'Synced' },
    syncProblem: { si: 'සමමුහුර්ත ගැටලුවක්', en: 'Sync problem' },

    cash: { si: 'මුදල්', en: 'Cash' },
    cheque: { si: 'චෙක්පත', en: 'Cheque' },
    chequeNo: { si: 'චෙක් අංකය', en: 'Cheque no' },
    bank: { si: 'බැංකුව', en: 'Bank' },
    dueDate: { si: 'නියමිත දිනය', en: 'Due date' },
    amount: { si: 'මුදල', en: 'Amount' },
    remark: { si: 'සටහන', en: 'Note' },

    asPrinted: { si: 'බිලේ තියෙන විදියටම දුන්නා', en: 'Delivered as printed' },
    changeBags: { si: 'මලු ගණන වෙනස්', en: 'Change bags' },
    addHandwritten: { si: 'අතින් ලියූ බිලක් එක් කරන්න', en: 'Add handwritten bill' },
    review: { si: 'පරීක්ෂා කරන්න', en: 'Review' },
    cashToCollect: { si: 'ලැබෙන්න ඕනෑ සල්ලි', en: 'Cash to collect' },
    chequesToCollect: { si: 'ලැබිය යුතු චෙක්පත්', en: 'Cheques' },
    howMany: { si: 'බිල් කීයද?', en: 'How many bills?' },
    chooseBills: { si: 'බිල් තෝරන්න', en: 'Choose bills' },
    noBills: { si: 'බිල් නැත', en: 'No bills' },
    needsAttention: { si: 'අවධානය අවශ්‍යයි', en: 'need attention' },
    offlineSafe: { si: 'අන්තර්ජාලය නැත - ඔබේ වැඩ මෙම පරිගණකයේ ආරක්ෂිතයි', en: 'Offline - your work is safe on this PC' },
    online: { si: 'සම්බන්ධයි', en: 'Online' },
    sync: { si: 'සමමුහුර්ත කරන්න', en: 'Sync' },
    whatNext: { si: 'ඊළඟට කුමක්ද?', en: 'What next?' },
    search: { si: 'සොයන්න', en: 'Search' },
    all: { si: 'සියල්ල', en: 'All' },
    discardQ: { si: 'ඇතුළත් කළ දේ මකා දමන්නද?', en: 'Discard what you entered?' },
    discard: { si: 'මකා දමන්න', en: 'Discard' },
    keepEditing: { si: 'දිගටම කරන්න', en: 'Keep editing' },
    undo: { si: 'ආපසු හරවන්න', en: 'Undo' }
};

// English everywhere. A small Sinhala helper is shown ONLY under the few words that are hard in English
// (everyday Sinhala, not formal words). Settings: 'mixed' (default) or 'en' (English only).
const SINHALA_HELP = new Set(['settleLorry', 'makeDispatch', 'stockIn', 'expenses', 'blank', 'blankBills', 'asPrinted', 'changeBags', 'cashToCollect', 'tomorrow', 'cheque']);

const LANG_KEY = 'simple_lang_v2';
export const getLang = () => {
    try { return localStorage.getItem(LANG_KEY) || 'mixed'; } catch (e) { return 'mixed'; }
};
export const setLang = (lang) => {
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    window.dispatchEvent(new Event('simple-lang'));
};

export function useLang() {
    const [lang, setL] = useState(getLang());
    useEffect(() => {
        const h = () => setL(getLang());
        window.addEventListener('simple-lang', h);
        return () => window.removeEventListener('simple-lang', h);
    }, []);
    return lang;
}

// Plain text (placeholders, messages): English
export const tx = (key) => (LABELS[key] ? LABELS[key].en : key);

// Label: English; plus a small Sinhala helper only for the hard words
export function T({ k, inline = false, className = '' }) {
    const lang = useLang();
    const l = LABELS[k] || { si: '', en: k };
    const help = lang !== 'en' && SINHALA_HELP.has(k) && l.si;
    if (!help) return <span className={className}>{l.en}</span>;
    if (inline) return <span className={className}>{l.en} <span className="font-semibold opacity-75">({l.si})</span></span>;
    return (
        <span className={`inline-flex flex-col leading-tight ${className}`}>
            <span>{l.en}</span>
            <span className="text-[0.75em] font-semibold opacity-80">{l.si}</span>
        </span>
    );
}
