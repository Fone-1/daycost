const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const { getFilteredTreeRecords } = require('../utils/treeHelper');

const router = express.Router();

// Get User Records (Active) with Pagination and Sorting
router.get('/', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const sortBy = req.query.sortBy || 'created_at';
        const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase();

        const { filteredTopLevel, childrenMap } = await getFilteredTreeRecords(req.user.id, req.query, db);

        // 4. Sort Top-Level
        filteredTopLevel.sort((a, b) => {
            let valA, valB;
            if (sortBy === 'price') { valA = a._aggPrice; valB = b._aggPrice; }
            else if (sortBy === 'dailyCost') { valA = a._aggDailyCost; valB = b._aggDailyCost; }
            else if (sortBy === 'days') { valA = a._aggDays; valB = b._aggDays; }
            else if (sortBy === 'item_name') { valA = a.item_name; valB = b.item_name; }
            else { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }

            if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
            if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
            return 0;
        });

        // 5. Paginate Top-Level
        const paginatedTopLevel = filteredTopLevel.slice(offset, offset + limit);

        // 6. Assemble Final Data (Parents + Their Children)
        const finalData = [];
        paginatedTopLevel.forEach(parent => {
            finalData.push(parent);
            const children = childrenMap[parent.id] || [];

            // Sort children too
            children.sort((a, b) => {
                let valA, valB;
                if (sortBy === 'price') { valA = a.price; valB = b.price; }
                else if (sortBy === 'dailyCost') { valA = a._dailyCost; valB = b._dailyCost; }
                else if (sortBy === 'days') { valA = a._days; valB = b._days; }
                else if (sortBy === 'item_name') { valA = a.item_name; valB = b.item_name; }
                else { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
                if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
                if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
                return 0;
            });

            finalData.push(...children);
        });

        res.json({
            total: filteredTopLevel.length, // Total is now number of top-level families!
            page,
            limit,
            hasMore: offset + paginatedTopLevel.length < filteredTopLevel.length,
            data: finalData
        });
    } catch (err) {
        console.error("API Records Error:", err);
        res.status(500).json({ error: '查询失败' });
    }
});

// Delete Record (Soft Delete)
router.delete('/:id', authenticateToken, (req, res) => {
    const recordId = req.params.id;

    db.get(`SELECT COUNT(*) as count FROM records WHERE parent_id = ? AND is_deleted = 0`, [recordId], (err, row) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (row.count > 0) return res.status(400).json({ error: `无法删除：该物品下还包含 ${row.count} 个子零件，请先删除子零件或将它们解绑！` });

        db.run(`UPDATE records SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [recordId, req.user.id], function (err) {
            if (err) return res.status(500).json({ error: '移入废纸篓失败' });
            if (this.changes === 0) return res.status(404).json({ error: '记录不存在或无权限操作' });
            res.json({ message: '记录已移动到废纸篓，可在30天内找回' });
        });
    });
});

// Get Trash Records (Deleted)
router.get('/trash', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM records WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询废纸篓失败' });
        res.json(rows);
    });
});

// Restore Record
router.post('/restore/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    console.log(`Attempting to restore record ${id} for user ${req.user.id}`);
    db.run(`UPDATE records SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?`, [id, req.user.id], function (err) {
        if (err) {
            console.error('Restore error:', err);
            return res.status(500).json({ error: '服务器内部错误：还原失败' });
        }
        if (this.changes === 0) {
            console.warn(`Restore failed: No changes for record ${id}`);
            return res.status(404).json({ error: '无法还原：该条记录可能已被永久清理或不存在' });
        }
        res.json({ message: '记录已从废纸篓恢复' });
    });
});

// Permanent Purge Record
router.delete('/purge/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM records WHERE id = ? AND user_id = ? AND is_deleted = 1`, [id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: '销毁失败' });
        if (this.changes === 0) return res.status(404).json({ error: '记录不存在' });
        res.json({ message: '记录已永久销毁' });
    });
});

