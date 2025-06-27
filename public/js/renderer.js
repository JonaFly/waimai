// 获取元素
const accountList = document.getElementById('account-list');
const addAccountForm = document.getElementById('add-account-form');
const editAccountForm = document.getElementById('edit-account-form');
const refreshButton = document.getElementById('refresh-btn');
const platformSelect = document.getElementById('platform');
const editPlatformSelect = document.getElementById('edit-platform');
const saveEditButton = document.getElementById('save-edit-btn');
const searchInput = document.getElementById('search-input');
const filterPlatform = document.getElementById('filter-platform');
const filterStatus = document.getElementById('filter-status');
const totalAccountsElement = document.getElementById('total-accounts');
const onlineAccountsElement = document.getElementById('online-accounts');
const offlineAccountsElement = document.getElementById('offline-accounts');
const expiredAccountsElement = document.getElementById('expired-accounts');

// 当前选中的账号ID和账号列表
let currentAccountId = null;
let allAccounts = [];

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
  // 检查API是否存在
  if (!window.electronAPI) {
    console.error('无法访问electronAPI，请检查preload.js是否正确配置');
    showNotification('应用初始化失败: 无法连接到后端服务', 'error');
    return;
  }
  
  // 绑定标签切换事件
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      
      // 切换标签按钮状态
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // 切换内容区域
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // 绑定模态框关闭按钮
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
      });
    });
  });
  
  // 绑定保存编辑按钮
  if (saveEditButton) {
    saveEditButton.addEventListener('click', async () => {
      await saveAccountEdit();
    });
  }
  
  // 绑定搜索和筛选事件
  if (searchInput) {
    searchInput.addEventListener('input', filterAccounts);
  }
  
  if (filterPlatform) {
    filterPlatform.addEventListener('change', filterAccounts);
  }
  
  if (filterStatus) {
    filterStatus.addEventListener('change', filterAccounts);
  }
  
  // 绑定刷新按钮
  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      refreshButton.disabled = true;
      refreshButton.textContent = '刷新中...';
      
      try {
        await refreshAccountStatus();
        showNotification('刷新状态成功', 'success');
      } catch (error) {
        showNotification('刷新状态失败: ' + error.message, 'error');
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = '刷新状态';
      }
    });
  }
  
  // 绑定通知关闭按钮
  document.querySelector('.close-notification')?.addEventListener('click', () => {
    document.getElementById('notification').classList.remove('show');
  });
  
  // 监听账号状态变更通知
  window.electronAPI.onAccountStatusChanged(() => {
    loadAccounts();
  });
  
  // 监听显示账号详情通知
  window.electronAPI.onShowAccountDetails((accountId) => {
    // 查找账号并显示详情
    const accounts = document.querySelectorAll('.account-card');
    for (const card of accounts) {
      if (card.getAttribute('data-id') === accountId) {
        card.scrollIntoView({ behavior: 'smooth' });
        card.classList.add('highlight');
        setTimeout(() => {
          card.classList.remove('highlight');
        }, 2000);
        break;
      }
    }
  });
  
  // 绑定添加账号表单提交事件
  if (addAccountForm) {
    addAccountForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const accountData = {
        platform: document.getElementById('platform').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        nickname: document.getElementById('nickname').value
      };
      
      try {
        await window.electronAPI.addAccount(accountData);
        showNotification('账号添加成功', 'success');
        
        // 重置表单
        addAccountForm.reset();
        
        // 切换到账号列表标签
        document.querySelector('.tab-btn[data-tab="accounts"]').click();
        
        // 重新加载账号列表
        await loadAccounts();
      } catch (error) {
        showNotification('账号添加失败: ' + error.message, 'error');
      }
    });
  }
  
  // 绑定批量操作相关的按钮
  bindBatchOperationButtons();
  
  // 加载账号列表和平台列表
  await loadAccounts();
  await loadPlatforms();
});

