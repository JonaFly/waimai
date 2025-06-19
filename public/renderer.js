// 获取元素
const accountList = document.getElementById('account-list');
const addAccountForm = document.getElementById('add-account-form');
const editAccountForm = document.getElementById('edit-account-form');
const refreshButton = document.getElementById('refresh-button');
const platformSelect = document.getElementById('platform');
const editPlatformSelect = document.getElementById('edit-platform');

// 当前选中的账号ID
let currentAccountId = null;

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
  // 加载账号列表
  await loadAccounts();
  
  // 加载平台列表
  await loadPlatforms();
  
  // 绑定事件处理程序
  bindEventHandlers();
});

// 加载账号列表
async function loadAccounts() {
  try {
    const accounts = await window.electronAPI.getAccounts();
    renderAccountList(accounts);
  } catch (error) {
    showError('加载账号列表失败', error);
  }
}

// 渲染账号列表
function renderAccountList(accounts) {
  accountList.innerHTML = '';
  
  if (accounts.length === 0) {
    accountList.innerHTML = '<tr><td colspan="5" class="text-center">暂无账号，请添加</td></tr>';
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
    
    // 操作
    const actionTd = document.createElement('td');
    
    // 登录按钮
    const loginButton = document.createElement('button');
    loginButton.className = 'btn btn-sm btn-primary me-1';
    loginButton.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> 登录';
    loginButton.addEventListener('click', () => loginAccount(account.id));
    actionTd.appendChild(loginButton);
    
    // 编辑按钮
    const editButton = document.createElement('button');
    editButton.className = 'btn btn-sm btn-info me-1';
    editButton.innerHTML = '<i class="bi bi-pencil"></i> 编辑';
    editButton.addEventListener('click', () => showEditForm(account));
    actionTd.appendChild(editButton);
    
    // 删除按钮
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-sm btn-danger';
    deleteButton.innerHTML = '<i class="bi bi-trash"></i> 删除';
    deleteButton.addEventListener('click', () => deleteAccount(account.id));
    actionTd.appendChild(deleteButton);
    
    tr.appendChild(actionTd);
    
    accountList.appendChild(tr);
  });
}

// 加载平台列表
async function loadPlatforms() {
  try {
    const platforms = await window.electronAPI.getPlatforms();
    
    // 清空选项
    platformSelect.innerHTML = '';
    editPlatformSelect.innerHTML = '';
    
    // 添加平台选项
    platforms.forEach(platform => {
      const option = document.createElement('option');
      option.value = platform.id;
      option.textContent = platform.name;
      platformSelect.appendChild(option.cloneNode(true));
      editPlatformSelect.appendChild(option);
    });
  } catch (error) {
    showError('加载平台列表失败', error);
  }
}

// 绑定事件处理程序
function bindEventHandlers() {
  // 添加账号表单提交
  addAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const formData = new FormData(addAccountForm);
    const accountData = {
      platform: formData.get('platform'),
      username: formData.get('username'),
      password: formData.get('password'),
      nickname: formData.get('nickname')
    };
    
    try {
      await window.electronAPI.addAccount(accountData);
      addAccountForm.reset();
      
      // 隐藏模态框
      const modal = bootstrap.Modal.getInstance(document.getElementById('addAccountModal'));
      modal.hide();
      
      // 重新加载账号列表
      await loadAccounts();
      
      showSuccess('添加账号成功');
    } catch (error) {
      showError('添加账号失败', error);
    }
  });
  
  // 编辑账号表单提交
  editAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const formData = new FormData(editAccountForm);
    const accountData = {
      platform: formData.get('edit-platform'),
      username: formData.get('edit-username'),
      password: formData.get('edit-password'),
      nickname: formData.get('edit-nickname')
    };
    
    try {
      await window.electronAPI.editAccount(currentAccountId, accountData);
      editAccountForm.reset();
      
      // 隐藏模态框
      const modal = bootstrap.Modal.getInstance(document.getElementById('editAccountModal'));
      modal.hide();
      
      // 重新加载账号列表
      await loadAccounts();
      
      showSuccess('编辑账号成功');
    } catch (error) {
      showError('编辑账号失败', error);
    }
  });
  
  // 刷新按钮点击
  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    refreshButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 刷新中...';
    
    try {
      await refreshAccountStatus();
      showSuccess('刷新状态成功');
    } catch (error) {
      showError('刷新状态失败', error);
    } finally {
      refreshButton.disabled = false;
      refreshButton.innerHTML = '<i class="bi bi-arrow-clockwise"></i> 刷新状态';
    }
  });
}

// 显示编辑表单
function showEditForm(account) {
  currentAccountId = account.id;
  
  document.getElementById('edit-username').value = account.username;
  document.getElementById('edit-nickname').value = account.nickname || '';
  document.getElementById('edit-platform').value = account.platform;
  document.getElementById('edit-password').value = '';
  
  // 显示模态框
  const modal = new bootstrap.Modal(document.getElementById('editAccountModal'));
  modal.show();
}

// 登录账号
async function loginAccount(accountId) {
  try {
    await window.electronAPI.loginAccount(accountId);
  } catch (error) {
    showError('登录失败', error);
  }
}

// 删除账号
async function deleteAccount(accountId) {
  if (!confirm('确定要删除此账号吗？')) {
    return;
  }
  
  try {
    await window.electronAPI.deleteAccount(accountId);
    await loadAccounts();
    showSuccess('删除账号成功');
  } catch (error) {
    showError('删除账号失败', error);
  }
}

// 刷新账号状态
async function refreshAccountStatus() {
  try {
    const accounts = await window.electronAPI.refreshStatus();
    renderAccountList(accounts);
    return accounts;
  } catch (error) {
    showError('刷新状态失败', error);
    throw error;
  }
}

// 获取平台名称
function getPlatformName(platformId) {
  const platformMap = {
    'meituan': '美团外卖',
    'jingdong': '京东到家',
    'eleme': '饿了么'
  };
  
  return platformMap[platformId] || platformId;
}

// 获取状态徽章
function getStatusBadge(status) {
  const statusMap = {
    'active': '<span class="badge bg-success">正常</span>',
    'inactive': '<span class="badge bg-danger">异常</span>',
    'unknown': '<span class="badge bg-secondary">未知</span>'
  };
  
  return statusMap[status] || '<span class="badge bg-secondary">未知</span>';
}

// 显示成功消息
function showSuccess(message) {
  const alertContainer = document.getElementById('alert-container');
  const alert = document.createElement('div');
  alert.className = 'alert alert-success alert-dismissible fade show';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  alertContainer.appendChild(alert);
  
  // 3秒后自动关闭
  setTimeout(() => {
    if (alert.parentNode) {
      alert.parentNode.removeChild(alert);
    }
  }, 3000);
}

// 显示错误消息
function showError(title, error) {
  const alertContainer = document.getElementById('alert-container');
  const alert = document.createElement('div');
  alert.className = 'alert alert-danger alert-dismissible fade show';
  alert.innerHTML = `
    <strong>${title}:</strong> ${error.message || error}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  alertContainer.appendChild(alert);
  
  // 5秒后自动关闭
  setTimeout(() => {
    if (alert.parentNode) {
      alert.parentNode.removeChild(alert);
    }
  }, 5000);
  
  console.error(error);
} 