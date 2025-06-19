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
  }
});
