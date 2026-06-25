# DayCost 用户体验架构重设计方案

> **架构师**: ArchitectUX  
> **设计日期**: 2026-06-25  
> **版本**: 1.0  
> **状态**: 待实施

---

## 一、当前UX断点分析

### 1.1 已识别的关键断点

| 断点编号 | 问题描述 | 影响范围 | 严重程度 |
|---------|---------|---------|---------|
| BP-01 | 认证流程与主应用割裂，缺乏引导 | 新用户留存 | 高 |
| BP-02 | 5个顶级Tab缺乏清晰的信息架构层级 | 日常使用效率 | 高 |
| BP-03 | 添加/编辑/删除操作分散，路径不一致 | 操作效率 | 中 |
| BP-04 | 操作反馈机制不明确，缺乏进度指示 | 用户信心 | 中 |
| BP-05 | 桌面端和移动端交互模式差异大 | 跨设备一致性 | 中 |

### 1.2 用户痛点总结

- **认知负担过重**：添加资产需要填写8+字段，缺乏渐进式引导
- **导航迷失**：TOTP等辅助功能与核心功能平级，主次不清
- **操作路径冗长**：简单编辑需要经过弹窗→修改→保存→刷新多个步骤
- **反馈延迟**：操作后缺乏即时视觉反馈，用户不确定操作是否成功

---

## 二、新信息架构设计

### 2.1 三层导航体系

```
DayCost 应用
├── 核心功能层（主导航，始终可见）
│   ├── 账本 - 资产记录管理
│   │   ├── 资产列表（虚拟滚动）
│   │   ├── 快速添加（浮动按钮）
│   │   ├── 筛选排序（内联工具栏）
│   │   └── 批量操作（多选模式）
│   └── 统计 - 数据可视化分析
│       ├── 概览仪表盘
│       ├── 趋势图表
│       ├── 分类统计
│       └── 标签分析
│
├── 工具功能层（次要导航，可折叠）
│   ├── TOTP 密钥管理
│   └── 回收站
│
└── 系统功能层（设置入口）
    ├── 个人资料
    ├── 安全设置
    ├── 外观主题
    └── 数据管理
```

### 2.2 导航优先级原则

1. **核心功能前置**：账本和统计占据主导航最显眼位置
2. **工具功能收起**：TOTP和回收站移至二级菜单或侧边栏
3. **系统功能集中**：设置相关功能统一收纳在设置页面
4. **上下文感知**：根据用户当前操作动态显示相关工具

---

## 三、用户旅程优化

### 3.1 新用户引导流程

```
阶段1: 首次访问（0-30秒）
├── 清晰的价值主张展示
├── "买得起，不一定用得起" 核心理念传达
└── 明确的行动召唤（开始使用）

阶段2: 快速注册（30秒-2分钟）
├── 极简注册表单（仅用户名+密码）
├── 即时反馈和错误提示
└── 自动登录，跳转至账本

阶段3: 首件添加（2-5分钟）
├── 智能引导模式
│   ├── 第一步：物品名称（必填）
│   ├── 第二步：购买价格（必填）
│   └── 第三步：购买日期（默认今天）
├── 即时显示日均成本动画
└── 可选：补充详细信息（渐进式披露）

阶段4: 发现价值（5分钟+）
├── 首个日均成本数字的"惊喜时刻"
├── 引导查看统计面板
└── 邀请添加更多资产
```

### 3.2 日常使用流程优化

#### 添加资产流程（优化后）

```
当前流程：
点击FAB → 弹出完整表单 → 填写8+字段 → 提交 → 弹窗显示结果 → 关闭

优化后流程：
点击FAB → 快速添加模式（仅名称+价格）→ 即时成本动画 → 
可选：点击展开详情 → 渐进式补充信息
```

#### 编辑状态流程（优化后）

```
当前流程：
点击编辑按钮 → 弹窗 → 修改字段 → 保存 → 刷新列表 → 关闭弹窗

优化后流程：
长按/右键资产 → 内联编辑模式 → 即时保存 → 状态更新动画
```

#### 批量操作流程（新增）

```
进入多选模式 → 勾选资产 → 选择操作（状态变更/删除）→ 
确认操作 → 级联处理选项（如有子配件）→ 执行 → 反馈
```

#### 批量操作数据一致性设计

##### 1. 事务处理方案

```javascript
// 批量操作事务管理器
class BatchOperationManager {
  constructor(db) {
    this.db = db;
  }
  
  // 批量状态变更（事务保护）
  async batchStatusChange(assetIds, newStatus, userId) {
    // 开始事务
    await this.db.run('BEGIN TRANSACTION');
    
    try {
      const results = [];
      
      for (const assetId of assetIds) {
        // 1. 检查资产是否存在且属于当前用户
        const asset = await this.db.get(
          'SELECT id, status, user_id FROM assets WHERE id = ? AND user_id = ?',
          [assetId, userId]
        );
        
        if (!asset) {
          throw new Error(`资产 ${assetId} 不存在或无权访问`);
        }
        
        // 2. 记录原始状态（用于回滚）
        results.push({
          id: assetId,
          originalStatus: asset.status
        });
        
        // 3. 更新状态
        await this.db.run(
          'UPDATE assets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newStatus, assetId]
        );
        
        // 4. 记录审计日志
        await this.db.run(
          `INSERT INTO audit_logs (user_id, action, detail, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, 'batch_status_change', JSON.stringify({
            assetId,
            fromStatus: asset.status,
            toStatus: newStatus
          })]
        );
      }
      
      // 提交事务
      await this.db.run('COMMIT');
      
      return {
        success: true,
        processed: results.length,
        results
      };
      
    } catch (error) {
      // 回滚事务
      await this.db.run('ROLLBACK');
      
      // 记录错误
      console.error('批量状态变更失败:', error);
      
      throw new Error(`批量操作失败: ${error.message}`);
    }
  }
  
  // 批量删除（事务保护）
  async batchDelete(assetIds, userId) {
    await this.db.run('BEGIN TRANSACTION');
    
    try {
      const deletedAssets = [];
      
      for (const assetId of assetIds) {
        // 1. 检查资产是否存在
        const asset = await this.db.get(
          'SELECT id, name, status, user_id FROM assets WHERE id = ? AND user_id = ?',
          [assetId, userId]
        );
        
        if (!asset) {
          continue; // 跳过不存在的资产
        }
        
        // 2. 软删除（移动到回收站）
        await this.db.run(
          `UPDATE assets SET 
             is_deleted = 1, 
             deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [assetId]
        );
        
        // 3. 记录审计日志
        await this.db.run(
          `INSERT INTO audit_logs (user_id, action, detail, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, 'batch_delete', JSON.stringify({
            assetId,
            assetName: asset.name,
            originalStatus: asset.status
          })]
        );
        
        deletedAssets.push({
          id: assetId,
          name: asset.name
        });
      }
      
      await this.db.run('COMMIT');
      
      return {
        success: true,
        deleted: deletedAssets.length,
        assets: deletedAssets
      };
      
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw new Error(`批量删除失败: ${error.message}`);
    }
  }
}
```

##### 2. 并发控制方案

```javascript
// 乐观锁实现
class OptimisticLockManager {
  constructor() {
    this.locks = new Map(); // 资源锁状态
  }
  
