# DayCost 全局数据流设计文档

> **架构师**: ArchitectUX  
> **设计日期**: 2026-06-25  
> **版本**: 1.0  
> **状态**: 待实施

---

## 一、状态管理架构

### 1.1 应用级状态结构

```javascript
// 应用状态树结构
const AppState = {
  // 用户相关状态
  auth: {
    user: null,           // 当前用户信息
    token: null,          // JWT令牌
    isAuthenticated: false,
    isLoading: false
  },
  
  // 资产数据状态
  assets: {
    items: [],            // 资产列表
    currentAsset: null,   // 当前编辑的资产
    filters: {
      status: 'all',     // all/active/broken/sold
      category: 'all',
      sortBy: 'created_at',
      sortOrder: 'desc'
    },
    isLoading: false,
    error: null,
    pagination: {
      page: 1,
      limit: 20,
      total: 0
    }
  },
  
  // 批量操作状态
  batch: {
    isActive: false,
    selectedIds: new Set(),
    operation: null       // 'status'/'delete'
  },
  
  // 统计数据状态
  stats: {
    overview: null,       // 概览统计
    trends: null,         // 趋势数据
    categories: null,     // 分类统计
    isLoading: false
  },
  
  // UI状态
  ui: {
    toasts: [],           // Toast通知队列
    modals: {
      active: null,       // 当前活动的模态框
      data: null          // 模态框数据
    },
    loading: {},          // 各组件的加载状态
    sidebar: {
      isOpen: true,
      activeTab: 'assets'
    }
  },
  
  // 缓存状态
  cache: {
    lastUpdated: {},
    offlineQueue: []
  }
};
```

### 1.2 状态管理实现方案

```javascript
// 状态管理器（基于发布-订阅模式）
class StateManager {
  constructor(initialState = {}) {
    this.state = this.deepClone(initialState);
    this.listeners = new Map();
    this.middlewares = [];
  }
  
  // 获取状态（支持路径查询）
  getState(path = null) {
    if (!path) {
      return this.deepClone(this.state);
    }
    
    const keys = path.split('.');
    let current = this.state;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return this.deepClone(current);
  }
  
  // 设置状态（支持路径更新）
  setState(path, value) {
    if (typeof path === 'string') {
      const keys = path.split('.');
      let current = this.state;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      
      const lastKey = keys[keys.length - 1];
      const oldValue = current[lastKey];
      current[lastKey] = value;
      
      // 触发监听器
      this.notifyListeners(path, value, oldValue);
    }
    
    return this.getState();
  }
  
  // 订阅状态变化
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    
    this.listeners.get(path).add(callback);
    
    // 返回取消订阅函数
    return () => {
      const pathListeners = this.listeners.get(path);
      if (pathListeners) {
        pathListeners.delete(callback);
        if (pathListeners.size === 0) {
          this.listeners.delete(path);
        }
      }
    };
  }
  
  // 通知监听器
  notifyListeners(path, newValue, oldValue) {
    // 精确路径通知
    const exactListeners = this.listeners.get(path);
    if (exactListeners) {
      exactListeners.forEach(callback => {
        callback(newValue, oldValue, path);
      });
    }
    
    // 通配符通知
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        callback(newValue, oldValue, path);
      });
    }
  }
  
  // 深拷贝工具方法
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (obj instanceof Set) {
      return new Set([...obj]);
    }
    
    if (obj instanceof Map) {
      return new Map([...obj]);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    
    return cloned;
  }
  
  // 添加中间件
  use(middleware) {
    this.middlewares.push(middleware);
  }
}

// 创建全局状态管理器
const appState = new StateManager(AppState);
```

---

## 二、数据缓存策略

### 2.1 缓存策略设计

