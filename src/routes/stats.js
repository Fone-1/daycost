const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const { getFilteredTreeRecords } = require('../utils/treeHelper');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
    try {
        const { filteredTopLevel, allMatchedRecords } = await getFilteredTreeRecords(req.user.id, req.query, db);

        let total_daily_cost = 0;
        let total_price = 0;

        filteredTopLevel.forEach(p => {
            total_daily_cost += p._aggDailyCost;
            total_price += p._aggPrice;
        });

        const statusCounts = { active: 0, broken: 0, sold: 0 };
        const tagStats = {};

        allMatchedRecords.forEach(row => {
            const status = row.status || 'active';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            if (row.tags) {
                const tagsArr = row.tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t);
                tagsArr.forEach(t => {
                    const cleanTag = t.startsWith('#') ? t.substring(1) : t;
                    if (!cleanTag) return;
                    if (!tagStats[cleanTag]) {
                        tagStats[cleanTag] = { total_price: 0, daily_cost: 0 };
                    }
                    tagStats[cleanTag].total_price += row.price;
                    tagStats[cleanTag].daily_cost += row._dailyCost;
                });
            }
        });

        res.json({
            total_daily_cost,
            total_price,
            total_count: allMatchedRecords.length,
            status_counts: statusCounts,
            tag_stats: tagStats
        });
    } catch (err) {
        console.error("API Stats Error:", err);
        res.status(500).json({ error: '统计计算失败' });
    }
});

router.get('/trend', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const range = req.query.range || '30d';

        const { allMatchedRecords } = await getFilteredTreeRecords(userId, req.query, db);

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const points = [];
        const labels = [];
        let count = 0;
        let stepDays = 1;

        if (range === '7d') {
            count = 7;
            stepDays = 1;
        } else if (range === '30d') {
            count = 10;
            stepDays = 3;
        } else if (range === '1y') {
            count = 12;
            stepDays = 30;
        } else {
            count = 10;
            stepDays = 3;
        }

        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getTime());
            d.setDate(d.getDate() - i * stepDays);

            const dateStr = (range === '1y') ?
                `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}` :
                `${(d.getMonth() + 1)}/${d.getDate()}`;
            labels.push(dateStr);

            let daySum = 0;
            allMatchedRecords.forEach(record => {
                daySum += simulateCostAtDate(record, d);
            });
            points.push(daySum.toFixed(2));
        }

        res.json({ labels, data: points });
    } catch (err) {
        console.error("API Trend Error:", err);
        res.status(500).json({ error: '获取趋势数据失败' });
    }

    function simulateCostAtDate(record, targetDate) {
        const purchaseDate = new Date(record.purchase_date);
        purchaseDate.setHours(0, 0, 0, 0);

        if (targetDate < purchaseDate) return 0;

        let endDate = new Date(targetDate.getTime());
        const status = record.status || 'active';
        let finalCost = record.price;

        if (status !== 'active' && record.end_date) {
            const itemEndDate = new Date(record.end_date);
            itemEndDate.setHours(0, 0, 0, 0);

            if (targetDate >= itemEndDate) {
                endDate = itemEndDate;
                if (status === 'sold') {
                    finalCost = Math.max(0, record.price - (record.resale_price || 0));
                }
            }
        }

        const timeDiff = Math.max(0, endDate.getTime() - purchaseDate.getTime());
        const daysUsed = Math.floor(timeDiff / (1000 * 3600 * 24));
        const actualDaysForCalc = daysUsed + 1;

        return finalCost / actualDaysForCalc;
    }
});

router.get('/pie', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const parentId = req.query.parent_id || null;

        const { filteredTopLevel, childrenMap } = await getFilteredTreeRecords(userId, req.query, db);

        let dataToShow = [];

        if (!parentId) {
            dataToShow = filteredTopLevel;
        } else {
            const pid = parseInt(parentId);
            const children = childrenMap[pid] || [];
            dataToShow = children.map(c => ({ ...c, _aggDailyCost: c._dailyCost }));
        }

        const sortedForChart = dataToShow.sort((a, b) => b._aggDailyCost - a._aggDailyCost);

        const labels = [];
        const data = [];
        const originalIds = [];
        const hasChildrenArray = [];
        let otherCost = 0;

        sortedForChart.forEach((item, index) => {
            if (item._aggDailyCost <= 0) return;

            if (index < 5) {
                labels.push(item.item_name);
                data.push(item._aggDailyCost.toFixed(2));
                originalIds.push(item.id);
                // Check if it has children in childrenMap
                hasChildrenArray.push(!!childrenMap[item.id] && childrenMap[item.id].length > 0);
            } else {
                otherCost += item._aggDailyCost;
            }
        });

        if (otherCost > 0) {
            labels.push('其他项并集');
            data.push(otherCost.toFixed(2));
            originalIds.push(null);
            hasChildrenArray.push(false);
        }

        let parentName = null;
        if (parentId) {
            db.get(`SELECT item_name FROM records WHERE id = ?`, [parentId], (err, row) => {
                if (row) parentName = row.item_name;
                res.json({ labels, data, originalIds, hasChildrenArray, parentName });
            });
        } else {
            res.json({ labels, data, originalIds, hasChildrenArray, parentName: null });
        }
    } catch (err) {
        console.error("API Pie Error:", err);
        res.status(500).json({ error: '获取图表数据失败' });
    }
});

module.exports = router;