  // 获取资源版本
  async getResourceVersion(resourceType, resourceId) {
    const cacheKey = `${resourceType}:${resourceId}`;
    
    // 先从缓存获取
    const cached = this.locks.get(cacheKey);
    if (cached) {
      return cached.version;
    }
    
    // 从数据库获取
    let versionQuery;
    if (resourceType === 'asset') {
      versionQuery = 'SELECT version FROM assets WHERE id = ?';
    } else if (resourceType === 'user') {
      versionQuery = 'SELECT version FROM users WHERE id = ?';
    }
    
    const result = await db.get(versionQuery, [resourceId]);
    const version = result ? result.version : 0;
    
    // 缓存版本信息
    this.locks.set(cacheKey, {
      version,
      timestamp: Date.now()
    });
    
    return version;
  }
  
  // 验证版本并更新
  async validateAndUpdate(resourceType, resourceId, expectedVersion, updateFn) {
    const currentVersion = await this.getResourceVersion(resourceType, resourceId);
    
    // 版本不匹配，说明有并发修改
    if (currentVersion !== expectedVersion) {
      throw new ConcurrentModificationError(
        `资源已被其他用户修改，请刷新后重试`,
        {
          resourceType,
          resourceId,
          expectedVersion,
          currentVersion
        }
      );
    }
    
    // 执行更新
    const result = await updateFn();
    
    // 更新版本号
    const newVersion = expectedVersion + 1;
    if (resourceType === 'asset') {
      await db.run(
        'UPDATE assets SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newVersion, resourceId]
      );
    }
    
    // 更新缓存
    const cacheKey = `${resourceType}:${resourceId}`;
    this.locks.set(cacheKey, {
      version: newVersion,
      timestamp: Date.now()
    });
    
    return result;
  }
  
  // 清理过期锁
  cleanupExpiredLocks(maxAge = 300000) { // 默认5分钟
    const now = Date.now();
    
    for (const [key, lock] of this.locks.entries()) {
      if (now - lock.timestamp > maxAge) {
        this.locks.delete(key);
      }
    }
  }
}

// 并发修改错误类
class ConcurrentModificationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ConcurrentModificationError';
    this.details = details;
    this.retryable = true;
  }
}