```javascript
// 缓存管理器
class CacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 5 * 60 * 1000; // 默认5分钟
    this.maxSize = options.maxSize || 100;
    this.storageKey = 'daycost_cache';
  }
  
  // 生成缓存键
  generateKey(endpoint, params = {}) {
    const paramStr = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return `${endpoint}?${paramStr}`;
  }
  
  // 获取缓存数据
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }
    
    // 检查是否过期
    if (Date.now() - item.timestamp > this.ttl) {
      this.delete(key);
      return null;
    }
    
    // 更新访问时间（LRU策略）
    item.lastAccess = Date.now();
    return item.data;
  }
  
  // 设置缓存数据
  set(key, data, ttl = null) {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      ttl: ttl || this.ttl
    });
    
    // 持久化到localStorage（可选）
    this.persistToStorage();
  }
  
  // 删除缓存
  delete(key) {
    this.cache.delete(key);
    this.persistToStorage();
  }
  
  // 清除过期缓存
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
    this.persistToStorage();
  }
  
  // 淘汰最旧的缓存（LRU策略）
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccess < oldestTime) {
        oldestTime = item.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
  
  // 持久化到localStorage
  persistToStorage() {
    try {
      const cacheData = {};
      for (const [key, item] of this.cache.entries()) {
        cacheData[key] = item;
      }
      localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('缓存持久化失败:', error);
    }
  }
  
  // 从localStorage恢复缓存
  restoreFromStorage() {
    try {
      const cached = localStorage.getItem(this.storageKey);
      if (cached) {
        const cacheData = JSON.parse(cached);
        for (const [key, item] of Object.entries(cacheData)) {
          // 检查是否过期
          if (Date.now() - item.timestamp <= item.ttl) {
            this.cache.set(key, item);
          }
        }
      }
    } catch (error) {
      console.warn('缓存恢复失败:', error);
    }
  }
}

// 创建全局缓存管理器
const cacheManager = new CacheManager({
  ttl: 5 * 60 * 1000, // 5分钟
  maxSize: 50
});
```

### 2.2 缓存使用策略

```javascript
// API调用缓存包装器
const apiWithCache = {
  async get(endpoint, params = {}, options = {}) {
    const { forceRefresh = false, ttl = null } = options;
    const cacheKey = cacheManager.generateKey(endpoint, params);
    
    // 如果不强制刷新，尝试从缓存获取
    if (!forceRefresh) {
      const cachedData = cacheManager.get(cacheKey);
      if (cachedData) {
        return cachedData;
      }
    }
    
    // 调用API
    const response = await api.get(endpoint, params);
    
    // 缓存响应数据
    if (response.success) {
      cacheManager.set(cacheKey, response.data, ttl);
    }
    
    return response.data;
  },
  
  // 清除相关缓存
  invalidate(pattern) {
    for (const key of cacheManager.cache.keys()) {
      if (key.includes(pattern)) {
        cacheManager.delete(key);
      }
    }
  }
};
```

---

## 三、API调用规范

### 3.1 统一错误处理

```javascript
// API客户端封装
class ApiClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || '/api';
    this.timeout = options.timeout || 10000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }
  
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      data = null,
      headers = {},
      retry = true
    } = options;
    
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': this.getCSRFToken(),
          ...headers
        },
        body: data ? JSON.stringify(data) : null,
        signal: controller.signal,
        credentials: 'include' // 包含cookies
      });
      
      clearTimeout(timeoutId);
      
      // 处理HTTP错误
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData
        );
      }
      
      // 解析响应
      const responseData = await response.json();
      
      // 统一响应格式验证
      if (!this.isValidResponse(responseData)) {
        throw new ApiError('无效的响应格式', 0, responseData);
      }
      
      return responseData;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // 网络错误或超时，进行重试
      if (retry && this.shouldRetry(error) && options._retryCount < this.retryAttempts) {
        await this.delay(this.retryDelay);
        return this.request(endpoint, {
          ...options,
          _retryCount: (options._retryCount || 0) + 1
        });
      }
      
      throw error;
    }
  }
  
  // 判断是否应该重试
  shouldRetry(error) {
    // 网络错误或超时可以重试
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      return true;
    }
    
    if (error.name === 'AbortError') {
      return true;
    }
    
    // 5xx服务器错误可以重试
    if (error.status >= 500 && error.status < 600) {
      return true;
    }
    
    return false;
  }
  
  // 验证响应格式
  isValidResponse(data) {
    return data && 
           typeof data === 'object' && 
           'success' in data && 
           'data' in data;
  }
  
  // 延迟函数
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // 获取CSRF Token
  getCSRFToken() {
    const cookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrf-token='));
    
    return cookie ? cookie.split('=')[1] : '';
  }
  
  // 便捷方法
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { method: 'GET' });
  }
  
  async post(endpoint, data) {
    return this.request(endpoint, { method: 'POST', data });
  }
  
  async put(endpoint, data) {
    return this.request(endpoint, { method: 'PUT', data });
  }
  
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

// API错误类
class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// 创建全局API客户端
const api = new ApiClient();
```