// 加载账号列表
async function loadAccounts() {
  try {
    accountList.innerHTML = '<tr><td colspan="6" class="loading">加载中...</td></tr>';
    
    const accounts = await window.electronAPI.getAccounts();
    allAccounts = accounts; // 保存所有账号，用于搜索和筛选
    
    updateAccountStats(accounts);
    renderAccountList(accounts);
  } catch (error) {
    showNotification('加载账号列表失败: ' + error.message, 'error');
    accountList.innerHTML = '<tr><td colspan="6" class="error">加载失败</td></tr>';
  }
}

// 更新账号统计信息
function updateAccountStats(accounts) {
  const total = accounts.length;
  const online = accounts.filter(acc => acc.status === 'online').length;
  const offline = accounts.filter(acc => acc.status === 'offline').length;
  const expired = accounts.filter(acc => acc.status === 'expired' || acc.status === 'unknown').length;
  
  totalAccountsElement.textContent = total;
  onlineAccountsElement.textContent = online;
  offlineAccountsElement.textContent = offline;
  expiredAccountsElement.textContent = expired;
}

// 筛选账号
function filterAccounts() {
  const searchTerm = searchInput.value.toLowerCase();
  const platformFilter = filterPlatform.value;
  const statusFilter = filterStatus.value;
  
  const filteredAccounts = allAccounts.filter(account => {
    // 搜索用户名和昵称
    const matchesSearch = 
      account.username.toLowerCase().includes(searchTerm) || 
      (account.nickname && account.nickname.toLowerCase().includes(searchTerm));
    
    // 筛选平台
    const matchesPlatform = !platformFilter || account.platform === platformFilter;
    
    // 筛选状态
    const matchesStatus = !statusFilter || account.status === statusFilter;
    
    return matchesSearch && matchesPlatform && matchesStatus;
  });
  
  renderAccountList(filteredAccounts);
}

// 渲染账号列表
function renderAccountList(accounts) {
  accountList.innerHTML = '';
  
  if (accounts.length === 0) {
    accountList.innerHTML = '<tr><td colspan="7" class="empty-list">暂无账号，请添加</td></tr>';
    return;
  }
  
  accounts.forEach(account => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', account.id);
    tr.setAttribute('data-status', account.status);
    
    // 复选框
    const checkboxTd = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'account-checkbox';
    checkbox.setAttribute('data-id', account.id);
    checkbox.addEventListener('change', updateSelectAllCheckboxState);
    checkboxTd.appendChild(checkbox);
    tr.appendChild(checkboxTd);
    
    // 平台
    const platformTd = document.createElement('td');
    platformTd.textContent = getPlatformName(account.platform);
    tr.appendChild(platformTd);
    
    // 用户名
    const usernameTd = document.createElement('td');
    usernameTd.textContent = account.username;
    tr.appendChild(usernameTd);
    
    // 昵称
    const nicknameTd = document.createElement('td');
    nicknameTd.textContent = account.nickname || '-';
    tr.appendChild(nicknameTd);
    
    // 状态
    const statusTd = document.createElement('td');
    statusTd.innerHTML = getStatusBadge(account.status);
    tr.appendChild(statusTd);
    
    // 最后登录时间
    const lastLoginTd = document.createElement('td');
    if (account.lastLoginTime) {
      const loginDate = new Date(account.lastLoginTime);
      lastLoginTd.textContent = formatDate(loginDate);
    } else {
      lastLoginTd.textContent = '从未登录';
    }
    tr.appendChild(lastLoginTd);
    
    // 操作
    const actionTd = document.createElement('td');
    
    // 登录按钮
    const loginButton = document.createElement('button');
    loginButton.className = 'btn btn-sm btn-primary';
    loginButton.textContent = '登录';
    loginButton.addEventListener('click', () => loginAccount(account.id));
    actionTd.appendChild(loginButton);
    
    // 编辑按钮
    const editButton = document.createElement('button');
    editButton.className = 'btn btn-sm btn-secondary';
    editButton.textContent = '编辑';
    editButton.addEventListener('click', () => showEditForm(account));
    actionTd.appendChild(editButton);
    
    // 删除按钮
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-sm btn-danger';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', () => showDeleteConfirmation(account.id));
    actionTd.appendChild(deleteButton);
    
    tr.appendChild(actionTd);
    
    accountList.appendChild(tr);
  });
  
  // 更新平台筛选器选项
  updatePlatformFilterOptions();
  
  // 更新批量登录平台选项
  updateBatchLoginPlatformOptions();
}