// 使用乐观锁的资产更新
async function updateAssetWithLock(assetId, updates, expectedVersion, userId) {
  const lockManager = new OptimisticLockManager();
  
  return lockManager.validateAndUpdate('asset', assetId, expectedVersion, async () => {
    // 验证用户权限
    const asset = await db.get(
      'SELECT id, user_id FROM assets WHERE id = ? AND user_id = ?',
      [assetId, userId]
    );
    
    if (!asset) {
      throw new Error('资产不存在或无权访问');
    }
    
    // 构建更新语句
    const setClauses = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (['name', 'price', 'status', 'category'].includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (setClauses.length === 0) {
      throw new Error('没有有效的更新字段');
    }
    
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(assetId);
    
    // 执行更新
    await db.run(
      `UPDATE assets SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
    
    // 记录审计日志
    await db.run(
      `INSERT INTO audit_logs (user_id, action, detail, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, 'asset_update', JSON.stringify({
        assetId,
        updates,
        expectedVersion
      })]
    );
    
    return { success: true, assetId };
  });
}
```

##### 3. 部分成功处理方案

```javascript
// 部分成功处理器
class PartialSuccessHandler {
  constructor() {
    this.results = {
      successful: [],
      failed: [],
      skipped: []
    };
  }
  
  // 记录成功操作
  recordSuccess(itemId, details = {}) {
    this.results.successful.push({
      itemId,
      timestamp: new Date().toISOString(),
      ...details
    });
  }
  
  // 记录失败操作
  recordFailure(itemId, error, details = {}) {
    this.results.failed.push({
      itemId,
      error: error.message,
      errorCode: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
      ...details
    });
  }
  
  // 记录跳过的操作
  recordSkip(itemId, reason, details = {}) {
    this.results.skipped.push({
      itemId,
      reason,
      timestamp: new Date().toISOString(),
      ...details
    });
  }
  
  // 生成报告
  generateReport() {
    const total = this.results.successful.length + 
                  this.results.failed.length + 
                  this.results.skipped.length;
    
    return {
      summary: {
        total,
        successful: this.results.successful.length,
        failed: this.results.failed.length,
        skipped: this.results.skipped.length,
        successRate: total > 0 ? 
          (this.results.successful.length / total * 100).toFixed(2) + '%' : '0%'
      },
      details: this.results,
      timestamp: new Date().toISOString()
    };
  }
  
  // 显示用户友好的结果
  showResultsToUser(toastManager) {
    const report = this.generateReport();
    
    if (report.summary.failed === 0 && report.summary.skipped === 0) {
      // 全部成功
      toastManager.show(
        `成功处理 ${report.summary.successful} 项操作`,
        'success'
      );
    } else if (report.summary.successful === 0) {
      // 全部失败
      toastManager.show(
        `操作失败: ${report.summary.failed} 项失败，${report.summary.skipped} 项跳过`,
        'error'
      );
    } else {
      // 部分成功
      toastManager.show(
        `部分完成: ${report.summary.successful} 成功，${report.summary.failed} 失败，${report.summary.skipped} 跳过`,
        'warning'
      );
    }
    
    // 如果有失败项，显示详细信息按钮
    if (report.summary.failed > 0) {
      toastManager.showAction('查看详情', () => {
        this.showDetailedResults(report);
      });
    }
  }
  
  // 显示详细结果
  showDetailedResults(report) {
    // 创建模态框显示详细信息
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>操作详情</h3>
        <div class="result-summary">
          <p>总计: ${report.summary.total}</p>
          <p>成功: ${report.summary.successful}</p>
          <p>失败: ${report.summary.failed}</p>
          <p>跳过: ${report.summary.skipped}</p>
          <p>成功率: ${report.summary.successRate}</p>
        </div>
        
        ${report.details.failed.length > 0 ? `
          <div class="failed-items">
            <h4>失败项:</h4>
            <ul>
              ${report.details.failed.map(item => `
                <li>
                  ID: ${item.itemId}<br>
                  错误: ${item.error}<br>
                  时间: ${new Date(item.timestamp).toLocaleString()}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        
        <button class="close-modal">关闭</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 关闭模态框
    modal.querySelector('.close-modal').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }
}

// 使用示例
async function batchStatusChangeWithPartialSuccess(assetIds, newStatus, userId) {
  const batchManager = new BatchOperationManager(db);
  const partialHandler = new PartialSuccessHandler();
  
  for (const assetId of assetIds) {
    try {
      await batchManager.batchStatusChange([assetId], newStatus, userId);
      partialHandler.recordSuccess(assetId, { newStatus });
    } catch (error) {
      if (error.message.includes('不存在或无权访问')) {
        partialHandler.recordSkip(assetId, '资产不存在或无权访问');
      } else {
        partialHandler.recordFailure(assetId, error);
      }
    }
  }
  
  return partialHandler.generateReport();
}
```

---

## 四、交互模式设计

### 4.1 核心交互原则

| 原则 | 描述 | 实现方式 |
|------|------|---------|
| 即时反馈 | 每个操作都有即时视觉响应 | 动画、Toast、状态变化 |
| 渐进披露 | 复杂功能按需展示 | 高级选项默认折叠 |
| 上下文感知 | 工具随操作上下文出现 | 浮动工具栏、右键菜单 |
| 一致性 | 桌面端和移动端体验统一 | 响应式交互模式 |
| 可逆性 | 重要操作可撤销 | 回收站、撤销功能 |

### 4.2 关键交互组件设计

#### 快速添加组件

```html
<!-- 快速添加模式 -->
<div class="quick-add-panel">
  <input type="text" placeholder="物品名称" class="quick-add-name" autofocus>
  <input type="number" placeholder="购买价格" class="quick-add-price">
  <button class="quick-add-submit">添加</button>
  <button class="quick-add-expand">更多选项 ▼</button>
</div>

<!-- 展开后的详细模式 -->
<div class="detailed-add-panel hidden">
  <!-- 渐进式披露的详细字段 -->
</div>
```

#### 内联编辑组件

```html
<!-- 资产卡片内联编辑状态 -->
<div class="asset-card editing">
  <div class="inline-field">
    <label>状态</label>
    <select class="inline-status-select">
      <option value="active">使用中</option>
      <option value="broken">已损坏</option>
      <option value="sold">已回血</option>
    </select>
  </div>
  <div class="inline-actions">
    <button class="save-btn">保存</button>
    <button class="cancel-btn">取消</button>
  </div>
</div>
```

#### 批量操作工具栏

```html
<!-- 批量操作模式 -->
<div class="batch-toolbar" data-active="false">
  <div class="batch-info">
    <span class="selected-count">0</span> 项已选择
  </div>
  <div class="batch-actions">
    <button class="batch-status-btn">批量状态变更</button>
    <button class="batch-delete-btn">批量删除</button>
    <button class="batch-cancel-btn">取消</button>
  </div>
</div>
```

### 4.3 组件JavaScript API规范

#### 4.3.1 QuickAddPanel（快速添加组件）

```javascript
/**
 * 快速添加面板组件
 * @class QuickAddPanel
 */
class QuickAddPanel {
  /**
   * 创建快速添加面板实例
   * @param {HTMLElement} container - 容器元素
   * @param {Object} options - 配置选项
   * @param {Function} options.onSubmit - 提交回调函数
   * @param {Function} options.onExpand - 展开详情回调
   * @param {boolean} options.autoFocus - 是否自动聚焦，默认true
   * @param {string} options.position - 面板位置：'bottom-right' | 'center' | 'custom'
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      autoFocus: true,
      position: 'bottom-right',
      ...options
    };
    
    this.isOpen = false;
    this.panelElement = null;
    this.nameInput = null;
    this.priceInput = null;
    
    this.init();
  }
  
  /**
   * 初始化组件
   * @private
   */
  init() {
    this.createPanel();
    this.bindEvents();
    
    if (this.options.autoFocus) {
      this.show();
    }
  }
  
  /**
   * 创建面板DOM
   * @private
   */
  createPanel() {
    this.panelElement = document.createElement('div');
    this.panelElement.className = `quick-add-panel ${this.options.position}`;
    this.panelElement.innerHTML = `
      <input type="text" placeholder="物品名称" class="quick-add-name" autofocus>
      <input type="number" placeholder="购买价格" class="quick-add-price" step="0.01">
      <div class="quick-add-actions">
        <button class="quick-add-submit">添加</button>
        <button class="quick-add-expand">更多选项 ▼</button>
      </div>
    `;
    
    this.container.appendChild(this.panelElement);
    
    this.nameInput = this.panelElement.querySelector('.quick-add-name');
    this.priceInput = this.panelElement.querySelector('.quick-add-price');
  }
  
  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    // 提交按钮点击
    this.panelElement.querySelector('.quick-add-submit').addEventListener('click', () => {
      this.handleSubmit();
    });
    
    // 展开按钮点击
    this.panelElement.querySelector('.quick-add-expand').addEventListener('click', () => {
      this.handleExpand();
    });
    
    // Enter键提交
    this.panelElement.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleSubmit();
      }
    });
    
    // Escape键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });
  }
  
  /**
   * 显示面板
   */
  show() {
    this.panelElement.classList.add('visible');
    this.isOpen = true;
    
    if (this.options.autoFocus) {
      this.nameInput.focus();
    }
    
    // 触发显示事件
    this.container.dispatchEvent(new CustomEvent('quickadd:show'));
  }
  
  /**
   * 隐藏面板
   */
  hide() {
    this.panelElement.classList.remove('visible');
    this.isOpen = false;
    this.reset();
    
    // 触发隐藏事件
    this.container.dispatchEvent(new CustomEvent('quickadd:hide'));
  }
  
  /**
   * 切换面板显示状态
   */
  toggle() {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  /**
   * 处理提交
   * @private
   */
  handleSubmit() {
    const name = this.nameInput.value.trim();
    const price = parseFloat(this.priceInput.value);
    
    // 验证输入
    if (!name) {
      this.nameInput.classList.add('error');
      this.nameInput.focus();
      return;
    }
    
    if (isNaN(price) || price <= 0) {
      this.priceInput.classList.add('error');
      this.priceInput.focus();
      return;
    }
    
    // 移除错误状态
    this.nameInput.classList.remove('error');
    this.priceInput.classList.remove('error');
    
    // 调用提交回调
    if (this.options.onSubmit) {
      this.options.onSubmit({ name, price });
    }
    
    // 清空输入
    this.reset();
    
    // 聚焦到名称输入
    this.nameInput.focus();
  }
  
  /**
   * 处理展开详情
   * @private
   */
  handleExpand() {
    const name = this.nameInput.value.trim();
    const price = parseFloat(this.priceInput.value);
    
    // 调用展开回调
    if (this.options.onExpand) {
      this.options.onExpand({ name, price });
    }
    
    // 隐藏快速添加面板
    this.hide();
  }
  
  /**
   * 重置表单
   * @private
   */
  reset() {
    this.nameInput.value = '';
    this.priceInput.value = '';
    this.nameInput.classList.remove('error');
    this.priceInput.classList.remove('error');
  }
  
  /**
   * 设置提交回调
   * @param {Function} callback - 提交回调函数
   */
  onsubmit(callback) {
    this.options.onSubmit = callback;
  }
  
  /**
   * 设置展开回调
   * @param {Function} callback - 展开回调函数
   */
  onexpand(callback) {
    this.options.onExpand = callback;
  }
  
  /**
   * 销毁组件
   */
  destroy() {
    if (this.panelElement && this.panelElement.parentNode) {
      this.panelElement.parentNode.removeChild(this.panelElement);
    }
    
    this.panelElement = null;
    this.nameInput = null;
    this.priceInput = null;
  }
}
```

#### 4.3.2 InlineEditor（内联编辑组件）

```javascript
/**
 * 内联编辑器组件
 * @class InlineEditor
 */
