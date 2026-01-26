import React, { useState } from 'react';
import { Button, Badge, theme } from 'antd';
import { FilterOutlined, ClearOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

export default function CollapsibleReportFilters({ title = "Filter Report", activeFilterCount = 0, onClear, children, defaultCollapsed = true }) {
    const { token } = theme.useToken();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

    return (
        <div className="glass-card rounded-2xl mb-4 animate-fade-in border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden bg-white/50 dark:bg-white/5">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${!isCollapsed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400'}`}>
                        <FilterOutlined />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                            {title}
                            {activeFilterCount > 0 && <Badge count={activeFilterCount} color={token.colorPrimary} />}
                        </h3>
                        {isCollapsed && activeFilterCount > 0 && (
                            <p className="text-xs text-gray-500 m-0">Filters active: {activeFilterCount}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && onClear && (
                        <Button
                            type="text"
                            size="small"
                            icon={<ClearOutlined />}
                            className="text-gray-400 hover:text-red-500"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClear();
                            }}
                        >
                            Clear
                        </Button>
                    )}
                    {isCollapsed ? <DownOutlined className="text-gray-400" /> : <UpOutlined className="text-gray-400" />}
                </div>
            </div>

            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}>
                <div className="p-4 pt-0 border-t border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-black/20">
                    <div className="mt-4">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