// 更新平台筛选器选项
function updatePlatformFilterOptions() {
  // 已有的选项
  const existingOptions = Array.from(filterPlatform.options).map(opt => opt.value);
  
  // 获取所有平台
  const platforms = [...new Set(allAccounts.map(acc => acc.platform))];
  
  // 添加新平台
  platforms.forEach(platform => {
    if (!existingOptions.includes(platform) && platform) {
      const option = document.createElement('option');
      option.value = platform;
      option.textContent = getPlatformName(platform);
      filterPlatform.appendChild(option);
    }
  });
}

// 加载平台列表
async function loadPlatforms() {
  try {
    const platforms = [
      { id: 'meituan', name: '美团外卖' },
      { id: 'eleme', name: '饿了么' },
      { id: 'jingdong', name: '京东到家' }
    ];
    
    // 清空选项
    platformSelect.innerHTML = '<option value="">--选择平台--</option>';
    editPlatformSelect.innerHTML = '<option value="">--选择平台--</option>';
    
    // 添加平台选项
    platforms.forEach(platform => {
      const option = document.createElement('option');
      option.value = platform.id;
      option.textContent = platform.name;
      platformSelect.appendChild(option.cloneNode(true));
      editPlatformSelect.appendChild(option);
    });
  } catch (error) {
    showNotification('加载平台列表失败: ' + error.message, 'error');
  }
}

// 登录账号
async function loginAccount(accountId) {
  try {
    await window.electronAPI.loginAccount(accountId);
    showNotification('账号登录成功', 'success');
  } catch (error) {
    showNotification('账号登录失败: ' + error.message, 'error');
  }
}

// 显示编辑表单
function showEditForm(account) {
  currentAccountId = account.id;
  
  document.getElementById('edit-platform').value = account.platform;
  document.getElementById('edit-username').value = account.username;
  document.getElementById('edit-password').value = '';
  document.getElementById('edit-nickname').value = account.nickname || '';
  
  document.getElementById('edit-account-modal').style.display = 'block';
}

// 保存账号编辑
async function saveAccountEdit() {
  try {
    const accountData = {
      platform: document.getElementById('edit-platform').value,
      username: document.getElementById('edit-username').value,
      password: document.getElementById('edit-password').value,
      nickname: document.getElementById('edit-nickname').value
    };
    
    await window.electronAPI.editAccount(currentAccountId, accountData);
    document.getElementById('edit-account-modal').style.display = 'none';
    
    showNotification('账号编辑成功', 'success');
    await loadAccounts();
  } catch (error) {
    showNotification('账号编辑失败: ' + error.message, 'error');
  }
}

// 显示删除确认
function showDeleteConfirmation(accountId) {
  currentAccountId = accountId;
  document.getElementById('confirm-delete-modal').style.display = 'block';
  
  // 绑定确认删除按钮
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  confirmDeleteBtn.onclick = async () => {
    try {
      await window.electronAPI.deleteAccount(accountId);
      document.getElementById('confirm-delete-modal').style.display = 'none';
      
      showNotification('账号删除成功', 'success');
      await loadAccounts();
    } catch (error) {
      showNotification('账号删除失败: ' + error.message, 'error');
    }
  };
}