class InlineEditor {
  /**
   * 创建内联编辑器实例
   * @param {HTMLElement} element - 要编辑的元素
   * @param {Object} options - 配置选项
   * @param {string} options.type - 编辑类型：'text' | 'select' | 'textarea'
   * @param {Array} options.options - 下拉选项（type为select时）
   * @param {Function} options.onSave - 保存回调函数
   * @param {Function} options.onCancel - 取消回调函数
   * @param {boolean} options.editOnClick - 是否点击即编辑，默认true
   * @param {string} options.saveOn - 保存时机：'blur' | 'enter' | 'manual'
   */
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      type: 'text',
      editOnClick: true,
      saveOn: 'blur',
      ...options
    };
    
    this.isEditing = false;
    this.originalValue = this.element.textContent;
    this.editorElement = null;
    
    this.init();
  }
  
  /**
   * 初始化组件
   * @private
   */
  init() {
    if (this.options.editOnClick) {
      this.element.addEventListener('click', () => this.startEditing());
    }
    
    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('role', 'textbox');
    this.element.setAttribute('aria-label', '可编辑字段');
  }
  
  /**
   * 开始编辑
   */
  startEditing() {
    if (this.isEditing) return;
    
    this.isEditing = true;
    this.originalValue = this.element.textContent;
    
    // 创建编辑器
    this.createEditor();
    
    // 添加编辑状态类
    this.element.classList.add('editing');
    
    // 触发开始编辑事件
    this.element.dispatchEvent(new CustomEvent('inlineedit:start'));
  }
  
  /**
   * 创建编辑器
   * @private
   */
  createEditor() {
    this.editorElement = document.createElement('div');
    this.editorElement.className = 'inline-editor';
    
    let editorHtml = '';
    
    switch (this.options.type) {
      case 'text':
        editorHtml = `
          <input type="text" class="inline-edit-input" value="${this.escapeHtml(this.originalValue)}">
          <div class="inline-edit-actions">
            <button class="inline-save-btn" title="保存">✓</button>
            <button class="inline-cancel-btn" title="取消">✗</button>
          </div>
        `;
        break;
        
      case 'textarea':
        editorHtml = `
          <textarea class="inline-edit-textarea">${this.escapeHtml(this.originalValue)}</textarea>
          <div class="inline-edit-actions">
            <button class="inline-save-btn" title="保存">✓</button>
            <button class="inline-cancel-btn" title="取消">✗</button>
          </div>
        `;
        break;
        
      case 'select':
        const optionsHtml = this.options.options.map(opt => 
          `<option value="${opt.value}" ${opt.value === this.originalValue ? 'selected' : ''}>
            ${opt.label}
          </option>`
        ).join('');
        
        editorHtml = `
          <select class="inline-edit-select">${optionsHtml}</select>
          <div class="inline-edit-actions">
            <button class="inline-save-btn" title="保存">✓</button>
            <button class="inline-cancel-btn" title="取消">✗</button>
          </div>
        `;
        break;
    }
    
    this.editorElement.innerHTML = editorHtml;
    
    // 插入到元素后面
    this.element.parentNode.insertBefore(this.editorElement, this.element.nextSibling);
    
    // 绑定事件
    this.bindEditorEvents();
    
    // 聚焦到输入框
    const input = this.editorElement.querySelector('input, textarea, select');
    if (input) {
      input.focus();
      
      // 如果是文本输入，选中所有文本
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        input.select();
      }
    }
  }
  
  /**
   * 绑定编辑器事件
   * @private
   */
  bindEditorEvents() {
    const input = this.editorElement.querySelector('input, textarea, select');
    const saveBtn = this.editorElement.querySelector('.inline-save-btn');
    const cancelBtn = this.editorElement.querySelector('.inline-cancel-btn');
    
    // 保存按钮
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.save();
    });
    
    // 取消按钮
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancel();
    });
    
    // 键盘事件
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.options.saveOn === 'enter') {
        e.preventDefault();
        this.save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
      }
    });
    
    // 失焦事件
    if (this.options.saveOn === 'blur') {
      input.addEventListener('blur', (e) => {
        // 延迟处理，避免点击保存/取消按钮时触发
        setTimeout(() => {
          if (this.isEditing && !this.editorElement.contains(document.activeElement)) {
            this.save();
          }
        }, 100);
      });
    }
  }
  
  /**
   * 保存编辑
   */
  save() {
    if (!this.isEditing) return;
    
    const input = this.editorElement.querySelector('input, textarea, select');
    const newValue = input.value;
    
    // 验证值是否改变
    if (newValue !== this.originalValue) {
      // 调用保存回调
      if (this.options.onSave) {
        const result = this.options.onSave(newValue, this.originalValue);
        
        // 如果回调返回false，阻止保存
        if (result === false) {
          return;
        }
      }
      
      // 更新显示值
      this.element.textContent = newValue;
    }
    
    this.finishEditing();
    
    // 触发保存事件
    this.element.dispatchEvent(new CustomEvent('inlineedit:save', {
      detail: { newValue, oldValue: this.originalValue }
    }));
  }
  
  /**
   * 取消编辑
   */
  cancel() {
    if (!this.isEditing) return;
    
    // 恢复原始值
    this.element.textContent = this.originalValue;
    
    this.finishEditing();
    
    // 触发取消事件
    this.element.dispatchEvent(new CustomEvent('inlineedit:cancel'));
  }
  
  /**
   * 完成编辑
   * @private
   */
  finishEditing() {
    this.isEditing = false;
    
    // 移除编辑器
    if (this.editorElement && this.editorElement.parentNode) {
      this.editorElement.parentNode.removeChild(this.editorElement);
    }
    
    this.editorElement = null;
    
    // 移除编辑状态类
    this.element.classList.remove('editing');
    
    // 重新聚焦到元素
    this.element.focus();
  }
  
  /**
   * 获取当前值
   * @returns {string} 当前值
   */
  getValue() {
    if (this.isEditing) {
      const input = this.editorElement.querySelector('input, textarea, select');
      return input.value;
    }
    return this.element.textContent;
  }
  
  /**
   * 设置值
   * @param {string} value - 要设置的值
   */
  setValue(value) {
    this.element.textContent = value;
    this.originalValue = value;
  }
  
  /**
   * 转义HTML
   * @private
   * @param {string} str - 要转义的字符串
   * @returns {string} 转义后的字符串
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  /**
   * 销毁组件
   */
  destroy() {
    if (this.isEditing) {
      this.cancel();
    }
    
    if (this.editorElement && this.editorElement.parentNode) {
      this.editorElement.parentNode.removeChild(this.editorElement);
    }
    
    this.element.removeAttribute('tabindex');
    this.element.removeAttribute('role');
    this.element.removeAttribute('aria-label');
  }
}
```

#### 4.3.3 BatchToolbar（批量操作组件）

```javascript
/**
 * 批量操作工具栏组件
 * @class BatchToolbar
 */
class BatchToolbar {
  /**
   * 创建批量操作工具栏实例
   * @param {HTMLElement} container - 容器元素
   * @param {Object} options - 配置选项
   * @param {Function} options.onStatusChange - 状态变更回调
   * @param {Function} options.onDelete - 删除回调
   * @param {Function} options.onCancel - 取消回调
   * @param {Array} options.statusOptions - 可选状态列表
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      statusOptions: [
        { value: 'active', label: '使用中' },
        { value: 'broken', label: '已损坏' },
        { value: 'sold', label: '已回血' }
      ],
      ...options
    };
    
    this.isActive = false;
    this.selectedIds = new Set();
    this.toolbarElement = null;
    
    this.init();
  }
  
  /**
   * 初始化组件
   * @private
   */
  init() {
    this.createToolbar();
    this.bindEvents();
  }
  
