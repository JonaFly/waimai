const { contextBridge, ipcRenderer } = require("electron");

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  // 获取所有账号
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  
  // 添加账号
  addAccount: (accountData) => ipcRenderer.invoke("add-account", accountData),
  
  // 登录账号
  loginAccount: (accountId) => ipcRenderer.invoke("login-account", accountId),
  
  // 删除账号
  deleteAccount: (accountId) => ipcRenderer.invoke("delete-account", accountId),
  
  // 编辑账号
  editAccount: (accountId, accountData) => ipcRenderer.invoke("edit-account", accountId, accountData),
  
  // 刷新账号状态
  refreshAccountStatus: () => ipcRenderer.invoke("refresh-account-status"),
  
  // 获取平台列表
  getPlatformList: () => ipcRenderer.invoke("get-platform-list"),
  
  // 接收账号状态变更通知
  onAccountStatusChanged: (callback) => {
    ipcRenderer.on('account-status-changed', () => callback());
    return () => {
      ipcRenderer.removeAllListeners('account-status-changed');
    };
  },
  
  // 接收显示账号详情通知
  onShowAccountDetails: (callback) => {
    ipcRenderer.on('show-account-details', (_, accountId) => callback(accountId));
    return () => {
      ipcRenderer.removeAllListeners('show-account-details');
    };
  },
  
  // 获取账号登录状态
  getAccountStatus: (username) => ipcRenderer.invoke('get-account-status', username),
  
  // 接收账号状态更新通知
  onAccountStatusUpdated: (callback) => {
    ipcRenderer.on('account-status-updated', (_, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners('account-status-updated');
    };
  },
  
  // 接收浏览器窗口状态消息
  onBrowserStatusMessage: (callback) => {
    ipcRenderer.on('browser-status-message', (_, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners('browser-status-message');
    };
  },
  
  // 强制刷新账号会话
  forceRefreshSession: (accountId) => ipcRenderer.invoke('account:force-refresh', accountId),
  
  // 批量登录账号
  batchLoginAccounts: (options) => ipcRenderer.invoke('batch-login-accounts', options),
  
  // 维护所有会话
  maintainAllSessions: () => ipcRenderer.invoke('maintain-all-sessions'),
  
  // 激活软件
  activateSoftware: (activationCode) => ipcRenderer.invoke('activate-software', { activationCode }),
  
  // 通知激活完成
  notifyActivationComplete: () => ipcRenderer.send('activation-complete'),
  
  // 通知激活窗口已准备就绪
  notifyActivationWindowReady: () => ipcRenderer.send('activation-window-ready')
});