### 3.2 统一错误处理中间件

```javascript
// 前端错误处理中间件
const errorHandler = {
  // 处理API错误
  handleApiError(error, context = '') {
    console.error(`API Error in ${context}:`, error);
    
    // 根据错误类型显示不同的Toast
    if (error.status === 401) {
      // 未授权，跳转到登录页
      appState.setState('auth.isAuthenticated', false);
      showToast('会话已过期，请重新登录', 'error');
      setTimeout(() => window.location.href = '/login', 2000);
      return;
    }
    
    if (error.status === 403) {
      showToast('权限不足', 'error');
      return;
    }
    
    if (error.status === 404) {
      showToast('资源不存在', 'error');
      return;
    }
    
    if (error.status >= 500) {
      showToast('服务器错误，请稍后重试', 'error');
      return;
    }
    
    // 网络错误
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      showToast('网络连接失败，请检查网络', 'error');
      return;
    }
    
    // 其他错误
    showToast(error.message || '操作失败', 'error');
  },
  
  // 全局未捕获错误处理
  setupGlobalHandlers() {
    // 捕获未处理的Promise rejection
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.handleApiError(event.reason, 'Unhandled Promise');
      event.preventDefault();
    });
    
    // 捕获全局错误
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      // 只处理JS错误，不处理资源加载错误
      if (event.error) {
        showToast('发生未知错误', 'error');
      }
    });
  }
};

// 初始化错误处理
errorHandler.setupGlobalHandlers();
```

---

## 四、离线队列设计

### 4.1 离线队列管理器

```javascript
// 离线队列管理器
class OfflineQueueManager {
  constructor(options = {}) {
    this.queue = [];
    this.storageKey = 'daycost_offline_queue';
    this.maxQueueSize = options.maxQueueSize || 100;
    this.processing = false;
    
    // 从localStorage恢复队列
    this.restoreQueue();
    
    // 监听在线状态变化
    window.addEventListener('online', () => this.processQueue());
    window.addEventListener('offline', () => this.onOffline());
  }
  
  // 添加请求到队列
  addRequest(request) {
    if (this.queue.length >= this.maxQueueSize) {
      // 移除最旧的请求
      this.queue.shift();
    }
    
    const queueItem = {
      id: Date.now(),
      request: request,
      timestamp: new Date().toISOString(),
      retries: 0,
      maxRetries: 3
    };
    
    this.queue.push(queueItem);
    this.persistQueue();
    
    // 如果在线，立即处理
    if (navigator.onLine) {
      this.processQueue();
    }
    
    return queueItem.id;
  }
  
  // 处理队列
  async processQueue() {
    if (this.processing || !navigator.onLine || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    // 按时间顺序处理
    const sortedQueue = [...this.queue].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    for (const item of sortedQueue) {
      try {
        await this.processItem(item);
        
        // 成功处理，从队列中移除
        this.removeFromQueue(item.id);
        
      } catch (error) {
        console.error(`处理离线队列项失败:`, error);
        
        // 增加重试次数
        item.retries++;
        
        // 如果超过最大重试次数，移除并记录错误
        if (item.retries >= item.maxRetries) {
          this.removeFromQueue(item.id);
          this.logFailedRequest(item, error);
        }
      }
      
      // 更新持久化存储
      this.persistQueue();
    }
    
    this.processing = false;
    
    // 显示处理完成通知
    if (this.queue.length === 0) {
      showToast('离线操作已同步', 'success');
    }
  }
  
  // 处理单个队列项
  async processItem(item) {
    const { method, endpoint, data } = item.request;
    
    // 使用API客户端发送请求
    await api.request(endpoint, {
      method,
      data,
      retry: false // 不再重试，由队列管理重试逻辑
    });
  }
  
  // 从队列中移除项
  removeFromQueue(id) {
    this.queue = this.queue.filter(item => item.id !== id);
    this.persistQueue();
  }
  
  // 记录失败请求
  logFailedRequest(item, error) {
    console.error('Failed to process offline request:', {
      request: item.request,
      error: error.message,
      timestamp: item.timestamp
    });
    
    // 可以发送到错误监控系统
    // errorTracker.captureError(error, { offlineRequest: item });
  }
  
  // 持久化队列到localStorage
  persistQueue() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.warn('离线队列持久化失败:', error);
    }
  }
  
  // 从localStorage恢复队列
  restoreQueue() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
        
        // 过滤掉太旧的队列项（超过24小时）
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        this.queue = this.queue.filter(item => 
          new Date(item.timestamp) > oneDayAgo
        );
      }
    } catch (error) {
      console.warn('离线队列恢复失败:', error);
    }
  }
  
  // 离线状态处理
  onOffline() {
    showToast('网络已断开，操作将在恢复连接后同步', 'info');
  }
  
  // 获取队列状态
  getQueueStatus() {
    return {
      length: this.queue.length,
      isProcessing: this.processing,
      oldestItem: this.queue.length > 0 ? this.queue[0] : null
    };
  }
}

// 创建全局离线队列管理器
const offlineQueue = new OfflineQueueManager();
```