  /**
   * 创建工具栏DOM
   * @private
   */
  createToolbar() {
    this.toolbarElement = document.createElement('div');
    this.toolbarElement.className = 'batch-toolbar';
    this.toolbarElement.setAttribute('data-active', 'false');
    
    this.toolbarElement.innerHTML = `
      <div class="batch-info">
        <span class="selected-count">0</span> 项已选择
      </div>
      <div class="batch-actions">
        <div class="batch-status-dropdown">
          <button class="batch-status-btn">批量状态变更</button>
          <div class="batch-status-menu">
            ${this.options.statusOptions.map(opt => 
              `<button class="batch-status-option" data-value="${opt.value}">${opt.label}</button>`
            ).join('')}
          </div>
        </div>
        <button class="batch-delete-btn">批量删除</button>
        <button class="batch-cancel-btn">取消</button>
      </div>
    `;
    
    this.container.appendChild(this.toolbarElement);
    
    // 获取元素引用
    this.countElement = this.toolbarElement.querySelector('.selected-count');
    this.statusBtn = this.toolbarElement.querySelector('.batch-status-btn');
    this.statusMenu = this.toolbarElement.querySelector('.batch-status-menu');
    this.deleteBtn = this.toolbarElement.querySelector('.batch-delete-btn');
    this.cancelBtn = this.toolbarElement.querySelector('.batch-cancel-btn');
  }
  
  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    // 状态下拉按钮
    this.statusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleStatusMenu();
    });
    
    // 状态选项点击
    this.statusMenu.addEventListener('click', (e) => {
      const option = e.target.closest('.batch-status-option');
      if (option) {
        const status = option.dataset.value;
        this.handleStatusChange(status);
        this.hideStatusMenu();
      }
    });
    
    // 删除按钮
    this.deleteBtn.addEventListener('click', () => {
      this.handleDelete();
    });
    
    // 取消按钮
    this.cancelBtn.addEventListener('click', () => {
      this.deactivate();
      if (this.options.onCancel) {
        this.options.onCancel();
      }
    });
    
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
      this.hideStatusMenu();
    });
  }
  
  /**
   * 激活批量操作模式
   * @param {Array} selectedIds - 初始选中的ID列表
   */
  activate(selectedIds = []) {
    this.isActive = true;
    this.selectedIds = new Set(selectedIds);
    
    this.toolbarElement.setAttribute('data-active', 'true');
    this.updateCount();
    
    // 触发激活事件
    this.container.dispatchEvent(new CustomEvent('batch:activate', {
      detail: { selectedIds: Array.from(this.selectedIds) }
    }));
  }
  
  /**
   * 停用批量操作模式
   */
  deactivate() {
    this.isActive = false;
    this.selectedIds.clear();
    
    this.toolbarElement.setAttribute('data-active', 'false');
    this.updateCount();
    this.hideStatusMenu();
    
    // 触发停用事件
    this.container.dispatchEvent(new CustomEvent('batch:deactivate'));
  }
  
  /**
   * 选择项目
   * @param {string} id - 项目ID
   */
  select(id) {
    if (!this.isActive) return;
    
    this.selectedIds.add(id);
    this.updateCount();
    
    // 触发选择事件
    this.container.dispatchEvent(new CustomEvent('batch:select', {
      detail: { id, selectedIds: Array.from(this.selectedIds) }
    }));
  }
  
  /**
   * 取消选择项目
   * @param {string} id - 项目ID
   */
  deselect(id) {
    if (!this.isActive) return;
    
    this.selectedIds.delete(id);
    this.updateCount();
    
    // 触发取消选择事件
    this.container.dispatchEvent(new CustomEvent('batch:deselect', {
      detail: { id, selectedIds: Array.from(this.selectedIds) }
    }));
  }
  
  /**
   * 切换项目选择状态
   * @param {string} id - 项目ID
   */
  toggleSelection(id) {
    if (this.selectedIds.has(id)) {
      this.deselect(id);
    } else {
      this.select(id);
    }
  }
  
  /**
   * 全选
   * @param {Array} ids - 所有可选ID
   */
  selectAll(ids) {
    if (!this.isActive) return;
    
    this.selectedIds = new Set(ids);
    this.updateCount();
    
    // 触发全选事件
    this.container.dispatchEvent(new CustomEvent('batch:selectall', {
      detail: { selectedIds: Array.from(this.selectedIds) }
    }));
  }
  
  /**
   * 取消全选
   */
  deselectAll() {
    if (!this.isActive) return;
    
    this.selectedIds.clear();
    this.updateCount();
    
    // 触发取消全选事件
    this.container.dispatchEvent(new CustomEvent('batch:deselectall'));
  }
  
  /**
   * 更新选中计数
   * @private
   */
  updateCount() {
    this.countElement.textContent = this.selectedIds.size;
    
    // 更新按钮状态
    const hasSelection = this.selectedIds.size > 0;
    this.statusBtn.disabled = !hasSelection;
    this.deleteBtn.disabled = !hasSelection;
  }
  
  /**
   * 切换状态下拉菜单
   * @private
   */
  toggleStatusMenu() {
    const isVisible = this.statusMenu.classList.contains('visible');
    if (isVisible) {
      this.hideStatusMenu();
    } else {
      this.showStatusMenu();
    }
  }
  
  /**
   * 显示状态下拉菜单
   * @private
   */
  showStatusMenu() {
    this.statusMenu.classList.add('visible');
    this.statusBtn.classList.add('active');
  }
  
  /**
   * 隐藏状态下拉菜单
   * @private
   */
  hideStatusMenu() {
    this.statusMenu.classList.remove('visible');
    this.statusBtn.classList.remove('active');
  }
  
  /**
   * 处理状态变更
   * @private
   * @param {string} status - 新状态
   */
  handleStatusChange(status) {
    if (this.selectedIds.size === 0) return;
    
    // 调用状态变更回调
    if (this.options.onStatusChange) {
      this.options.onStatusChange(Array.from(this.selectedIds), status);
    }
    
    // 触发状态变更事件
    this.container.dispatchEvent(new CustomEvent('batch:statuschange', {
      detail: {
        selectedIds: Array.from(this.selectedIds),
        status
      }
    }));
  }
  
  /**
   * 处理删除
   * @private
   */
  handleDelete() {
    if (this.selectedIds.size === 0) return;
    
    // 确认删除
    const confirmed = confirm(`确定要删除选中的 ${this.selectedIds.size} 个项目吗？`);
    if (!confirmed) return;
    
    // 调用删除回调
    if (this.options.onDelete) {
      this.options.onDelete(Array.from(this.selectedIds));
    }
    
    // 触发删除事件
    this.container.dispatchEvent(new CustomEvent('batch:delete', {
      detail: {
        selectedIds: Array.from(this.selectedIds)
      }
    }));
  }
  
  /**
   * 获取选中的ID列表
   * @returns {Array} 选中的ID数组
   */
  getSelectedIds() {
    return Array.from(this.selectedIds);
  }
  
  /**
   * 检查是否激活
   * @returns {boolean} 是否激活
   */
  isBatchActive() {
    return this.isActive;
  }
  
  /**
   * 销毁组件
   */
  destroy() {
    if (this.toolbarElement && this.toolbarElement.parentNode) {
      this.toolbarElement.parentNode.removeChild(this.toolbarElement);
    }
    
    this.toolbarElement = null;
    this.countElement = null;
    this.statusBtn = null;
    this.statusMenu = null;
    this.deleteBtn = null;
    this.cancelBtn = null;
  }
}
```

#### 4.3.4 ToastManager（通知管理组件）

```javascript
/**
 * Toast通知管理器
 * @class ToastManager
 */
