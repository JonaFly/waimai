// 更新图标路径为新的default-icon.png
const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AccountManager = require('./account-manager');
const WindowManager = require('./window-manager');
const { nativeImage } = require('electron');
// 导入图标管理模块
const iconManager = require('../../public/icon.js');
// 导入激活管理器
const { ActivationManager } = require('./activation-manager');
const { DbManager } = require('./db-manager');

// 实现单实例锁定，防止多个实例同时运行
const gotTheLock = app.requestSingleInstanceLock();

// 如果无法获取锁，则表示已有实例在运行，退出当前实例
if (!gotTheLock) {
  console.log('另一个实例已经在运行，退出当前实例');
  app.quit();
} else {
  // 如果获得了锁，则监听第二个实例的启动
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 如果用户尝试打开另一个实例，我们应该聚焦到主窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 加密密钥 - 用于加密存储的账号信息
// 注意：在实际生产环境中，应从安全的环境变量或配置文件中获取
const ENCRYPTION_KEY = 'waimai-account-manager-encryption-key-v1';
// 激活系统密钥
const ACTIVATION_KEY = 'g7NqT9Aw3K5sV8yP';

// 全局变量
let mainWindow = null;
let tray = null;
let accountManager = null;
let windowManager = null;
let activationManager = null; // 激活管理器
let activationWindow = null; // 激活窗口
let isQuitting = false;

// 平台图标定义
const PLATFORM_ICONS = {
  'ele': '🍴',
  'meituan': '🍱',
  'jd': '🛒',
  'taobao': '🛍️',
  'pinduoduo': '🔥',
  'alipay': '💰',
  'wechat': '💬',
  'qq': '🐧',
  'weibo': '📱',
  'bilibili': '📺',
  'tiktok': '🎵',
  'douyin': '🎵',
  'default': '🔑'
};

/**
 * 初始化应用
 */
function initApp() {
  try {
    // 创建账号管理器
    accountManager = new AccountManager(ENCRYPTION_KEY);
    
    // 创建窗口管理器
    windowManager = new WindowManager();
    
    // 设置窗口管理器
    accountManager.setWindowManager(windowManager);
    
    // 设置IPC处理程序
    setupIpcHandlers();
    
    // 创建激活管理器
    activationManager = new ActivationManager(accountManager.dbManager, ACTIVATION_KEY);
    
    // 检查激活状态
    checkActivation();
  } catch (error) {
    console.error('初始化应用失败:', error);
    dialog.showErrorBox('初始化失败', error.message);
  }
}

/**
 * 检查激活状态
 */
async function checkActivation() {
  try {
    const activationStatus = await activationManager.checkActivation();
    
    if (!activationStatus.activated) {
      // 如果未激活，显示激活窗口
      showActivationWindow();
    } else {
      console.log(`软件已激活，剩余天数: ${activationStatus.daysLeft}`);
      // 如果已激活，继续初始化应用
      continueInitApp();
    }
  } catch (error) {
    console.error('检查激活状态失败:', error);
    dialog.showErrorBox('激活检查失败', error.message);
    // 出错时也显示激活窗口
    showActivationWindow();
  }
}

/**
 * 显示激活窗口
 */
function showActivationWindow() {
  // 如果激活窗口已存在，则显示它
  if (activationWindow && !activationWindow.isDestroyed()) {
    activationWindow.show();
    activationWindow.focus();
    return;
  }
  
  // 创建激活窗口
  activationWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: '软件激活',
    icon: iconManager.getIconPath('app'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'), // 修正预加载脚本路径
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // 加载激活页面
  activationWindow.loadFile(path.join(__dirname, '../renderer/activation.html'));
  
  // 窗口准备好时显示
  activationWindow.once('ready-to-show', () => {
    activationWindow.show();
  });
  
  // 阻止关闭窗口，如果软件未激活
  activationWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      dialog.showMessageBox(activationWindow, {
        type: 'warning',
        title: '软件未激活',
        message: '软件需要激活才能使用。如果关闭此窗口，应用将退出。',
        buttons: ['继续激活', '退出应用'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 1) {
          isQuitting = true;
          app.quit();
        }
      });
    }
  });
}

/**
 * 继续初始化应用
 * 在激活成功后调用
 */