// 刷新账号状态
async function refreshAccountStatus() {
  const accounts = await window.electronAPI.refreshAccountStatus();
  allAccounts = accounts;
  updateAccountStats(accounts);
  renderAccountList(accounts);
  return accounts;
}

// 获取平台名称
function getPlatformName(platformId) {
  const platformMap = {
    'meituan': '美团外卖',
    'eleme': '饿了么',
    'jingdong': '京东到家'
  };
  
  return platformMap[platformId] || '未知平台';
}

// 获取状态徽章
function getStatusBadge(status) {
  const statusMap = {
    'online': { text: '在线', class: 'status-online' },
    'offline': { text: '离线', class: 'status-offline' },
    'expired': { text: '已过期', class: 'status-expired' },
    'unknown': { text: '未知', class: 'status-unknown' }
  };
  
  const statusInfo = statusMap[status] || statusMap.unknown;
  return `<span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>`;
}

// 格式化日期
function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  
  // 如果是今天
  if (diff < 24 * 60 * 60 * 1000 && 
      date.getDate() === now.getDate() && 
      date.getMonth() === now.getMonth() && 
      date.getFullYear() === now.getFullYear()) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 如果是昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() && 
      date.getMonth() === yesterday.getMonth() && 
      date.getFullYear() === yesterday.getFullYear()) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 其他日期
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  const messageElement = document.getElementById('notification-message');
  
  // 设置消息和类型
  messageElement.textContent = message;
  notification.className = 'notification';
  notification.classList.add(type);
  
  // 显示通知
  notification.classList.add('show');
  
  // 3秒后自动隐藏
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// 绑定批量操作相关的按钮
function bindBatchOperationButtons() {
  // 选择所有账号的复选框
  const selectAllCheckbox = document.getElementById('select-all-accounts');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      const checkboxes = document.querySelectorAll('.account-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
      });
    });
  }
  
  // 批量登录选中账号按钮
  const batchLoginSelectedBtn = document.getElementById('batch-login-selected-btn');
  if (batchLoginSelectedBtn) {
    batchLoginSelectedBtn.addEventListener('click', async () => {
      const selectedIds = getSelectedAccountIds();
      if (selectedIds.length === 0) {
        showNotification('请先选择要登录的账号', 'warning');
        return;
      }
      
      try {
        batchLoginSelectedBtn.disabled = true;
        batchLoginSelectedBtn.textContent = '登录中...';
        
        // 显示进度模态框
        showBatchProgressModal();
        
        // 调用批量登录API
        const result = await window.electronAPI.batchLoginAccounts({
          accountIds: selectedIds,
          silent: true,
          concurrentLimit: 5
        });
        
        // 更新进度
        updateBatchProgress(result.success, result.total, '批量登录');
        
        // 显示结果
        showBatchResult(result);
        
        // 刷新账号列表
        await loadAccounts();
      } catch (error) {
        showNotification('批量登录失败: ' + error.message, 'error');
        updateBatchProgressDetails(`批量登录失败: ${error.message}`, 'error');
      } finally {
        batchLoginSelectedBtn.disabled = false;
        batchLoginSelectedBtn.textContent = '登录选中账号';
      }
    });
  }
  
  // 选择所有离线账号按钮
  const selectOfflineBtn = document.getElementById('select-offline-btn');
  if (selectOfflineBtn) {
    selectOfflineBtn.addEventListener('click', () => {
      const offlineAccounts = document.querySelectorAll('tr[data-status="offline"] .account-checkbox');
      offlineAccounts.forEach(checkbox => {
        checkbox.checked = true;
      });
      
      // 更新全选复选框状态
      updateSelectAllCheckboxState();
    });
  }
  
  // 维护会话按钮（账号列表页面）
  const maintainSessionsBtn = document.getElementById('maintain-sessions-btn');
  if (maintainSessionsBtn) {
    maintainSessionsBtn.addEventListener('click', async () => {
      await startSessionMaintenance();
    });
  }
  
  // 开始批量登录按钮（批量操作页面）
  const startBatchLoginBtn = document.getElementById('start-batch-login-btn');
  if (startBatchLoginBtn) {
    startBatchLoginBtn.addEventListener('click', async () => {
      try {
        startBatchLoginBtn.disabled = true;
        startBatchLoginBtn.textContent = '登录中...';
        
        // 获取批量登录选项
        const platform = document.getElementById('batch-login-platform').value;
        const status = document.getElementById('batch-login-status').value;
        const concurrentLimit = parseInt(document.getElementById('batch-login-limit').value) || 5;
        const silent = document.getElementById('batch-login-silent').checked;
        
        // 筛选符合条件的账号
        const accountsToLogin = allAccounts.filter(account => {
          const matchesPlatform = !platform || account.platform === platform;
          const matchesStatus = !status || account.status === status;
          return matchesPlatform && matchesStatus;
        });
        
        if (accountsToLogin.length === 0) {
          showNotification('没有找到符合条件的账号', 'warning');
          return;
        }
        
        // 获取账号ID列表
        const accountIds = accountsToLogin.map(account => account.id);
        
        // 显示进度模态框
        showBatchProgressModal();
        updateBatchStatusContent(`开始批量登录 ${accountIds.length} 个账号，并发数: ${concurrentLimit}`);
        
        // 调用批量登录API
        const result = await window.electronAPI.batchLoginAccounts({
          accountIds,
          silent,
          concurrentLimit
        });
        
        // 更新进度
        updateBatchProgress(result.success, result.total, '批量登录');
        
        // 显示结果
        showBatchResult(result);
        
        // 刷新账号列表
        await loadAccounts();
      } catch (error) {
        showNotification('批量登录失败: ' + error.message, 'error');
        updateBatchProgressDetails(`批量登录失败: ${error.message}`, 'error');
      } finally {
        startBatchLoginBtn.disabled = false;
        startBatchLoginBtn.textContent = '开始批量登录';
      }
    });
  }
  
  // 开始会话维护按钮（批量操作页面）
  const startMaintainSessionsBtn = document.getElementById('start-maintain-sessions-btn');
  if (startMaintainSessionsBtn) {
    startMaintainSessionsBtn.addEventListener('click', async () => {
      await startSessionMaintenance();
    });
  }
}