class ToastManager {
  /**
   * 创建Toast管理器实例
   * @param {Object} options - 配置选项
   * @param {number} options.duration - 显示时长（毫秒），默认3000
   * @param {number} options.maxToasts - 最大同时显示数量，默认5
   * @param {string} options.position - 显示位置：'bottom-center' | 'top-right' | 'bottom-right'
   * @param {boolean} options.pauseOnHover - 鼠标悬停时是否暂停，默认true
   */
  constructor(options = {}) {
    this.options = {
      duration: 3000,
      maxToasts: 5,
      position: 'bottom-center',
      pauseOnHover: true,
      ...options
    };
    
    this.toasts = [];
    this.container = null;
    
    this.init();
  }
  
  /**
   * 初始化组件
   * @private
   */
  init() {
    this.createContainer();
    this.bindEvents();
  }
  
  /**
   * 创建容器
   * @private
   */
  createContainer() {
    this.container = document.createElement('div');
    this.container.className = `toast-container ${this.options.position}`;
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'true');
    
    document.body.appendChild(this.container);
  }
  
  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    // 监听鼠标悬停
    if (this.options.pauseOnHover) {
      this.container.addEventListener('mouseenter', () => {
        this.pauseAll();
      });
      
      this.container.addEventListener('mouseleave', () => {
        this.resumeAll();
      });
    }
  }
  
  /**
   * 显示Toast通知
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型：'success' | 'error' | 'warning' | 'info'
   * @param {Object} options - 可选配置
   * @param {number} options.duration - 自定义显示时长
   * @param {string} options.icon - 自定义图标
   * @param {boolean} options.closable - 是否可关闭，默认true
   * @param {Function} options.onClick - 点击回调
   * @param {Function} options.onClose - 关闭回调
   * @returns {Object} Toast实例
   */
  show(message, type = 'info', options = {}) {
    // 检查是否超过最大数量
    if (this.toasts.length >= this.options.maxToasts) {
      this.removeOldest();
    }
    
    const toastOptions = {
      duration: this.options.duration,
      closable: true,
      ...options
    };
    
    // 创建Toast
    const toast = this.createToast(message, type, toastOptions);
    
    // 添加到容器
    this.container.appendChild(toast.element);
    
    // 添加到列表
    this.toasts.push(toast);
    
    // 触发动画
    requestAnimationFrame(() => {
      toast.element.classList.add('show');
    });
    
    // 设置自动关闭
    if (toastOptions.duration > 0) {
      toast.timer = setTimeout(() => {
        this.remove(toast.id);
      }, toastOptions.duration);
    }
    
    return toast;
  }
  
  /**
   * 创建Toast元素
   * @private
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型
   * @param {Object} options - 配置选项
   * @returns {Object} Toast对象
   */
  createToast(message, type, options) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const element = document.createElement('div');
    element.id = id;
    element.className = `toast ${type}`;
    element.setAttribute('role', 'alert');
    
    // 图标
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };
    
    const icon = options.icon || icons[type] || icons.info;
    
    element.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${this.escapeHtml(message)}</span>
        ${options.closable ? '<button class="toast-close" aria-label="关闭">×</button>' : ''}
      </div>
      ${options.duration > 0 ? '<div class="toast-progress"></div>' : ''}
    `;
    
    // 绑定事件
    this.bindToastEvents(element, id, options);
    
    // 进度条动画
    if (options.duration > 0) {
      const progress = element.querySelector('.toast-progress');
      if (progress) {
        progress.style.animationDuration = `${options.duration}ms`;
      }
    }
    
    return {
      id,
      element,
      timer: null,
      paused: false,
      startTime: Date.now(),
      remainingTime: options.duration
    };
  }
  
  /**
   * 绑定Toast事件
   * @private
   * @param {HTMLElement} element - Toast元素
   * @param {string} id - Toast ID
   * @param {Object} options - 配置选项
   */
  bindToastEvents(element, id, options) {
    // 关闭按钮
    const closeBtn = element.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(id);
      });
    }
    
    // 点击事件
    if (options.onClick) {
      element.addEventListener('click', () => {
        options.onClick();
        this.remove(id);
      });
      element.style.cursor = 'pointer';
    }
    
    // 鼠标悬停暂停
    if (this.options.pauseOnHover) {
      element.addEventListener('mouseenter', () => {
        this.pause(id);
      });
      
      element.addEventListener('mouseleave', () => {
        this.resume(id);
      });
    }
  }
  
  /**
   * 移除Toast
   * @param {string} id - Toast ID
   */
  remove(id) {
    const index = this.toasts.findIndex(toast => toast.id === id);
    if (index === -1) return;
    
    const toast = this.toasts[index];
    
    // 清除定时器
    if (toast.timer) {
      clearTimeout(toast.timer);
    }
    
    // 触发关闭回调
    if (toast.options && toast.options.onClose) {
      toast.options.onClose();
    }
    
    // 添加退出动画
    toast.element.classList.add('hide');
    
    // 动画结束后移除元素
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
    }, 300); // 匹配CSS动画时长
    
    // 从列表中移除
    this.toasts.splice(index, 1);
  }
  
  /**
   * 移除最旧的Toast
   * @private
   */
  removeOldest() {
    if (this.toasts.length > 0) {
      this.remove(this.toasts[0].id);
    }
  }
  
  /**
   * 暂停Toast计时器
   * @param {string} id - Toast ID
   */
  pause(id) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast || toast.paused) return;
    
    toast.paused = true;
    
    // 清除定时器
    if (toast.timer) {
      clearTimeout(toast.timer);
      toast.timer = null;
    }
    
    // 计算剩余时间
    const elapsed = Date.now() - toast.startTime;
    toast.remainingTime = Math.max(0, toast.remainingTime - elapsed);
    
    // 暂停进度条动画
    const progress = toast.element.querySelector('.toast-progress');
    if (progress) {
      progress.style.animationPlayState = 'paused';
    }
  }
  
  /**
   * 恢复Toast计时器
   * @param {string} id - Toast ID
   */
  resume(id) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast || !toast.paused) return;
    
    toast.paused = false;
    toast.startTime = Date.now();
    
    // 设置新的定时器
    if (toast.remainingTime > 0) {
      toast.timer = setTimeout(() => {
        this.remove(toast.id);
      }, toast.remainingTime);
    }
    
    // 恢复进度条动画
    const progress = toast.element.querySelector('.toast-progress');
    if (progress) {
      progress.style.animationPlayState = 'running';
    }
  }
  
  /**
   * 暂停所有Toast
   */
  pauseAll() {
    this.toasts.forEach(toast => {
      this.pause(toast.id);
    });
  }
  
  /**
   * 恢复所有Toast
   */
  resumeAll() {
    this.toasts.forEach(toast => {
      this.resume(toast.id);
    });
  }
  
  /**
   * 清除所有Toast
   */
  clearAll() {
    const toastIds = this.toasts.map(t => t.id);
    toastIds.forEach(id => this.remove(id));
  }
  
  /**
   * 显示成功消息
   * @param {string} message - 消息内容
   * @param {Object} options - 可选配置
   * @returns {Object} Toast实例
   */
  success(message, options = {}) {
    return this.show(message, 'success', options);
  }
  
  /**
   * 显示错误消息
   * @param {string} message - 消息内容
   * @param {Object} options - 可选配置
   * @returns {Object} Toast实例
   */
  error(message, options = {}) {
    return this.show(message, 'error', { duration: 5000, ...options });
  }
  
  /**
   * 显示警告消息
   * @param {string} message - 消息内容
   * @param {Object} options - 可选配置
   * @returns {Object} Toast实例
   */
  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }
  
  /**
   * 显示信息消息
   * @param {string} message - 消息内容
   * @param {Object} options - 可选配置
   * @returns {Object} Toast实例
   */
  info(message, options = {}) {
    return this.show(message, 'info', options);
  }
  
  /**
   * 转义HTML
   * @private
   * @param {string} str - 要转义的字符串
   * @returns {string} 转义后的字符串
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  /**
   * 销毁组件
   */
  destroy() {
    // 清除所有Toast
    this.clearAll();
    
    // 移除容器
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.container = null;
    this.toasts = [];
  }
}

// 使用示例
const toastManager = new ToastManager({
  duration: 3000,
  maxToasts: 5,
  position: 'bottom-center'
});

// 显示不同类型的消息
toastManager.success('操作成功！');
toastManager.error('操作失败，请重试');
toastManager.warning('请注意');
toastManager.info('这是一条信息');
```

