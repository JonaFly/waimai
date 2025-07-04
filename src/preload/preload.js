const { contextBridge, ipcRenderer } = require('electron');

// 与渲染进程共享的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 账户相关API
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  addAccount: (account) => ipcRenderer.invoke('add-account', account),
  updateAccount: (account) => ipcRenderer.invoke('update-account', account),
  deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),
  loginAccount: (id) => ipcRenderer.invoke('login-account', id),
  logoutAccount: (id) => ipcRenderer.invoke('logout-account', id),
  checkAccountSession: (id) => ipcRenderer.invoke('check-account-session', id),
  
  // 激活系统API
  checkActivation: () => ipcRenderer.invoke('check-activation'),
  activateSoftware: (activationCode) => ipcRenderer.invoke('activate-software', activationCode),
  
  // 对话框API
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options)
}); 