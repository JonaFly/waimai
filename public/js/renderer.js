// 获取元素
const accountList = document.getElementById('account-list');
const addAccountForm = document.getElementById('add-account-form');
const editAccountForm = document.getElementById('edit-account-form');
const refreshButton = document.getElementById('refresh-btn');
const platformSelect = document.getElementById('platform');
const editPlatformSelect = document.getElementById('edit-platform');
const saveEditButton = document.getElementById('save-edit-btn');

// 当前选中的账号ID
let currentAccountId = null;

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
  // 检查API是否存在
  if (!window.electronAPI) {
    console.error('无法访问electronAPI，请检查preload.js是否正确配置');
    displayError('应用初始化失败', '无法连接到后端服务');
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
      document.getElementById('edit-account-modal').style.display = 'none';
    });
  });
  
  // 绑定保存编辑按钮
  if (saveEditButton) {
    saveEditButton.addEventListener('click', async () => {
      await saveAccountEdit();
    });
  }
  
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
  
  // 加载账号列表
  await loadAccounts();
  
  // 加载平台列表
  await loadPlatforms();
  
  // 绑定其他事件处理程序
  bindEventHandlers();
});

// 加载账号列表
async function loadAccounts() {
  try {
    console.log('正在加载账号列表...');
    const accounts = await window.electronAPI.getAccounts();
    console.log('获取到账号:', accounts);
    renderAccountList(accounts);
  } catch (error) {
    console.error('加载账号列表失败:', error);
    displayError('加载账号列表失败', error.message || '未知错误');
  }
}

// 渲染账号列表
function renderAccountList(accounts) {
  accountList.innerHTML = '';
  
  if (!accounts || accounts.length === 0) {
    accountList.innerHTML = '<div class="empty-list">暂无账号，请添加</div>';
    return;
  }
  
  accounts.forEach(account => {
    const accountCard = document.createElement('div');
    accountCard.className = 'account-card';
    accountCard.setAttribute('data-id', account.id);
    
    // 账号状态标记
    const statusClass = getStatusClass(account.status);
    accountCard.classList.add(statusClass);
    
    // 账号信息
    const infoDiv = document.createElement('div');
    infoDiv.className = 'account-info';
    
    const platformName = getPlatformName(account.platform);
    const nickname = account.nickname ? `(${account.nickname})` : '';
    
    // 显示登录时间
    let lastLoginInfo = '';
    if (account.lastLoginTime) {
      const loginDate = new Date(account.lastLoginTime);
      lastLoginInfo = `<p>上次登录: ${loginDate.toLocaleString()}</p>`;
    }
    
    infoDiv.innerHTML = `
      <h3>${platformName} ${nickname}</h3>
      <p>用户名: ${account.username}</p>
      <p>状态: ${getStatusText(account.status)}</p>
      ${lastLoginInfo}
    `;
    accountCard.appendChild(infoDiv);
    
    // 操作按钮
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'account-actions';
    
    // 登录按钮
    const loginButton = document.createElement('button');
    loginButton.className = 'btn btn-primary';
    loginButton.textContent = '登录';
    loginButton.addEventListener('click', () => loginAccount(account.id));
    actionsDiv.appendChild(loginButton);
    
    // 编辑按钮
    const editButton = document.createElement('button');
    editButton.className = 'btn btn-secondary';
    editButton.textContent = '编辑';
    editButton.addEventListener('click', () => showEditForm(account));
    actionsDiv.appendChild(editButton);
    
    // 删除按钮
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-danger';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', () => deleteAccount(account.id));
    actionsDiv.appendChild(deleteButton);
    
    accountCard.appendChild(actionsDiv);
    accountList.appendChild(accountCard);
  });
}

// 加载平台列表
async function loadPlatforms() {
  try {
    console.log('正在加载平台列表...');
    const platforms = await window.electronAPI.getPlatformList();
    console.log('获取到平台:', platforms);
    
    // 清空选项
    platformSelect.innerHTML = '';
    editPlatformSelect.innerHTML = '';
    
    // 添加平台选项
    platforms.forEach(platform => {
      const option = document.createElement('option');
      option.value = platform.id;
      option.textContent = platform.name;
      
      const clone = option.cloneNode(true);
      platformSelect.appendChild(option);
      editPlatformSelect.appendChild(clone);
    });
  } catch (error) {
    console.error('加载平台列表失败:', error);
    displayError('加载平台列表失败', error.message || '未知错误');
  }
}