### 4.3 反馈系统设计

#### Toast通知系统

```css
/* Toast通知样式 */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: var(--bg-elevated);
  color: var(--text-color);
  padding: 12px 24px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
}

.toast.show {
  transform: translateX(-50%) translateY(0);
}

.toast.success {
  border-left: 4px solid var(--success);
}

.toast.error {
  border-left: 4px solid var(--danger);
}

.toast.info {
  border-left: 4px solid var(--info);
}
```

#### 加载状态指示器

```css
/* 骨架屏加载状态 */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-surface) 25%,
    var(--bg-elevated) 50%,
    var(--bg-surface) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 8px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 进度指示器 */
.progress-bar {
  height: 3px;
  background: var(--primary);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  transition: width 0.3s ease;
}
```

---

## 五、响应式设计策略

### 5.1 断点系统

```css
/* 响应式断点 */
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}

/* 移动优先策略 */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

### 5.2 跨设备交互一致性

| 交互类型 | 移动端 | 桌面端 |
|---------|--------|--------|
| 添加资产 | 底部浮动按钮 + 全屏表单 | 侧边面板 + 内联表单 |
| 编辑资产 | 左滑显示操作按钮 | 右键上下文菜单 |
| 批量操作 | 长按进入多选模式 | 复选框 + 工具栏 |
| 状态切换 | 快速操作按钮 | 内联下拉选择 |
| 删除确认 | 底部弹出确认 | 模态对话框 |

### 5.3 移动端手势规范

```javascript
// 手势识别配置
const gestureConfig = {
  swipeThreshold: 50,      // 滑动触发阈值（px）
  swipeVelocity: 0.3,      // 滑动速度阈值
  longPressDelay: 500,     // 长按延迟（ms）
  doubleTapDelay: 300,     // 双击延迟（ms）
};

// 左滑：显示删除/编辑操作
// 右滑：标记状态/收藏
// 长按：进入多选模式
// 双击：快速编辑
```

---

## 六、视觉层次与内容优先级

### 6.1 信息层次体系

```
Level 1: 页面标题 + 核心数据（日均总成本）
  └── 视觉权重：最大字号、最高对比度、品牌色

Level 2: 区域标题 + 关键指标
  └── 视觉权重：次大字号、次要对比度

Level 3: 列表项 + 次要信息
  └── 视觉权重：标准字号、标准对比度

Level 4: 辅助信息 + 元数据
  └── 视觉权重：小字号、低对比度
```

### 6.2 内容优先级矩阵

| 内容类型 | 优先级 | 显示位置 | 视觉处理 |
|---------|--------|---------|---------|
| 日均总成本 | P0 | 顶部仪表盘 | 大字号、品牌色、动画 |
| 资产列表 | P0 | 主内容区 | 卡片式、清晰层次 |
| 快速操作 | P1 | 浮动按钮/工具栏 | 高对比度、易触达 |
| 筛选排序 | P2 | 折叠工具栏 | 次要视觉权重 |
| 详细统计 | P2 | 统计页面 | 图表可视化 |
| TOTP管理 | P3 | 二级菜单 | 收纳式设计 |
| 回收站 | P3 | 设置/二级菜单 | 低频访问 |

---

## 七、无障碍设计规范

### 7.1 WCAG 2.1 AA 合规要求

```css
/* 对比度要求 */
:root {
  /* 正文文本：最小4.5:1对比度 */
  --text-primary-contrast: 4.5;
  
  /* 大文本：最小3:1对比度 */
  --text-large-contrast: 3;
  
  /* 交互元素：最小3:1对比度 */
  --interactive-contrast: 3;
}

/* 焦点指示器 */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* 触摸目标尺寸 */
.touch-target {
  min-width: 44px;
  min-height: 44px;
}
```

### 7.2 键盘导航支持

```javascript
// 键盘快捷键规划
const keyboardShortcuts = {
  'ctrl+n': '添加新资产',
  'ctrl+f': '聚焦搜索框',
  'ctrl+s': '保存当前编辑',
  'Escape': '关闭弹窗/取消操作',
  'Delete': '删除选中项（需确认）',
  'ArrowUp/Down': '列表导航',
  'Enter': '确认/打开',
  'Space': '选择/切换',
};
```

### 7.3 屏幕阅读器支持

```html
<!-- ARIA标签规范 -->
<button aria-label="添加新资产记录" aria-describedby="add-help">
  <span aria-hidden="true">+</span>
</button>
<div id="add-help" class="sr-only">
  点击打开添加资产表单
</div>

<!-- 实时区域更新 -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
  <!-- 操作反馈会在这里宣布 -->
</div>
```

---

## 八、实施路线图

### 阶段一：基础架构重构（1-2周）

**目标**：建立新的导航体系和基础组件

- [ ] 重构主导航为三层架构
- [ ] 创建Toast通知系统
- [ ] 实现加载状态指示器
- [ ] 建立响应式断点系统
- [ ] 优化移动端手势处理

**交付物**：
- 新的导航组件
- Toast通知组件
- 骨架屏组件
- 响应式工具类

### 阶段二：核心流程优化（2-3周）

**目标**：优化添加、编辑、删除等核心流程

- [ ] 实现快速添加模式
- [ ] 开发内联编辑功能
- [ ] 构建批量操作系统
- [ ] 优化级联处理流程
- [ ] 完善反馈机制

**交付物**：
- 快速添加组件
- 内联编辑组件
- 批量操作工具栏
- 确认对话框系统

### 阶段三：体验增强（1-2周）

**目标**：提升视觉体验和交互细节

- [ ] 添加微交互动画
- [ ] 实现渐进式披露
- [ ] 优化错误处理和提示
- [ ] 完善无障碍支持
- [ ] 性能优化

**交付物**：
- 动画库
- 错误边界组件
- 无障碍测试报告
- 性能优化报告

### 阶段四：测试与迭代（1周）

**目标**：验证设计效果，收集反馈

- [ ] 用户测试（5-8名目标用户）
- [ ] A/B测试关键流程
- [ ] 收集使用数据
- [ ] 迭代优化

**交付物**：
- 用户测试报告
- A/B测试结果
- 优化建议文档

---

## 九、成功指标

### 9.1 用户体验指标

| 指标 | 当前基线 | 目标值 | 测量方法 |
|------|---------|--------|---------|
| 任务完成率 | 75% | 95% | 用户测试 |
| 平均任务时间 | 45秒 | 20秒 | 行为分析 |
| 错误率 | 15% | 5% | 错误日志 |
| 用户满意度 | 3.5/5 | 4.5/5 | 问卷调查 |

### 9.2 技术性能指标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 首次内容绘制(FCP) | 2.5秒 | 1.5秒 |
| 最大内容绘制(LCP) | 4秒 | 2.5秒 |
| 累积布局偏移(CLS) | 0.15 | 0.1 |
| 首次输入延迟(FID) | 150ms | 100ms |

---

## 十一、安全加固设计

### 11.1 文件上传安全

#### 11.1.1 文件内容验证

```javascript
// 文件魔数（Magic Number）验证
const FILE_SIGNATURES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46]
};

