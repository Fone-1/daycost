/**
 * Unit Tests for treeHelper.js — getFilteredTreeRecords()
 *
 * Tests the centralized tree-aware filtering engine that:
 *   1. Fetches user records from DB
 *   2. Builds tree hierarchy (parents + children)
 *   3. Aggregates daily cost from parent + all children
 *   4. Applies search/status/stats filters (tree-aware: keep parent if ANY child matches)
 *   5. Returns { filteredTopLevel, childrenMap, allMatchedRecords }
 */

const { getFilteredTreeRecords } = require('../src/utils/treeHelper');

// ─── Mock DB helper ──────────────────────────────────────────────────────────

/**
 * Create a mock db object that resolves db.all() with the given rows.
 * @param {Array} rows - Array of record objects
 * @returns {object} mock db
 */
function createMockDb(rows) {
  return {
    all: (sql, params, callback) => {
      callback(null, rows);
    }
  };
}

// ─── Sample record factory ───────────────────────────────────────────────────

function makeRecord(overrides = {}) {
  return {
    id: overrides.id || 1,
    user_id: overrides.user_id || 1,
    item_name: overrides.item_name || 'Test Item',
    price: overrides.price || 100,
    purchase_date: overrides.purchase_date || '2024-01-01',
    status: overrides.status || 'active',
    tags: overrides.tags || '',
    parent_id: overrides.parent_id || null,
    is_deleted: 0,
    // Computed fields from v_records_computed view
    _dailyCost: overrides._dailyCost || 1.5,
    _finalCost: overrides._finalCost || 100,
    _currentValue: overrides._currentValue || 80,
    _days: overrides._days || 67,
    ...overrides
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('treeHelper — getFilteredTreeRecords', () => {

  // ─── 1. Empty input ─────────────────────────────────────────────────────

  describe('empty input handling', () => {
    it('should return empty arrays when no records exist', async () => {
      const db = createMockDb([]);
      const result = await getFilteredTreeRecords(1, {}, db);
      expect(result.filteredTopLevel).toEqual([]);
      expect(result.childrenMap).toEqual({});
      expect(result.allMatchedRecords).toEqual([]);
    });
  });

  // ─── 2. Single record (no children) ────────────────────────────────────

  describe('single top-level record', () => {
    it('should return single record with aggregated cost equal to its own cost', async () => {
      const record = makeRecord({ id: 1, _dailyCost: 2.5, _finalCost: 500, price: 500, _currentValue: 400, _days: 200 });
      const db = createMockDb([record]);
      const result = await getFilteredTreeRecords(1, {}, db);

      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0]._aggDailyCost).toBe(2.5);
      expect(result.filteredTopLevel[0]._aggFinalCost).toBe(500);
      expect(result.filteredTopLevel[0]._aggPrice).toBe(500);
      expect(result.filteredTopLevel[0]._aggCurrentValue).toBe(400);
      expect(result.filteredTopLevel[0]._aggDays).toBe(200);
    });

    it('should handle price=0 record', async () => {
      const record = makeRecord({ id: 1, price: 0, _dailyCost: 0, _finalCost: 0, _currentValue: 0, _days: 10 });
      const db = createMockDb([record]);
      const result = await getFilteredTreeRecords(1, {}, db);

      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0]._aggPrice).toBe(0);
      expect(result.filteredTopLevel[0]._aggDailyCost).toBe(0);
    });

    it('should handle _days=0 record (edge case)', async () => {
      const record = makeRecord({ id: 1, _dailyCost: 0, _days: 0 });
      const db = createMockDb([record]);
      const result = await getFilteredTreeRecords(1, {}, db);

      expect(result.filteredTopLevel.length).toBe(1);
      // days=0 is a valid computed value, aggregation should work
      expect(result.filteredTopLevel[0]._aggDays).toBe(0);
    });
  });

  // ─── 3. Parent-child relationship ──────────────────────────────────────

  describe('parent-child aggregation', () => {
    it('should aggregate child costs into parent', async () => {
      const parent = makeRecord({ id: 10, _dailyCost: 3.0, _finalCost: 600, price: 600, _currentValue: 400, _days: 200 });
      const child1 = makeRecord({ id: 11, parent_id: 10, item_name: 'Accessory', _dailyCost: 1.0, _finalCost: 200, price: 200, _currentValue: 150, _days: 200 });
      const child2 = makeRecord({ id: 12, parent_id: 10, item_name: 'Addon', _dailyCost: 0.5, _finalCost: 100, price: 100, _currentValue: 80, _days: 200 });

      const db = createMockDb([parent, child1, child2]);
      const result = await getFilteredTreeRecords(1, {}, db);

      // Parent aggregation = parent + child1 + child2
      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0]._aggDailyCost).toBe(3.0 + 1.0 + 0.5); // 4.5
      expect(result.filteredTopLevel[0]._aggFinalCost).toBe(600 + 200 + 100);   // 900
      expect(result.filteredTopLevel[0]._aggPrice).toBe(600 + 200 + 100);       // 900
      expect(result.filteredTopLevel[0]._aggCurrentValue).toBe(400 + 150 + 80); // 630
      expect(result.filteredTopLevel[0]._aggDays).toBe(200); // max of all days

      // childrenMap should map parent id to children
      expect(result.childrenMap[10].length).toBe(2);
    });
  });

  // ─── 4. Multi-level nesting (3 layers) ─────────────────────────────────

  describe('orphan handling (children whose parent is deleted/missing)', () => {
    it('should promote orphaned children to top-level', async () => {
      const orphan = makeRecord({ id: 20, parent_id: 999, _dailyCost: 2.0, _finalCost: 300, price: 300, _currentValue: 200, _days: 150 });
      const db = createMockDb([orphan]);
      const result = await getFilteredTreeRecords(1, {}, db);

      // Orphan whose parent_id=999 doesn't exist → promoted to top-level
      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0]._aggDailyCost).toBe(2.0);
    });
  });

  // ─── 5. Status filtering ───────────────────────────────────────────────

  describe('status filter', () => {
    it('should filter by status=active', async () => {
      const activeParent = makeRecord({ id: 1, status: 'active', _dailyCost: 3.0 });
      const soldParent = makeRecord({ id: 2, status: 'sold', _dailyCost: 1.0 });
      const db = createMockDb([activeParent, soldParent]);

      const result = await getFilteredTreeRecords(1, { status: 'active' }, db);
      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0].id).toBe(1);
    });

    it('should show all records when status=all', async () => {
      const activeParent = makeRecord({ id: 1, status: 'active', _dailyCost: 3.0 });
      const soldParent = makeRecord({ id: 2, status: 'sold', _dailyCost: 1.0 });
      const db = createMockDb([activeParent, soldParent]);

      const result = await getFilteredTreeRecords(1, { status: 'all' }, db);
      expect(result.filteredTopLevel.length).toBe(2);
    });

    it('should show all records when status is not provided', async () => {
      const activeParent = makeRecord({ id: 1, status: 'active', _dailyCost: 3.0 });
      const soldParent = makeRecord({ id: 2, status: 'sold', _dailyCost: 1.0 });
      const db = createMockDb([activeParent, soldParent]);

      const result = await getFilteredTreeRecords(1, {}, db);
      expect(result.filteredTopLevel.length).toBe(2);
    });

    it('should keep parent if child matches the status filter', async () => {
      const parent = makeRecord({ id: 1, status: 'active', _dailyCost: 3.0 });
      const child = makeRecord({ id: 2, parent_id: 1, status: 'sold', _dailyCost: 1.0 });

      const db = createMockDb([parent, child]);
      const result = await getFilteredTreeRecords(1, { status: 'sold' }, db);

      // Parent kept because child matches 'sold'
      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0].id).toBe(1);
    });
  });

  // ─── 6. Search query ──────────────────────────────────────────────────

  describe('search query filter', () => {
    it('should filter by item_name search query', async () => {
      const item1 = makeRecord({ id: 1, item_name: 'MacBook Pro', _dailyCost: 5.0 });
      const item2 = makeRecord({ id: 2, item_name: 'iPhone', _dailyCost: 3.0 });
      const db = createMockDb([item1, item2]);

      const result = await getFilteredTreeRecords(1, { q: 'mac' }, db);
      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0].item_name).toBe('MacBook Pro');
    });

    it('should keep parent if child matches search', async () => {
      const parent = makeRecord({ id: 1, item_name: 'Computer Set', _dailyCost: 3.0 });
      const child = makeRecord({ id: 2, parent_id: 1, item_name: 'MacBook Pro', _dailyCost: 5.0 });

      const db = createMockDb([parent, child]);
      const result = await getFilteredTreeRecords(1, { q: 'mac' }, db);

      expect(result.filteredTopLevel.length).toBe(1);
    });
  });

  // ─── 7. Stats filter ───────────────────────────────────────────────────

  describe('statsType filter', () => {
    it('should filter by statsType=status', async () => {
      const activeItem = makeRecord({ id: 1, status: 'active', _dailyCost: 3.0 });
      const soldItem = makeRecord({ id: 2, status: 'sold', _dailyCost: 1.0 });
      const db = createMockDb([activeItem, soldItem]);

      const result = await getFilteredTreeRecords(1, { statsType: 'status', statsValue: 'active' }, db);
      expect(result.filteredTopLevel.length).toBe(1);
      expect(result.filteredTopLevel[0].id).toBe(1);
    });

    it('should filter by statsType=tag', async () => {
      const taggedItem = makeRecord({ id: 1, tags: '#electronics, #gadgets', _dailyCost: 3.0 });
      const otherItem = makeRecord({ id: 2, tags: '#furniture', _dailyCost: 1.0 });
      const db = createMockDb([taggedItem, otherItem]);

      const result = await getFilteredTreeRecords(1, { statsType: 'tag', statsValue: 'electronics' }, db);
      expect(result.filteredTopLevel.length).toBe(1);
    });

    it('should filter by statsType=month', async () => {
      const janItem = makeRecord({ id: 1, purchase_date: '2024-01-15', _dailyCost: 3.0 });
      const febItem = makeRecord({ id: 2, purchase_date: '2024-02-10', _dailyCost: 1.0 });
      const db = createMockDb([janItem, febItem]);

      const result = await getFilteredTreeRecords(1, { statsType: 'month', statsValue: '2024-01' }, db);
      expect(result.filteredTopLevel.length).toBe(1);
    });
  });

  // ─── 8. Error handling ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('should reject when db.all returns an error', async () => {
      const db = {
        all: (sql, params, callback) => {
          callback(new Error('Database error'));
        }
      };

      await expect(getFilteredTreeRecords(1, {}, db)).rejects.toThrow('Database error');
    });
  });

  // ─── 9. allMatchedRecords completeness ──────────────────────────────────

  describe('allMatchedRecords output', () => {
    it('should include both parents and children in allMatchedRecords', async () => {
      const parent = makeRecord({ id: 10, _dailyCost: 3.0 });
      const child1 = makeRecord({ id: 11, parent_id: 10, _dailyCost: 1.0 });
      const child2 = makeRecord({ id: 12, parent_id: 10, _dailyCost: 0.5 });

      const db = createMockDb([parent, child1, child2]);
      const result = await getFilteredTreeRecords(1, {}, db);

      expect(result.allMatchedRecords.length).toBe(3); // parent + 2 children
    });
  });
});