### 4.2 离线感知API调用

```javascript
// 增强的API客户端，支持离线队列
const enhancedApi = {
  async request(endpoint, options = {}) {
    const { offline = true, ...requestOptions } = options;
    
    // 如果离线且允许离线队列，添加到队列
    if (!navigator.onLine && offline) {
      const requestId = offlineQueue.addRequest({
        method: requestOptions.method || 'GET',
        endpoint,
        data: requestOptions.data
      });
      
      // 返回一个pending的Promise，直到请求被处理
      return new Promise((resolve, reject) => {
        // 设置超时（24小时）
        const timeout = setTimeout(() => {
          reject(new Error('离线请求超时'));
        }, 24 * 60 * 60 * 1000);
        
        // 监听队列处理完成
        const checkInterval = setInterval(() => {
          if (!offlineQueue.queue.find(item => item.id === requestId)) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve({ success: true, offline: true });
          }
        }, 1000);
      });
    }
    
    // 在线状态下正常调用
    return api.request(endpoint, requestOptions);
  },
  
  // 便捷方法
  async get(endpoint, params = {}, options = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { ...options, method: 'GET' });
  },
  
  async post(endpoint, data, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', data });
  },
  
  async put(endpoint, data, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', data });
  },
  
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
};
```

---

## 五、数据同步策略

### 5.1 增量同步机制