function continueInitApp() {
  // 创建主窗口
  createMainWindow();
  
  // 尝试创建系统托盘，但允许失败
  try {
    createTray();
  } catch (trayError) {
    console.error('创建系统托盘失败，但应用将继续运行:', trayError);
  }
  
  // 加载账号
  accountManager.loadAccounts().then(accounts => {
    console.log(`成功加载账号列表，共 ${accounts.length} 个账号`);
    // 更新托盘菜单
    updateTrayMenu();
  }).catch(err => {
    console.error('加载账号列表失败:', err);
    dialog.showErrorBox('加载账号失败', err.message);
  });
  
  // 启用自动会话维护
  const maintenanceInterval = 60; // 分钟
  const runImmediately = false;
  accountManager.setAutoSessionMaintenance(true, maintenanceInterval, runImmediately);
  console.log(`已启用自动会话维护，间隔 ${maintenanceInterval} 分钟，首次执行将在应用启动 5 秒后进行`);
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
    icon: iconManager.getIconPath('app'), // 使用图标管理器
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

  // 修改窗口关闭事件处理 - 直接退出应用而不是隐藏窗口
  mainWindow.on('close', () => {
    // 设置退出标志
    isQuitting = true;
  });

  // 窗口关闭后清除引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 创建系统托盘
  createTray();
}

/**
 * 创建系统托盘
 */
function createTray() {
  try {
    // 使用图标管理器创建托盘图标
    const trayIcon = iconManager.createTrayIcon();
    tray = new Tray(trayIcon);
    
    // 设置工具提示
    tray.setToolTip('外卖账号管理器');
    
    // 点击托盘图标时切换主窗口的可见性
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isDestroyed()) {
          createMainWindow();
        } else if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createMainWindow();
      }
    });
    
    // 设置右键菜单
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: '显示窗口', 
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        } 
      },
      { type: 'separator' },
      { 
        label: '退出', 
        click: () => {
          app.quit();
        } 
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    console.log('系统托盘创建成功');
    return tray;
  } catch (error) {
    console.error('创建系统托盘失败:', error);
    console.log('应用将继续运行，但没有系统托盘图标');
    return null;
  }
}

/**
 * 设置IPC通信
 */
function setupIpcHandlers() {
  // 激活软件
  ipcMain.handle('activate-software', async (event, activationCode) => {
    try {
      console.log('收到激活请求:', activationCode);
      const result = await activationManager.activateSoftware(activationCode);
      
      if (result.success) {
        // 激活成功，继续初始化应用
        continueInitApp();
        
        // 关闭激活窗口
        if (activationWindow && !activationWindow.isDestroyed()) {
          setTimeout(() => {
            activationWindow.close();
            activationWindow = null;
          }, 2000);
        }
      }
      
      return result;
    } catch (error) {
      console.error('激活软件失败:', error);
      return { 
        success: false, 
        message: '激活过程中出错',
        error: error.message
      };
    }
  });
  
  // 激活窗口完成
  ipcMain.on('activation-complete', () => {
    // 关闭激活窗口
    if (activationWindow && !activationWindow.isDestroyed()) {
      activationWindow.close();
      activationWindow = null;
    }
  });
  
  // 激活窗口准备就绪
  ipcMain.on('activation-window-ready', () => {
    console.log('激活窗口已准备就绪');
  });
  
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
  ipcMain.handle('force-refresh-session', async (event, accountId) => {
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
  
  // 添加登录状态更新处理
  ipcMain.on('login-status-update', (event, data) => {
    if (data && data.username) {
      console.log(`接收到账号 ${data.username} 的登录状态更新:`, data.status);
      
      // 更新窗口管理器中的账号状态
      if (windowManager) {
        windowManager.setAccountStatus(data.username, data.status, data.platform);
      }
      
      // 通知主窗口更新账号状态
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('account-status-updated', {
          username: data.username,
          status: data.status,
          platform: data.platform,
          timestamp: data.timestamp || Date.now()
        });
      }
    }
  });
  
  // 添加从渲染进程获取账号状态的处理
  ipcMain.handle('get-account-status', (event, username) => {
    if (windowManager) {
      return windowManager.getAccountStatus(username);
    }
    return { status: 'unknown', lastUpdate: 0 };
  });
  
  // 添加从浏览器窗口接收消息的处理
  ipcMain.on('browser-message', (event, message) => {
    if (message && message.channel === 'login-status') {
      // 转发登录状态消息
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser-status-message', message.data);
      }
    }
  });

  // 添加批量登录账号的处理
  ipcMain.handle('batch-login-accounts', async (event, { accountIds, silent = true, concurrentLimit = 5 }) => {
    try {
      console.log(`收到批量登录请求，账号数量: ${accountIds.length}`);
      const result = await accountManager.batchLoginAccounts(accountIds, silent, concurrentLimit);
      updateTrayMenu();
      return result;
    } catch (error) {
      console.error('批量登录账号失败:', error);
      throw error;
    }
  });
  
  // 添加维护所有会话的处理
  ipcMain.handle('maintain-all-sessions', async () => {
    try {
      console.log('收到维护所有会话请求');
      const result = await accountManager.maintainSessions();
      updateTrayMenu();
      return result;
    } catch (error) {
      console.error('维护所有会话失败:', error);
      throw error;
    }
  });

  // 激活相关IPC处理
  ipcMain.handle('check-activation', async () => {
    return await activationManager.checkActivation();
  });
}