// Add Record
router.post('/', authenticateToken, (req, res) => {
    const { item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage } = req.body;
    const normalizedStatus = status || 'active';
    const normalizedPrice = Number(price);
    const normalizedResale = Number(resale_price || 0);
    const normalizedLifespan = Number(expected_lifespan || 1095);
    const normalizedSalvage = Number(expected_salvage || 0);

    if (!item_name || price == null || !purchase_date) {
        return res.status(400).json({ error: '请填写物品名称、价格和购买日期。' });
    }
    if (!['active', 'broken', 'sold'].includes(normalizedStatus)) {
        return res.status(400).json({ error: '无效的状态。' });
    }
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
        return res.status(400).json({ error: '价格必须为非负数。' });
    }
    if (!Number.isFinite(normalizedResale) || normalizedResale < 0 || normalizedResale > normalizedPrice) {
        return res.status(400).json({ error: '二手价格必须在 0 到物品价格之间。' });
    }
    if (!Number.isFinite(normalizedLifespan) || normalizedLifespan < 1) {
        return res.status(400).json({ error: '预期寿命至少为 1 天。' });
    }
    if (!Number.isFinite(normalizedSalvage) || normalizedSalvage < 0 || normalizedSalvage > normalizedPrice) {
        return res.status(400).json({ error: '预期残值必须在 0 到物品价格之间。' });
    }
    if ((normalizedStatus === 'broken' || normalizedStatus === 'sold') && !end_date) {
        return res.status(400).json({ error: '损坏或已售记录需要填写结束日期。' });
    }
    if (end_date && new Date(end_date) < new Date(purchase_date)) {
        return res.status(400).json({ error: '结束日期不能早于购买日期。' });
    }

    const executeInsert = () => {
        db.run(
            `INSERT INTO records (user_id, item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, item_name, normalizedPrice, purchase_date, normalizedStatus, end_date || null, normalizedResale, parent_id || null, tags || '', depreciation_method || 'straight_line', normalizedLifespan, normalizedSalvage],
            function (err) {
                if (err) return res.status(500).json({ error: '添加记录失败。' });
                res.json({ message: '记录已添加。', id: this.lastID });
            }
        );
    };

    if (!parent_id) return executeInsert();

    db.get(`SELECT id, parent_id FROM records WHERE id = ? AND user_id = ? AND is_deleted = 0`, [parent_id, req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: '验证父记录失败。' });
        if (!row) return res.status(400).json({ error: '父记录不存在。' });
        if (row.parent_id) return res.status(400).json({ error: '仅支持一级嵌套。' });
        executeInsert();
    });
});

// Update Record (Full Edit)
router.put('/:id', authenticateToken, (req, res) => {
    const recordId = Number(req.params.id);
    const { item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage, cascadeAction } = req.body;
    const normalizedPrice = Number(price);
    const normalizedResale = Number(resale_price || 0);
    const normalizedLifespan = Number(expected_lifespan || 1095);
    const normalizedSalvage = Number(expected_salvage || 0);
    const normalizedParentId = parent_id ? Number(parent_id) : null;

    if (!item_name || price == null || !purchase_date) {
        return res.status(400).json({ error: '请填写物品名称、价格和购买日期。' });
    }
    if (!['active', 'broken', 'sold'].includes(status)) {
        return res.status(400).json({ error: '无效的状态。' });
    }
    if (!Number.isFinite(recordId) || recordId < 1) {
        return res.status(400).json({ error: '无效的记录 ID。' });
    }
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
        return res.status(400).json({ error: '价格必须为非负数。' });
    }
    if (!Number.isFinite(normalizedResale) || normalizedResale < 0 || normalizedResale > normalizedPrice) {
        return res.status(400).json({ error: '二手价格必须在 0 到物品价格之间。' });
    }
    if (!Number.isFinite(normalizedLifespan) || normalizedLifespan < 1) {
        return res.status(400).json({ error: '预期寿命至少为 1 天。' });
    }
    if (!Number.isFinite(normalizedSalvage) || normalizedSalvage < 0 || normalizedSalvage > normalizedPrice) {
        return res.status(400).json({ error: '预期残值必须在 0 到物品价格之间。' });
    }
    if ((status === 'broken' || status === 'sold') && !end_date) {
        return res.status(400).json({ error: '损坏或已售记录需要填写结束日期。' });
    }
    if (end_date && new Date(end_date) < new Date(purchase_date)) {
        return res.status(400).json({ error: '结束日期不能早于购买日期。' });
    }
    if (normalizedParentId === recordId) {
        return res.status(400).json({ error: '记录不能作为自身的父级。' });
    }

    const executeUpdate = () => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION;');
            db.run(
                `UPDATE records SET item_name = ?, price = ?, purchase_date = ?, status = ?, end_date = ?, resale_price = ?, parent_id = ?, tags = ?, depreciation_method = ?, expected_lifespan = ?, expected_salvage = ? WHERE id = ? AND user_id = ?`,
                [item_name, normalizedPrice, purchase_date, status, end_date || null, normalizedResale, normalizedParentId, tags || '', depreciation_method || 'straight_line', normalizedLifespan, normalizedSalvage, recordId, req.user.id],
                function (err) {
                    if (err) {
                        db.run('ROLLBACK;');
                        return res.status(500).json({ error: '更新记录失败。' });
                    }
                    if (this.changes === 0) {
                        db.run('ROLLBACK;');
                        return res.status(404).json({ error: '记录不存在。' });
                    }

                    const finish = () => {
                        db.run('COMMIT;', (commitErr) => {
                            if (commitErr) {
                                db.run('ROLLBACK;');
                                return res.status(500).json({ error: '提交更新失败。' });
                            }
                            res.json({ message: '记录已更新。' });
                        });
                    };

                    if (cascadeAction === 'bundle') {
                        db.run(
                            `UPDATE records SET status = ?, end_date = ?, resale_price = 0 WHERE parent_id = ? AND user_id = ?`,
                            [status, end_date || null, recordId, req.user.id],
                            (cascadeErr) => {
                                if (cascadeErr) {
                                    db.run('ROLLBACK;');
                                    return res.status(500).json({ error: '更新子记录失败。' });
                                }
                                finish();
                            }
                        );
                    } else if (cascadeAction === 'orphan') {
                        db.run(
                            `UPDATE records SET parent_id = NULL WHERE parent_id = ? AND user_id = ?`,
                            [recordId, req.user.id],
                            (orphanErr) => {
                                if (orphanErr) {
                                    db.run('ROLLBACK;');
                                    return res.status(500).json({ error: '解除子记录关联失败。' });
                                }
                                finish();
                            }
                        );
                    } else {
                        finish();
                    }
                }
            );
        });
    };

    if (!normalizedParentId) return executeUpdate();

    db.get(`SELECT COUNT(*) as count FROM records WHERE parent_id = ? AND user_id = ? AND is_deleted = 0`, [recordId, req.user.id], (childErr, childRow) => {
        if (childErr) return res.status(500).json({ error: '验证子记录失败。' });
        if (childRow && childRow.count > 0) {
            return res.status(400).json({ error: '含有子记录的物品不能嵌套到其他物品下。' });
        }

        db.get(`SELECT id, parent_id FROM records WHERE id = ? AND user_id = ? AND is_deleted = 0`, [normalizedParentId, req.user.id], (parentErr, parentRow) => {
            if (parentErr) return res.status(500).json({ error: '验证父记录失败。' });
            if (!parentRow) return res.status(400).json({ error: '父记录不存在。' });
            if (parentRow.parent_id) return res.status(400).json({ error: '仅支持一级嵌套。' });
            executeUpdate();
        });
    });
});

// Import Records (Restore / Append)
router.post('/import', authenticateToken, (req, res) => {
    const { mode, records } = req.body;
    if (!['append', 'overwrite'].includes(mode)) {
        return res.status(400).json({ error: '无效的导入模式。' });
    }
    if (!Array.isArray(records)) {
        return res.status(400).json({ error: '无效的导入数据。' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');

        const rollback = (message) => {
            db.run('ROLLBACK;');
            return res.status(500).json({ error: message });
        };

        const startImport = () => {
            const oldToNewMap = {};
            const parents = records.filter(r => !r.parent_id);
            const children = records.filter(r => r.parent_id);

            const insertRecord = (r, newParentId, callback) => {
                const normalizedStatus = ['active', 'broken', 'sold'].includes(r.status) ? r.status : 'active';
                const normalizedPrice = Number(r.price || 0);
                const normalizedResale = Number(r.resale_price || 0);
                const normalizedLifespan = Number(r.expected_lifespan || 1095);
                const normalizedSalvage = Number(r.expected_salvage || 0);

                if (!r.purchase_date) return callback(new Error('记录缺少购买日期。'));
                if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) return callback(new Error('无效的价格。'));
                if (!Number.isFinite(normalizedResale) || normalizedResale < 0 || normalizedResale > normalizedPrice) return callback(new Error('无效的二手价格。'));
                if (!Number.isFinite(normalizedLifespan) || normalizedLifespan < 1) return callback(new Error('无效的预期寿命。'));
                if (!Number.isFinite(normalizedSalvage) || normalizedSalvage < 0 || normalizedSalvage > normalizedPrice) return callback(new Error('无效的残值。'));

                const sql = `
                    INSERT INTO records (user_id, item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(sql, [
                    req.user.id,
                    r.item_name || 'Untitled',
                    normalizedPrice,
                    r.purchase_date,
                    normalizedStatus,
                    r.end_date || null,
                    normalizedResale,
                    newParentId || null,
                    r.tags || '',
                    r.depreciation_method || 'straight_line',
                    normalizedLifespan,
                    normalizedSalvage
                ], function (err) {
                    if (err) return callback(err);
                    callback(null, this.lastID);
                });
            };

            const processParents = (index, done) => {
                if (index >= parents.length) return done();
                const parent = parents[index];
                insertRecord(parent, null, (err, newId) => {
                    if (err) return rollback('导入父记录失败。');
                    oldToNewMap[parent.id] = newId;
                    processParents(index + 1, done);
                });
            };

            const processChildren = (index, done) => {
                if (index >= children.length) return done();
                const child = children[index];
                const mappedParentId = oldToNewMap[child.parent_id] || null;
                insertRecord(child, mappedParentId, (err) => {
                    if (err) return rollback('导入子记录失败。');
                    processChildren(index + 1, done);
                });
            };

            processParents(0, () => {
                processChildren(0, () => {
                    db.run('COMMIT;', (err) => {
                        if (err) return rollback('提交导入失败。');
                        res.json({ message: '导入完成。' });
                    });
                });
            });
        };

        if (mode === 'overwrite') {
            db.run('DELETE FROM records WHERE user_id = ?', [req.user.id], (deleteErr) => {
                if (deleteErr) return rollback('清空现有记录失败。');
                startImport();
            });
        } else {
            startImport();
        }
    });
});

module.exports = router;
