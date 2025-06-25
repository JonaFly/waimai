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
    accountList.innerHTML = '<tr><td colspan="6" class="empty-list">暂无账号，请添加</td></tr>';
    return;
  }
  
  accounts.forEach(account => {
    const tr = document.createElement('tr');
    
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