// 获取选中的账号ID
function getSelectedAccountIds() {
  const checkboxes = document.querySelectorAll('.account-checkbox:checked');
  return Array.from(checkboxes).map(checkbox => checkbox.getAttribute('data-id'));
}

// 更新全选复选框状态
function updateSelectAllCheckboxState() {
  const selectAllCheckbox = document.getElementById('select-all-accounts');
  const checkboxes = document.querySelectorAll('.account-checkbox');
  const checkedCheckboxes = document.querySelectorAll('.account-checkbox:checked');
  
  if (checkboxes.length > 0 && checkedCheckboxes.length === checkboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCheckboxes.length > 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
}

// 显示批量进度模态框
function showBatchProgressModal() {
  const modal = document.getElementById('batch-progress-modal');
  if (modal) {
    modal.style.display = 'block';
    
    // 重置进度
    document.getElementById('batch-progress-value').style.width = '0%';
    document.getElementById('batch-progress-text').textContent = '0/0 完成';
    document.getElementById('batch-progress-details').innerHTML = '<p>准备开始批量操作...</p>';
  }
}

// 更新批量进度
function updateBatchProgress(completed, total, operation) {
  const progressValue = document.getElementById('batch-progress-value');
  const progressText = document.getElementById('batch-progress-text');
  
  if (progressValue && progressText) {
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    progressValue.style.width = `${percentage}%`;
    progressText.textContent = `${completed}/${total} 完成 (${percentage}%)`;
    
    // 更新批量状态内容
    updateBatchStatusContent(`${operation}进度: ${completed}/${total} 完成 (${percentage}%)`);
  }
}

// 更新批量进度详情
function updateBatchProgressDetails(message, type = 'info') {
  const progressDetails = document.getElementById('batch-progress-details');
  if (progressDetails) {
    const className = type === 'error' ? 'error-item' : type === 'success' ? 'success-item' : '';
    const timestamp = new Date().toLocaleTimeString();
    
    const p = document.createElement('p');
    p.className = className;
    p.textContent = `[${timestamp}] ${message}`;
    
    progressDetails.appendChild(p);
    progressDetails.scrollTop = progressDetails.scrollHeight;
  }
}

// 更新批量状态内容
function updateBatchStatusContent(message) {
  const statusContent = document.getElementById('batch-status-content');
  if (statusContent) {
    const timestamp = new Date().toLocaleTimeString();
    
    const p = document.createElement('p');
    p.textContent = `[${timestamp}] ${message}`;
    
    // 清空之前的内容
    statusContent.innerHTML = '';
    statusContent.appendChild(p);
  }
}

// 显示批量操作结果
function showBatchResult(result) {
  if (!result) return;
  
  const { total, success, failed, failedAccounts } = result;
  
  // 更新进度详情
  updateBatchProgressDetails(`批量操作完成，成功: ${success}/${total}，失败: ${failed}/${total}`, 'info');
  
  // 显示失败的账号
  if (failedAccounts && failedAccounts.length > 0) {
    updateBatchProgressDetails(`失败账号详情:`, 'info');
    failedAccounts.forEach(account => {
      updateBatchProgressDetails(`- ${account.username} (${getPlatformName(account.platform)}): ${account.error}`, 'error');
    });
  }
  
  // 显示通知
  if (success === total) {
    showNotification(`批量操作成功完成，全部 ${total} 个账号处理成功`, 'success');
  } else {
    showNotification(`批量操作部分完成，${success}/${total} 个账号处理成功，${failed}/${total} 个失败`, 'warning');
  }
}

// 开始会话维护
async function startSessionMaintenance() {
  try {
    // 显示进度模态框
    showBatchProgressModal();
    updateBatchProgressDetails('开始会话维护...', 'info');
    updateBatchStatusContent('正在维护所有账号会话...');
    
    // 调用会话维护API
    const result = await window.electronAPI.maintainAllSessions();
    
    // 更新进度
    if (result && result.total) {
      updateBatchProgress(result.refreshed, result.total, '会话维护');
      
      // 显示结果
      updateBatchProgressDetails(`会话维护完成，成功刷新: ${result.refreshed}/${result.total}`, 'success');
      showNotification(`会话维护完成，成功刷新: ${result.refreshed}/${result.total}`, 'success');
    } else {
      updateBatchProgressDetails('会话维护完成，但未返回详细结果', 'info');
      showNotification('会话维护完成', 'success');
    }
    
    // 刷新账号列表
    await loadAccounts();
  } catch (error) {
    showNotification('会话维护失败: ' + error.message, 'error');
    updateBatchProgressDetails(`会话维护失败: ${error.message}`, 'error');
  }
}

// 更新批量登录平台选项
function updateBatchLoginPlatformOptions() {
  const batchLoginPlatform = document.getElementById('batch-login-platform');
  if (!batchLoginPlatform) return;
  
  // 清空现有选项，保留第一个"所有平台"选项
  while (batchLoginPlatform.options.length > 1) {
    batchLoginPlatform.remove(1);
  }
  
  // 获取所有平台
  const platforms = [...new Set(allAccounts.map(acc => acc.platform))];
  
  // 添加平台选项
  platforms.forEach(platform => {
    if (platform) {
      const option = document.createElement('option');
      option.value = platform;
      option.textContent = getPlatformName(platform);
      batchLoginPlatform.appendChild(option);
    }
  });
} 