```javascript
// 数据同步管理器
class SyncManager {
  constructor() {
    this.lastSyncTime = null;
    this.syncInProgress = false;
    this.syncInterval = null;
  }
  
  // 开始定期同步
  startPeriodicSync(interval = 30000) {
    this.syncInterval = setInterval(() => {
      this.syncIfNeeded();
    }, interval);
    
    // 首次同步
    this.syncIfNeeded();
  }
  
  // 停止定期同步
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  
  // 检查是否需要同步
  async syncIfNeeded() {
    if (!navigator.onLine || this.syncInProgress) {
      return;
    }
    
    try {
      this.syncInProgress = true;
      
      // 获取本地最后更新时间
      const localLastUpdate = this.getLocalLastUpdate();
      
      // 获取服务器最新更新时间
      const serverLastUpdate = await this.getServerLastUpdate();
      
      // 如果服务器有更新，进行同步
      if (serverLastUpdate > localLastUpdate) {
        await this.syncData(localLastUpdate);
        this.updateLocalLastUpdate(serverLastUpdate);
        
        // 触发数据更新事件
        this.emitSyncComplete();
      }
      
    } catch (error) {
      console.error('数据同步失败:', error);
    } finally {
      this.syncInProgress = false;
    }
  }
  
  // 同步数据
  async syncData(since) {
    try {
      // 获取增量数据
      const response = await api.get('/sync', { since });
      
      if (response.success && response.data) {
        // 应用增量更新
        this.applyIncrementalUpdate(response.data);
        
        // 更新缓存
        this.updateCache(response.data);
        
        console.log(`同步完成，更新了 ${response.data.assets?.length || 0} 条记录`);
      }
      
    } catch (error) {
      console.error('同步数据失败:', error);
      throw error;
    }
  }
  
  // 应用增量更新
  applyIncrementalUpdate(data) {
    // 更新资产数据
    if (data.assets) {
      const currentAssets = appState.getState('assets.items') || [];
      const mergedAssets = this.mergeAssets(currentAssets, data.assets);
      appState.setState('assets.items', mergedAssets);
    }
    
    // 更新其他数据...
  }
  
  // 合并资产数据（去重、更新）
  mergeAssets(localAssets, remoteAssets) {
    const assetMap = new Map();
    
    // 添加本地资产
    localAssets.forEach(asset => {
      assetMap.set(asset.id, asset);
    });
    
    // 更新/添加远程资产
    remoteAssets.forEach(asset => {
      if (assetMap.has(asset.id)) {
        // 合并更新（远程优先）
        const localAsset = assetMap.get(asset.id);
        assetMap.set(asset.id, { ...localAsset, ...asset });
      } else {
        // 新资产
        assetMap.set(asset.id, asset);
      }
    });
    
    return Array.from(assetMap.values());
  }
  
  // 更新缓存
  updateCache(data) {
    // 清除相关缓存
    cacheManager.invalidate('/api/assets');
    cacheManager.invalidate('/api/stats');
    
    // 缓存新数据
    if (data.assets) {
      cacheManager.set(
        cacheManager.generateKey('/api/assets', {}),
        data.assets
      );
    }
  }
  
  // 获取本地最后更新时间
  getLocalLastUpdate() {
    const stored = localStorage.getItem('lastSyncTime');
    return stored ? new Date(stored) : new Date(0);
  }
  
  // 更新本地最后更新时间
  updateLocalLastUpdate(time) {
    localStorage.setItem('lastSyncTime', time.toISOString());
  }
  
  // 获取服务器最后更新时间
  async getServerLastUpdate() {
    const response = await api.get('/sync/status');
    return new Date(response.data.lastUpdate);
  }
  
  // 触发同步完成事件
  emitSyncComplete() {
    const event = new CustomEvent('syncComplete', {
      detail: { timestamp: new Date() }
    });
    window.dispatchEvent(event);
  }
}

// 创建全局同步管理器
const syncManager = new SyncManager();

// 在应用启动时开始同步
if (navigator.onLine) {
  syncManager.startPeriodicSync();
}

// 监听网络状态变化
window.addEventListener('online', () => {
  syncManager.startPeriodicSync();
  offlineQueue.processQueue();
});

window.addEventListener('offline', () => {
  syncManager.stopPeriodicSync();
});
```

---

## 六、实现注意事项

### 6.1 性能优化

1. **批量更新**：避免频繁的状态更新，使用`requestAnimationFrame`批量处理
2. **虚拟化**：长列表使用虚拟滚动，减少DOM操作
3. **防抖节流**：对高频操作（如搜索、滚动）进行防抖或节流处理
4. **内存管理**：及时清理不再使用的事件监听器和订阅

### 6.2 数据一致性

1. **乐观更新**：对于用户操作，先更新UI，再同步服务器
2. **冲突解决**：使用时间戳或版本号解决数据冲突
3. **事务性操作**：确保批量操作的原子性
4. **数据验证**：前后端都要进行数据验证

### 6.3 错误恢复

1. **重试机制**：对网络错误实现指数退避重试
2. **降级策略**：当主要功能失败时，提供降级方案
3. **数据备份**：重要数据本地备份，防止数据丢失
4. **用户引导**：清晰的错误提示和恢复指引

### 6.4 安全性

1. **数据加密**：敏感数据本地存储时进行加密
2. **令牌管理**：安全的JWT令牌存储和刷新机制
3. **输入验证**：所有用户输入进行严格验证
4. **权限控制**：前后端双重权限验证

---

## 七、监控与调试

### 7.1 开发调试工具