// 绑定事件处理程序
function bindEventHandlers() {
  // 添加账号表单提交
  if (addAccountForm) {
    addAccountForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const platform = document.getElementById('platform').value;
      const nickname = document.getElementById('nickname').value;
      
      const accountData = { platform, username, password, nickname };
      
      try {
        console.log('添加账号:', accountData);
        await window.electronAPI.addAccount(accountData);
        addAccountForm.reset();
        
        // 切换回账号列表标签
        document.querySelector('.tab-btn[data-tab="accounts"]').click();
        
        // 重新加载账号列表
        await loadAccounts();
        
        displaySuccess('添加账号成功');
      } catch (error) {
        console.error('添加账号失败:', error);
        displayError('添加账号失败', error.message || '未知错误');
      }
    });
  }
  
  // 刷新按钮点击
  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      const originalText = refreshButton.textContent;
      refreshButton.disabled = true;
      refreshButton.textContent = '刷新中...';
      
      try {
        await refreshAccountStatus();
        displaySuccess('刷新状态成功');
      } catch (error) {
        console.error('刷新状态失败:', error);
        displayError('刷新状态失败', error.message || '未知错误');
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = originalText;
      }
    });
  }
}

// 显示编辑表单
function showEditForm(account) {
  currentAccountId = account.id;
  
  document.getElementById('edit-username').value = account.username;
  document.getElementById('edit-nickname').value = account.nickname || '';
  document.getElementById('edit-platform').value = account.platform;
  document.getElementById('edit-password').value = '';
  
  // 显示模态框
  document.getElementById('edit-account-modal').style.display = 'block';
}

// 保存账号编辑
async function saveAccountEdit() {
  const username = document.getElementById('edit-username').value;
  const password = document.getElementById('edit-password').value;
  const platform = document.getElementById('edit-platform').value;
  const nickname = document.getElementById('edit-nickname').value;
  
  // 构建账号数据，密码为空则不修改
  const accountData = { 
    platform, 
    username, 
    nickname 
  };
  
  if (password) {
    accountData.password = password;
  }
  
  try {
    console.log('保存账号编辑:', currentAccountId, accountData);
    await window.electronAPI.editAccount(currentAccountId, accountData);
    
    // 隐藏模态框
    document.getElementById('edit-account-modal').style.display = 'none';
    
    // 重新加载账号列表
    await loadAccounts();
    
    displaySuccess('编辑账号成功');
  } catch (error) {
    console.error('编辑账号失败:', error);
    displayError('编辑账号失败', error.message || '未知错误');
  }
}

// 登录账号
async function loginAccount(accountId) {
  try {
    console.log('登录账号:', accountId);
    await window.electronAPI.loginAccount(accountId);
    displaySuccess('正在打开登录窗口');
  } catch (error) {
    console.error('登录账号失败:', error);
    displayError('登录账号失败', error.message || '未知错误');
  }
}

// 删除账号
async function deleteAccount(accountId) {
  if (!confirm('确定要删除此账号吗？此操作不可撤销。')) {
    return;
  }
  
  try {
    console.log('删除账号:', accountId);
    await window.electronAPI.deleteAccount(accountId);
    await loadAccounts();
    displaySuccess('删除账号成功');
  } catch (error) {
    console.error('删除账号失败:', error);
    displayError('删除账号失败', error.message || '未知错误');
  }
}

// 刷新账号状态
async function refreshAccountStatus() {
  try {
    console.log('刷新账号状态...');
    const accounts = await window.electronAPI.refreshAccountStatus();
    renderAccountList(accounts);
    return accounts;
  } catch (error) {
    console.error('刷新账号状态失败:', error);
    throw error;
  }
}

// 获取平台名称
function getPlatformName(platformId) {
  const platformMap = {
    'meituan': '美团外卖',
    'eleme': '饿了么',
    'jingdong': '京东外卖'
  };
  
  return platformMap[platformId] || platformId;
}

// 获取状态文本
function getStatusText(status) {
  const statusMap = {
    'online': '在线',
    'offline': '离线',
    'expired': '已过期',
    'unknown': '未知'
  };
  
  return statusMap[status] || '未知';
}

// 获取状态样式类
function getStatusClass(status) {
  const statusClassMap = {
    'online': 'status-online',
    'offline': 'status-offline',
    'expired': 'status-expired',
    'unknown': 'status-unknown'
  };
  
  return statusClassMap[status] || 'status-unknown';
}

// 显示成功消息
function displaySuccess(message) {
  alert(`✓ ${message}`);
}

// 显示错误消息
function displayError(title, errorMessage) {
  alert(`❌ ${title}\n${errorMessage}`);
} 