// Centralized Tree-Aware Filtering Engine
function getFilteredTreeRecords(userId, queryParams, db) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM records WHERE user_id = ? AND is_deleted = 0`, [userId], (err, rows) => {
            if (err) return reject(err);

            const { q, status, statsType, statsValue } = queryParams;
            const searchQuery = q ? q.toLowerCase() : null;
            const statusFilter = status && status !== 'all' ? status : null;

            // 1. Calculate individual costs
            const processedRecords = rows.map(record => {
                const purchaseDate = new Date(record.purchase_date);
                purchaseDate.setHours(0, 0, 0, 0);

                let endDate = new Date();
                const recordStatus = record.status || 'active';

                if (recordStatus !== 'active' && record.end_date) {
                    endDate = new Date(record.end_date);
                }
                endDate.setHours(0, 0, 0, 0);

                const timeDiff = Math.max(0, endDate.getTime() - purchaseDate.getTime());
                let daysUsed = Math.floor(timeDiff / (1000 * 3600 * 24));
                const actualDaysForCalc = daysUsed + 1;

                let finalCost = record.price;
                if (recordStatus === 'sold') {
                    finalCost = Math.max(0, record.price - (record.resale_price || 0));
                }

                let currentValue = record.price;
                if (recordStatus === 'sold') {
                    currentValue = record.resale_price || 0;
                } else if (recordStatus === 'broken') {
                    currentValue = 0;
                } else {
                    const depMethod = record.depreciation_method || 'straight_line';
                    const lifespan = record.expected_lifespan || 1095;
                    const salvage = record.expected_salvage || 0;

                    if (depMethod === 'straight_line') {
                        const dailyDep = (record.price - salvage) / lifespan;
                        currentValue = Math.max(salvage, record.price - (dailyDep * actualDaysForCalc));
                    } else if (depMethod === 'double_declining') {
                        const dailyRate = 2 / lifespan;
                        currentValue = record.price * Math.pow(1 - dailyRate, actualDaysForCalc);
                        currentValue = Math.max(salvage, currentValue);
                    }
                }

                return {
                    ...record,
                    _dailyCost: finalCost / actualDaysForCalc,
                    _days: actualDaysForCalc,
                    _finalCost: finalCost,
                    _currentValue: currentValue
                };
            });

            // 2. Build tree and aggregate
            const topLevelMap = {};
            const childrenMap = {};

            processedRecords.forEach(r => {
                if (r.parent_id) {
                    if (!childrenMap[r.parent_id]) childrenMap[r.parent_id] = [];
                    childrenMap[r.parent_id].push(r);
                } else {
                    r._aggDailyCost = r._dailyCost;
                    r._aggFinalCost = r._finalCost;
                    r._aggPrice = r.price;
                    r._aggCurrentValue = r._currentValue;
                    r._aggDays = r._days;
                    topLevelMap[r.id] = r;
                }
            });

            // Handle orphans (children whose parent is deleted)
            processedRecords.forEach(r => {
                if (r.parent_id && !topLevelMap[r.parent_id]) {
                    r._aggDailyCost = r._dailyCost;
                    r._aggFinalCost = r._finalCost;
                    r._aggPrice = r.price;
                    r._aggCurrentValue = r._currentValue;
                    r._aggDays = r._days;
                    topLevelMap[r.id] = r; // Promote to top-level
                }
            });

            // Aggregate children into parents
            Object.values(topLevelMap).forEach(parent => {
                const children = childrenMap[parent.id] || [];
                children.forEach(child => {
                    parent._aggDailyCost += child._dailyCost;
                    parent._aggFinalCost += child._finalCost;
                    parent._aggPrice += child.price;
                    parent._aggCurrentValue += child._currentValue;
                    if (child._days > parent._aggDays) parent._aggDays = child._days;
                });
            });

            // 3. Filter (Tree-Aware: keep parent if it OR ANY child matches)
            const matchesStatsFilter = (member, parent) => {
                if (!statsType || !statsValue) return true;

                if (statsType === 'status') {
                    return (member.status || 'active') === statsValue;
                }

                if (statsType === 'tag') {
                    const tags = (member.tags || '')
                        .split(/[,，\s]+/)
                        .map(t => t.trim().replace(/^#/, '').toLowerCase())
                        .filter(Boolean);
                    return tags.includes(String(statsValue).toLowerCase().replace(/^#/, ''));
                }

                if (statsType === 'group') {
                    return String(parent.id) === String(statsValue) || String(member.parent_id || '') === String(statsValue);
                }

                if (statsType === 'month') {
                    return typeof member.purchase_date === 'string' && member.purchase_date.startsWith(statsValue);
                }

                return true;
            };

            let matchedTopLevelIds = new Set();
            Object.values(topLevelMap).forEach(parent => {
                const family = [parent, ...(childrenMap[parent.id] || [])];
                let matches = false;
                for (const member of family) {
                    let matchSearch = !searchQuery || member.item_name.toLowerCase().includes(searchQuery) || (member.tags && member.tags.toLowerCase().includes(searchQuery));
                    let matchStatus = !statusFilter || member.status === statusFilter;
                    let matchStats = matchesStatsFilter(member, parent);
                    if (matchSearch && matchStatus && matchStats) {
                        matches = true;
                        break;
                    }
                }
                if (matches) matchedTopLevelIds.add(parent.id);
            });

            const filteredTopLevel = Object.values(topLevelMap).filter(p => matchedTopLevelIds.has(p.id));

            // Generate all matching flat records for charts/stats
            const allMatchedRecords = [];
            filteredTopLevel.forEach(parent => {
                allMatchedRecords.push(parent);
                if (childrenMap[parent.id]) {
                    allMatchedRecords.push(...childrenMap[parent.id]);
                }
            });

            resolve({ filteredTopLevel, childrenMap, allMatchedRecords });
        });
    });
}

module.exports = {
    getFilteredTreeRecords
};
