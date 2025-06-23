// 更新图标路径为新的default-icon.png
const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AccountManager = require('./account-manager');
const WindowManager = require('./window-manager');

// 加密密钥 - 用于加密存储的账号信息
// 注意：在实际生产环境中，应从安全的环境变量或配置文件中获取
const ENCRYPTION_KEY = 'waimai-account-manager-encryption-key-v1';

// 全局变量
let mainWindow = null;
let tray = null;
let accountManager = null;
let windowManager = null;
let isQuitting = false;

/**
 * 初始化应用
 */
async function initApp() {
  try {
    // 创建账号管理器
    accountManager = new AccountManager(ENCRYPTION_KEY);
    
    // 创建窗口管理器
    windowManager = new WindowManager();
    
    // 设置窗口管理器
    accountManager.setWindowManager(windowManager);
    
    try {
      // 加载账号列表
      await accountManager.loadAccounts();
    } catch (loadError) {
      console.error('加载账号列表失败:', loadError);
      // 继续初始化应用，但显示错误通知
      dialog.showErrorBox('加载账号列表失败', 
        `无法加载账号数据: ${loadError.message}\n\n这可能是由于数据文件损坏或格式变更导致。`);
    }
    
    // 创建主窗口
    createMainWindow();
    
    // 暂时禁用系统托盘功能
    /*
    try {
      // 创建系统托盘
      createTray();
    } catch (trayError) {
      console.error('创建系统托盘失败:', trayError);
      dialog.showErrorBox('系统托盘创建失败', 
        `无法创建系统托盘: ${trayError.message}\n\n应用可以正常使用，但系统托盘功能将不可用。`);
    }
    */
    
    // 设置IPC通信
    setupIPC();
  } catch (error) {
    console.error('初始化应用失败:', error);
    dialog.showErrorBox('初始化失败', `初始化应用时发生错误: ${error.message}`);
    app.exit(1);
  }
}

/**
 * 创建主窗口
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: true,
    title: '外卖平台账号管理器',
    icon: path.resolve(__dirname, '../../public/default-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      worldSafeExecuteJavaScript: true
    }
  });

  // 加载HTML文件
  mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));

  // 开发环境打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // 窗口关闭事件处理
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  // 窗口关闭后清除引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 创建系统托盘
 */
function createTray() {
  try {
    // 创建托盘图标
    const iconPath = path.resolve(__dirname, '../../public/app-icon.png');
    console.log('托盘图标路径:', iconPath);
    
    if (!fs.existsSync(iconPath)) {
      console.error(`托盘图标文件不存在: ${iconPath}`);
      return; // 图标不存在时直接返回，不创建托盘
    }
    
    tray = new Tray(iconPath);
    tray.setToolTip('外卖平台账号管理器');
    
    // 更新托盘菜单
    updateTrayMenu();
    
    // 点击托盘图标显示主窗口
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      } else {
        createMainWindow();
      }
    });
  } catch (error) {
    console.error('创建系统托盘失败:', error);
    // 不抛出错误，允许应用继续运行
  }
}

/**
 * 更新托盘菜单
 */
function updateTrayMenu() {
  if (!tray) return;
  
  const accounts = accountManager ? accountManager.getAccounts() : [];
  
  // 构建账号菜单项
  const accountItems = accounts.map(account => {
    const platformInfo = accountManager.platformConfigs[account.platform] || { name: '未知平台' };
    
    return {
      label: `${account.nickname || account.username} (${platformInfo.name})`,
      submenu: [
        {
          label: '登录',
          click: () => {
            accountManager.loginAccount(account.id)
              .then(() => {
                if (mainWindow) {
                  mainWindow.webContents.send('account-status-changed');
                }
              })
              .catch(err => {
                dialog.showErrorBox('登录失败', err.message);
              });
          }
        },
        {
          label: '显示账号信息',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
              mainWindow.webContents.send('show-account-details', account.id);
            } else {
              createMainWindow();
            }
          }
        }
      ]
    };
  });

  // 构建完整菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '外卖平台账号管理器',
      enabled: false
    },
    { type: 'separator' },
    ...accountItems,
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: '刷新账号状态',
      click: () => {
        accountManager.refreshAccountStatus()
          .then(() => {
            if (mainWindow) {
              mainWindow.webContents.send('account-status-changed');
            }
            updateTrayMenu();
          })
          .catch(err => {
            dialog.showErrorBox('刷新状态失败', err.message);
          });
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * 设置IPC通信
 */
function setupIPC() {
  // 获取账号列表
  ipcMain.handle('get-accounts', async () => {
    try {
      return accountManager.getAccounts();
    } catch (error) {
      console.error('获取账号列表失败:', error);
      throw error;
    }
  });

  // 添加账号
  ipcMain.handle('add-account', async (event, accountData) => {
    try {
      const result = await accountManager.addAccount(accountData);
      updateTrayMenu();
      return result;
    } catch (error) {
      console.error('添加账号失败:', error);
      throw error;
    }
  });

  // 登录账号
  ipcMain.handle('login-account', async (event, accountId) => {
    try {
      const result = await accountManager.loginAccount(accountId);
      updateTrayMenu();
      return result;
    } catch (error) {
      console.error('登录账号失败:', error);
      throw error;
    }
  });

  // 删除账号
  ipcMain.handle('delete-account', async (event, accountId) => {
    try {
      const result = await accountManager.deleteAccount(accountId);
      updateTrayMenu();
      return result;
    } catch (error) {
      console.error('删除账号失败:', error);
      throw error;
    }
  });

  // 编辑账号
  ipcMain.handle('edit-account', async (event, accountId, accountData) => {
    try {
      const result = await accountManager.editAccount(accountId, accountData);
      updateTrayMenu();
      return result;
    } catch (error) {
      console.error('编辑账号失败:', error);
      throw error;
    }
  });

  // 刷新账号状态
  ipcMain.handle('refresh-account-status', async () => {
    try {
      const accounts = await accountManager.refreshAccountStatus();
      updateTrayMenu();
      return accounts;
    } catch (error) {
      console.error('刷新账号状态失败:', error);
      throw error;
    }
  });

  // 获取平台列表
  ipcMain.handle('get-platform-list', () => {
    try {
      return accountManager.getPlatformList();
    } catch (error) {
      console.error('获取平台列表失败:', error);
      throw error;
    }
  });

  // 添加强制刷新会话的IPC处理
  ipcMain.handle('account:force-refresh', async (event, accountId) => {
    try {
      return await accountManager.forceRefreshSession(accountId);
    } catch (error) {
      console.error('强制刷新会话失败:', error);
      return {
        success: false,
        message: error.message,
        error: error.toString()
      };
    }
  });
}

// 应用初始化完成后启动
app.whenReady().then(initApp);

// 所有窗口关闭时的处理 (macOS除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用激活时的处理 (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// 应用退出前的处理
app.on('before-quit', () => {
  isQuitting = true;
}); 