/**
 * 更新托盘菜单
 * 根据当前账号状态动态更新托盘菜单
 */
function updateTrayMenu() {
  try {
    if (!tray) {
      console.warn('托盘对象不存在，无法更新菜单');
      return false;
    }
    
    // 获取账号列表
    const accounts = accountManager.getAccounts();
    
    // 创建菜单模板
    const menuTemplate = [
      { label: '显示主窗口', click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }},
      { type: 'separator' }
    ];

    // 按平台对账号进行分组
    const platformGroups = {};
    accounts.forEach(account => {
      const platform = account.platform || 'default';
      if (!platformGroups[platform]) {
        platformGroups[platform] = [];
      }
      platformGroups[platform].push(account);
    });

    // 为每个平台创建子菜单
    Object.keys(platformGroups).forEach(platform => {
      const platformAccounts = platformGroups[platform];
      const submenuItems = platformAccounts.map(account => {
        // 状态图标
        let statusIcon = '';
        switch (account.status) {
          case 'online':
            statusIcon = '🟢';
            break;
          case 'logging':
            statusIcon = '🟡';
            break;
          case 'inactive':
          case 'offline':
          default:
            statusIcon = '🔴';
            break;
        }

        return {
          label: `${statusIcon} ${account.nickname || account.username}`,
          submenu: [
            { label: '登录', click: () => accountManager.loginAccount(account.id) },
            { label: '刷新会话', click: () => accountManager.refreshSession(account.id) },
            { type: 'separator' },
            { label: '移除账号', click: () => {
              accountManager.removeAccount(account.id).then(() => {
                updateTrayMenu();
              });
            }}
          ]
        };
      });

      // 添加平台组子菜单
      const platformIcon = PLATFORM_ICONS[platform] || PLATFORM_ICONS.default;
      menuTemplate.push({
        label: `${platformIcon} ${getPlatformName(platform)} (${platformAccounts.length})`,
        submenu: submenuItems
      });
    });

    // 添加批量操作菜单项
    menuTemplate.push({ type: 'separator' });
    menuTemplate.push({ 
      label: '批量操作', 
      submenu: [
        { label: '刷新所有会话', click: () => accountManager.refreshAllSessions() },
        { label: '登录所有账号', click: () => accountManager.loginAllAccounts() }
      ]
    });

    // 添加退出菜单项
    menuTemplate.push({ type: 'separator' });
    menuTemplate.push({ label: '退出', role: 'quit' });

    // 创建菜单并设置到托盘
    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    tray.setContextMenu(contextMenu);
    
    console.log('托盘菜单已更新');
    return true;
  } catch (error) {
    console.error('更新托盘菜单失败:', error);
    return false;
  }
}

/**
 * 获取平台显示名称
 * @param {string} platformId - 平台ID
 * @returns {string} 平台显示名称
 */
function getPlatformName(platformId) {
  const platformMap = {
    'ele': '饿了么',
    'meituan': '美团',
    'jd': '京东',
    'taobao': '淘宝',
    'pinduoduo': '拼多多',
    'alipay': '支付宝',
    'wechat': '微信',
    'qq': 'QQ',
    'weibo': '微博',
    'bilibili': 'B站',
    'tiktok': '抖音国际版',
    'douyin': '抖音',
    'default': '未知平台'
  };
  
  return platformMap[platformId] || platformMap.default;
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

// 应用退出前的清理工作
app.on('before-quit', () => {
  console.log('应用准备退出，执行清理工作...');
  isQuitting = true;
  
  // 销毁托盘图标
  if (tray) {
    tray.destroy();
    tray = null;
  }
  
  // 停止会话维护和清理资源
  if (accountManager) {
    // 停止会话维护定时器
    accountManager.stopSessionMaintenance();
    
    // 安全关闭数据库连接
    try {
      if (accountManager.dbManager) {
        accountManager.dbManager.close();
      }
    } catch (dbError) {
      console.error('关闭数据库连接失败:', dbError);
    }
    
    console.log('已停止会话维护和清理数据库连接');
  }
});