function validateFileSignature(file, expectedMimeType) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const uint8Array = new Uint8Array(e.target.result);
      const signature = FILE_SIGNATURES[expectedMimeType];
      
      if (!signature) {
        reject(new Error('不支持的文件类型'));
        return;
      }
      
      // 检查前N个字节是否匹配
      for (let i = 0; i < signature.length; i++) {
        if (uint8Array[i] !== signature[i]) {
          reject(new Error('文件签名不匹配'));
          return;
        }
      }
      
      resolve(true);
    };
    reader.readAsArrayBuffer(file.slice(0, 16)); // 只读取前16字节
  });
}
```

#### 11.1.2 文件上传安全策略

| 检查项 | 要求 | 实现方式 |
|--------|------|---------|
| 文件类型 | 仅允许 JPEG, PNG, GIF, WebP | 扩展名 + MIME类型 + 魔数验证 |
| 文件大小 | 最大 2MB | 前端预检查 + 后端验证 |
| 文件内容 | 无恶意代码 | 后端文件内容扫描（可选） |
| 文件名 | 清除特殊字符 | 正则过滤，保留字母数字和连字符 |

```javascript
// 后端文件验证中间件
const fileUploadSecurity = (req, res, next) => {
  if (!req.file) {
    return next();
  }
  
  // 1. 文件大小检查
  if (req.file.size > 2 * 1024 * 1024) {
    return res.status(400).json({ error: '文件大小不能超过2MB' });
  }
  
  // 2. MIME类型检查
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedMimes.includes(req.file.mimetype)) {
    return res.status(400).json({ error: '不支持的文件类型' });
  }
  
  // 3. 文件扩展名检查
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return res.status(400).json({ error: '不支持的文件扩展名' });
  }
  
  // 4. 文件名清理
  const sanitizedFilename = `avatar_${Date.now()}${ext}`;
  req.file.filename = sanitizedFilename;
  
  next();
};
```

### 11.2 权限控制设计

#### 11.2.1 RBAC 角色权限模型

```javascript
// 角色权限定义
const ROLES = {
  USER: 'user',
  ADMIN: 'admin'
};

const PERMISSIONS = {
  // 用户权限
  USER: [
    'asset:read',
    'asset:create',
    'asset:update',
    'asset:delete',
    'profile:read',
    'profile:update'
  ],
  // 管理员权限（包含用户所有权限）
  ADMIN: [
    'asset:read',
    'asset:create',
    'asset:update',
    'asset:delete',
    'profile:read',
    'profile:update',
    'user:read',
    'user:update',
    'user:delete',
    'user:disable',
    'admin:access',
    'log:read'
  ]
};

// 权限检查中间件
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }
    
    const userRole = req.user.role || ROLES.USER;
    const userPermissions = PERMISSIONS[userRole] || [];
    
    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({ error: '权限不足' });
    }
    
    next();
  };
};
```

#### 11.2.2 后端API权限验证中间件

```javascript
// 路由级别的权限保护
const adminRoutes = express.Router();

// 所有管理路由都需要认证和管理员权限
adminRoutes.use(authenticateToken);
adminRoutes.use(checkPermission('admin:access'));

// 具体路由的细粒度权限
adminRoutes.get('/users', checkPermission('user:read'), async (req, res) => {
  // ... 获取用户列表
});

adminRoutes.put('/user/:id/disable', checkPermission('user:disable'), async (req, res) => {
  // ... 禁用/启用用户
});
```

#### 11.2.3 管理面板后端路由保护

```javascript
// Express路由配置
app.use('/api/admin', adminRoutes);

// 静态文件保护（可选，前端已有JS检查）
app.get('/admin', authenticateToken, checkPermission('admin:access'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
```

### 11.3 XSS/CSRF防护

#### 11.3.1 XSS防护策略

```javascript
// 输入过滤中间件
const xssProtection = (req, res, next) => {
  // 1. 对所有字符串输入进行HTML实体编码
  const sanitizeObject = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  };
  
  // 对请求体进行清理
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // 对查询参数进行清理
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

// 响应头安全设置
app.use((req, res, next) => {
  // 防止MIME类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY');
  
  // 启用XSS过滤
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
});
```

#### 11.3.2 CSRF Token实现方案

```javascript
// CSRF Token生成和验证
const crypto = require('crypto');

const csrfProtection = {
  // 生成CSRF Token
  generateToken: (req, res, next) => {
    if (!req.session) {
      req.session = {};
    }
    
    // 生成随机token
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    
    // 将token发送到客户端
    res.cookie('csrf-token', token, {
      httpOnly: false, // 前端需要读取
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000 // 1小时
    });
    
    next();
  },
  
  // 验证CSRF Token
  validateToken: (req, res, next) => {
    // 只对POST/PUT/DELETE请求进行CSRF验证
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    
    const clientToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionToken = req.session?.csrfToken;
    
    if (!clientToken || !sessionToken || clientToken !== sessionToken) {
      return res.status(403).json({ error: 'CSRF令牌无效' });
    }
    
    next();
  }
};

// 在Express应用中使用
app.use(csrfProtection.generateToken);
app.use(csrfProtection.validateToken);
```

### 11.4 安全审计日志

```javascript
// 安全事件记录
const securityAudit = {
  logEvent: (userId, event, details, ip) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      event,
      details,
      ip,
      userAgent: req.headers['user-agent']
    };
    
    // 记录到数据库
    db.run(`
      INSERT INTO audit_logs (user_id, action, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, event, JSON.stringify(details), ip, logEntry.timestamp]);
    
    // 可选：发送到外部日志系统
    if (process.env.NODE_ENV === 'production') {
      // logger.info('Security event', logEntry);
    }
  }
};

// 在关键操作中使用
app.post('/api/auth/login', async (req, res) => {
  // ... 登录逻辑
  
  // 登录成功
  securityAudit.logEvent(user.id, 'login_success', {
    username: user.username
  }, req.ip);
});

app.post('/api/admin/user/:id/disable', async (req, res) => {
  // ... 禁用用户逻辑
  
  securityAudit.logEvent(req.user.id, 'user_disable', {
    targetUserId: req.params.id,
    disabled: true
  }, req.ip);
});
```

---

## 十、附录

### A. 设计资源

- Figma设计稿：[链接待补充]
- 组件库文档：[链接待补充]
- 交互原型：[链接待补充]

### B. 参考资料

- [Material Design 3](https://m3.material.io/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Nielsen Norman Group UX研究](https://www.nngroup.com/articles/)
- [WCAG 2.1指南](https://www.w3.org/WAI/WCAG21/quickref/)

### C. 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| 1.0 | 2026-06-25 | 初始版本，完成架构设计 | ArchitectUX |

---

**文档维护者**: ArchitectUX  
**下次评审日期**: 2026-07-02  
**联系方式**: [项目讨论区]
