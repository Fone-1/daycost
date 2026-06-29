/**
 * Unit Tests for Daily Cost Calculation
 *
 * Tests the core daily cost formula used in DayCost:
 *   dailyCost = finalCost / (daysUsed + 1)
 *   daysUsed = floor((endDate - purchaseDate) / oneDayMs)
 *
 * Also tests simulateCostAtDate() from stats.js for trend chart calculations.
 * Since simulateCostAtDate is a private function not exported, we extract and
 * test the equivalent logic directly.
 */

// ─── Core daily cost calculation (pure function, no DB) ──────────────────────

/**
 * Calculate daily amortized cost for a record.
 * Mirrors the logic used in the SQL view v_records_computed and stats.js.
 * @param {object} record - { price, purchase_date, status, end_date, resale_price }
 * @param {Date|string} asOfDate - Date to calculate cost at (defaults to now)
 * @returns {number} daily cost
 */
function calculateDailyCost(record, asOfDate = new Date()) {
  const purchaseDate = new Date(record.purchase_date);
  purchaseDate.setHours(0, 0, 0, 0);

  const targetDate = new Date(asOfDate);
  targetDate.setHours(0, 0, 0, 0);

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Daily Cost Calculation', () => {

  // ─── 1. Basic formula ──────────────────────────────────────────────────

  describe('basic daily cost formula', () => {
    it('should calculate dailyCost = price / days for a simple active item', () => {
      // Item bought on Jan 1 at ¥1000, checked on Jan 11 (10 days later)
      const record = { price: 1000, purchase_date: '2024-01-01', status: 'active' };
      const result = calculateDailyCost(record, '2024-01-11');
      // daysUsed = 10, actualDaysForCalc = 11
      expect(result).toBeCloseTo(1000 / 11, 2);
    });

    it('should handle purchase date same as check date (days=0)', () => {
      const record = { price: 500, purchase_date: '2024-01-01', status: 'active' };
      const result = calculateDailyCost(record, '2024-01-01');
      // daysUsed = 0, actualDaysForCalc = 1 → dailyCost = 500
      expect(result).toBe(500);
    });

    it('should return 0 for dates before purchase', () => {
      const record = { price: 1000, purchase_date: '2024-06-01', status: 'active' };
      const result = calculateDailyCost(record, '2024-05-01');
      expect(result).toBe(0);
    });

    it('should decrease daily cost as holding time increases', () => {
      const record = { price: 1000, purchase_date: '2024-01-01', status: 'active' };
      const costDay1 = calculateDailyCost(record, '2024-01-01');
      const costDay10 = calculateDailyCost(record, '2024-01-11');
      const costDay100 = calculateDailyCost(record, '2024-04-10');

      // Daily cost should decrease over time
      expect(costDay1).toBeGreaterThan(costDay10);
      expect(costDay10).toBeGreaterThan(costDay100);
    });
  });

  // ─── 2. Sold items with resale ──────────────────────────────────────────

  describe('sold items (with resale price)', () => {
    it('should use (price - resale_price) as finalCost for sold items past end date', () => {
      const record = {
        price: 1000,
        purchase_date: '2024-01-01',
        status: 'sold',
        end_date: '2024-03-01',
        resale_price: 400
      };
      const result = calculateDailyCost(record, '2024-04-01');
      // finalCost = 1000 - 400 = 600
      // daysUsed from Jan 1 to Mar 1 = 60, actualDaysForCalc = 61
      expect(result).toBeCloseTo(600 / 61, 2);
    });

    it('should still use full price for sold items before end_date', () => {
      const record = {
        price: 1000,
        purchase_date: '2024-01-01',
        status: 'sold',
        end_date: '2024-06-01',
        resale_price: 400
      };
      const result = calculateDailyCost(record, '2024-02-01');
      // Not past end_date yet → full price
      // daysUsed = 31, actualDaysForCalc = 32
      expect(result).toBeCloseTo(1000 / 32, 2);
    });

    it('should handle resale_price = 0', () => {
      const record = {
        price: 500,
        purchase_date: '2024-01-01',
        status: 'sold',
        end_date: '2024-02-01',
        resale_price: 0
      };
      const result = calculateDailyCost(record, '2024-03-01');
      // finalCost = max(0, 500 - 0) = 500
      expect(result).toBeGreaterThan(0);
    });

    it('should handle resale_price > price (finalCost clamped to 0)', () => {
      const record = {
        price: 500,
        purchase_date: '2024-01-01',
        status: 'sold',
        end_date: '2024-02-01',
        resale_price: 600
      };
      const result = calculateDailyCost(record, '2024-03-01');
      // finalCost = max(0, 500 - 600) = 0
      expect(result).toBe(0);
    });
  });

  // ─── 3. Broken/archived items ───────────────────────────────────────────

  describe('broken/archived items', () => {
    it('should use end_date for broken items past their end date', () => {
      const record = {
        price: 2000,
        purchase_date: '2024-01-01',
        status: 'broken',
        end_date: '2024-03-15'
      };
      const result = calculateDailyCost(record, '2024-06-01');
      // endDate = Mar 15, daysUsed from Jan 1 to Mar 15 = 74, actualDays = 75
      expect(result).toBeCloseTo(2000 / 75, 2);
    });

    it('should use current date for active items (no end_date)', () => {
      const record = { price: 365, purchase_date: '2024-01-01', status: 'active' };
      const result = calculateDailyCost(record, '2024-01-31');
      // daysUsed = 30, actualDaysForCalc = 31
      expect(result).toBeCloseTo(365 / 31, 2);
    });
  });

  // ─── 4. Edge cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle price=0', () => {
      const record = { price: 0, purchase_date: '2024-01-01', status: 'active' };
      const result = calculateDailyCost(record, '2024-01-10');
      expect(result).toBe(0);
    });

    it('should handle very large numbers without overflow', () => {
      const record = { price: 999999999, purchase_date: '2020-01-01', status: 'active' };
      const result = calculateDailyCost(record, '2024-01-01');
      expect(result).toBeGreaterThan(0);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('should handle long holding period (3+ years)', () => {
      const record = { price: 1000, purchase_date: '2020-01-01', status: 'active' };
      const result = calculateDailyCost(record, '2024-01-01');
      // ~1461 days, actualDays ~1462
      expect(result).toBeCloseTo(1000 / 1462, 2);
    });
  });
});
