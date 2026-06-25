/**
 * DayCost State Manager
 * Version: 1.0.0
 *
 * A lightweight publish-subscribe state container.
 * Supports dot-separated paths (e.g. 'assets.items') and
 * wildcard ('*') subscriptions that fire on every change.
 */

class StateManager {
  /**
   * @param {Object} initialState - seed state (deep-cloned on construction)
   */
  constructor(initialState = {}) {
    /** @type {Object} Internal state tree */
    this.state = this._deepClone(initialState);

    /**
     * Map of path -> Set<Function>.
     * Special key '*' fires on every change.
     * @type {Map<string, Set<Function>>}
     */
    this.listeners = new Map();
  }

  /* ------------------------------------------------------------------ */
  /*  Read                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Get a value by dot-separated path.
   * If path is omitted the entire (cloned) state is returned.
   * @param {string} [path]
   * @returns {*}
   */
  getState(path) {
    if (!path) return this._deepClone(this.state);

    const keys = path.split('.');
    let cur = this.state;
    for (const k of keys) {
      if (cur == null || typeof cur !== 'object' || !(k in cur)) return undefined;
      cur = cur[k];
    }
    return this._deepClone(cur);
  }

  /* ------------------------------------------------------------------ */
  /*  Write                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Set a value by dot-separated path and notify subscribers.
   * Intermediate objects are created automatically if missing.
   * @param {string} path
   * @param {*}      value
   * @returns {Object} the full state (cloned)
   */
  setState(path, value) {
    const keys = path.split('.');
    let cur = this.state;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (cur[k] == null || typeof cur[k] !== 'object') {
        cur[k] = {};
      }
      cur = cur[k];
    }

    const lastKey = keys[keys.length - 1];
    const oldValue = cur[lastKey];
    cur[lastKey] = value;

    this._notify(path, value, oldValue);

    return this._deepClone(this.state);
  }

  /* ------------------------------------------------------------------ */
  /*  Subscribe / Unsubscribe                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Subscribe to changes on a specific path (or '*' for all changes).
   * @param   {string}   path     - dot-separated path or '*'
   * @param   {Function} callback - (newValue, oldValue, path) => void
   * @returns {Function} unsubscribe function
   */
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);

    // Return an unsubscribe thunk
    return () => this.unsubscribe(path, callback);
  }

  /**
   * Remove a previously registered callback for a path.
   * @param {string}   path
   * @param {Function} callback
   */
  unsubscribe(path, callback) {
    const set = this.listeners.get(path);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) this.listeners.delete(path);
  }

  /* ------------------------------------------------------------------ */
  /*  Internal                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Notify exact-path listeners and wildcard listeners.
   * @private
   */
  _notify(path, newValue, oldValue) {
    // Exact match
    const exact = this.listeners.get(path);
    if (exact) {
      exact.forEach(cb => {
        try { cb(this._deepClone(newValue), this._deepClone(oldValue), path); }
        catch (e) { console.error('[StateManager] listener error:', e); }
      });
    }

    // Wildcard
    const wc = this.listeners.get('*');
    if (wc) {
      wc.forEach(cb => {
        try { cb(this._deepClone(newValue), this._deepClone(oldValue), path); }
        catch (e) { console.error('[StateManager] wildcard listener error:', e); }
      });
    }
  }

  /**
   * Deep-clone a plain value (handles Date, Set, Map, Array, Object).
   * @private
   */
  _deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date)  return new Date(obj.getTime());
    if (obj instanceof Set)   return new Set([...obj]);
    if (obj instanceof Map)   return new Map([...obj]);
    if (Array.isArray(obj))   return obj.map(v => this._deepClone(v));

    const out = {};
    for (const key of Object.keys(obj)) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        out[key] = this._deepClone(obj[key]);
      }
    }
    return out;
  }
}

// Expose globally
window.StateManager = StateManager;