```javascript
// 调试工具
const debugTools = {
  // 显示状态变化日志
  enableStateLogging() {
    appState.subscribe('*', (newValue, oldValue, path) => {
      console.log(`State changed [${path}]:`, {
        oldValue: oldValue,
        newValue: newValue,
        timestamp: new Date().toISOString()
      });
    });
  },
  
  // 显示缓存状态
  showCacheStatus() {
    console.log('Cache status:', {
      size: cacheManager.cache.size,
      maxSize: cacheManager.maxSize,
      ttl: cacheManager.ttl
    });
    
    for (const [key, item] of cacheManager.cache.entries()) {
      console.log(`  ${key}:`, {
        age: `${Math.round((Date.now() - item.timestamp) / 1000)}s`,
        lastAccess: `${Math.round((Date.now() - item.lastAccess) / 1000)}s ago`
      });
    }
  },
  
  // 显示离线队列状态
  showOfflineQueueStatus() {
    const status = offlineQueue.getQueueStatus();
    console.log('Offline queue:', status);
    
    if (status.length > 0) {
      console.log('Pending requests:');
      offlineQueue.queue.forEach(item => {
        console.log(`  [${item.id}] ${item.request.method} ${item.request.endpoint}`, {
          age: `${Math.round((Date.now() - new Date(item.timestamp).getTime()) / 1000)}s`,
          retries: item.retries
        });
      });
    }
  },
  
  // 清除所有缓存和队列
  clearAll() {
    cacheManager.cache.clear();
    localStorage.removeItem(cacheManager.storageKey);
    
    offlineQueue.queue = [];
    localStorage.removeItem(offlineQueue.storageKey);
    
    console.log('All caches and queues cleared');
  }
};

// 在开发环境暴露调试工具
if (process.env.NODE_ENV === 'development') {
  window.debugTools = debugTools;
}
```

### 7.2 生产环境监控

```javascript
// 性能监控
const performanceMonitor = {
  // 监控API调用性能
  monitorApiCalls() {
    const originalRequest = api.request.bind(api);
    
    api.request = async function(...args) {
      const start = performance.now();
      const endpoint = args[0];
      
      try {
        const result = await originalRequest.apply(this, args);
        const duration = performance.now() - start;
        
        // 记录API调用性能
        this.recordMetric('api_call', {
          endpoint,
          duration,
          success: true,
          timestamp: new Date().toISOString()
        });
        
        return result;
        
      } catch (error) {
        const duration = performance.now() - start;
        
        this.recordMetric('api_error', {
          endpoint,
          duration,
          error: error.message,
          status: error.status,
          timestamp: new Date().toISOString()
        });
        
        throw error;
      }
    };
  },
  
  // 记录性能指标
  recordMetric(name, data) {
    // 发送到监控系统
    if (window.gtag) {
      window.gtag('event', name, {
        event_category: 'performance',
        event_label: data.endpoint,
        value: Math.round(data.duration)
      });
    }
    
    // 本地存储（用于分析）
    const metrics = JSON.parse(localStorage.getItem('performance_metrics') || '[]');
    metrics.push({ name, data });
    
    // 只保留最近100条
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
    
    localStorage.setItem('performance_metrics', JSON.stringify(metrics));
  },
  
  // 获取性能报告
  getPerformanceReport() {
    const metrics = JSON.parse(localStorage.getItem('performance_metrics') || '[]');
    
    // 按端点分组统计
    const endpointStats = {};
    
    metrics.forEach(metric => {
      const endpoint = metric.data.endpoint;
      if (!endpointStats[endpoint]) {
        endpointStats[endpoint] = {
          calls: 0,
          errors: 0,
          totalDuration: 0,
          maxDuration: 0
        };
      }
      
      const stats = endpointStats[endpoint];
      stats.calls++;
      
      if (metric.name === 'api_error') {
        stats.errors++;
      }
      
      stats.totalDuration += metric.data.duration;
      stats.maxDuration = Math.max(stats.maxDuration, metric.data.duration);
    });
    
    // 计算平均值
    Object.keys(endpointStats).forEach(endpoint => {
      const stats = endpointStats[endpoint];
      stats.avgDuration = stats.totalDuration / stats.calls;
      stats.errorRate = stats.errors / stats.calls;
    });
    
    return endpointStats;
  }
};

// 初始化性能监控
performanceMonitor.monitorApiCalls();
```

---

**文档维护者**: ArchitectUX  
**下次评审日期**: 2026-07-02  
**联系方式**: [项目讨论区]