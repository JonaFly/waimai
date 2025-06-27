const { BrowserWindow, session, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * 窗口管理器类
 * 负责浏览器窗口的创建、显示和关闭
 */
class WindowManager {
  /**
   * 构造函数
   */
  constructor() {
    this.windows = new Map();
    this.accountStatus = new Map(); // 存储账号登录状态
    
    // 设置IPC监听器接收登录状态更新
    this._setupIpcListeners();
    
    // 监听所有窗口的关闭事件
    app.on('window-all-closed', () => {
      // 在macOS上，应用和菜单栏通常会保持活动状态，直到用户使用Cmd + Q显式退出
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
  
  /**
   * 设置IPC监听器
   * @private
   */
  _setupIpcListeners() {
    ipcMain.on('login-status-update', (event, data) => {
      if (data && data.username) {
        const isLoggedIn = data.status === 'success' || data.status === 'active';
        this.accountStatus.set(data.username, {
          status: isLoggedIn ? 'online' : 'offline',
          lastUpdate: Date.now(),
          platform: data.platform || 'unknown'
        });
        
        console.log(`账号 ${data.username} 状态更新为: ${isLoggedIn ? '在线' : '离线'}`);
        
        // 通知所有窗口账号状态已更新
        this.windows.forEach(win => {
          if (!win.isDestroyed()) {
            win.webContents.send('account-status-updated', {
              username: data.username,
              status: isLoggedIn ? 'online' : 'offline'
            });
          }
        });
      }
    });
  }
  
  /**
   * 获取账号状态
   * @param {string} username - 账号用户名
   * @returns {Object} 账号状态信息
   */
  getAccountStatus(username) {
    return this.accountStatus.get(username) || { status: 'unknown', lastUpdate: 0 };
  }
  
  /**
   * 设置账号状态
   * @param {string} username - 账号用户名
   * @param {string} status - 状态（online/offline）
   * @param {string} platform - 平台
   */
  setAccountStatus(username, status, platform) {
    this.accountStatus.set(username, {
      status: status,
      lastUpdate: Date.now(),
      platform: platform || 'unknown'
    });
    
    // 通知所有窗口账号状态已更新
    this.windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('account-status-updated', {
          username: username,
          status: status
        });
      }
    });
  }
  
  /**
   * 检查窗口是否存在
   * @param {string} id - 窗口ID
   * @returns {boolean} 窗口是否存在
   */
  hasWindow(id) {
    return this.windows.has(id) && !this.windows.get(id).isDestroyed();
  }
  
  /**
   * 获取窗口
   * @param {string} id - 窗口ID
   * @returns {BrowserWindow|null} 浏览器窗口
   */
  getWindow(id) {
    if (this.hasWindow(id)) {
      return this.windows.get(id);
    }
    return null;
  }
  
  /**
   * 创建浏览器窗口
   * @param {Object} options - 窗口选项
   * @returns {BrowserWindow} 浏览器窗口实例
   */
  createWindow(options) {
    const { id, url, title, width, height, show, profileDir } = options;
    
    // 检查是否已存在相同ID的窗口
    const existingWindow = this.windows.get(id);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.show();
      existingWindow.focus();
      return existingWindow;
    }
    
    // 确保profile目录存在
    if (profileDir && !fs.existsSync(profileDir)) {
      try {
        fs.mkdirSync(profileDir, { recursive: true });
        console.log(`创建profile目录: ${profileDir}`);
      } catch (err) {
        console.error(`创建profile目录失败: ${err.message}`);
      }
    }
    
    // 为每个窗口创建独立的session
    const customSession = profileDir ? 
      session.fromPartition(`persist:${id}`, { cache: false }) : 
      session.fromPartition('temp');
    
    // 为每个窗口设置不同的用户代理，模拟不同的浏览器环境
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:96.0) Gecko/20100101 Firefox/96.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.62',
    ];
    
    // 根据ID生成一个唯一但稳定的索引，确保同一账号始终使用相同的UA
    const hashCode = str => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // 转换为32位整数
      }
      return Math.abs(hash);
    };
    
    const uaIndex = hashCode(id) % userAgents.length;
    const userAgent = userAgents[uaIndex];
    
    // 创建窗口配置
    const windowConfig = {
      width: width || 1024,
      height: height || 768,
      title: title || 'Browser Window',
      show: show !== undefined ? show : true,
      icon: path.join(__dirname, '../../public/default-icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'browser-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:${id}`,
        backgroundThrottling: false,
        enableRemoteModule: false,
        worldSafeExecuteJavaScript: true,
        // 添加更多指纹保护选项
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false
      }
    };
    
    // 创建浏览器窗口
    const win = new BrowserWindow(windowConfig);
    
    // 设置自定义用户代理
    win.webContents.userAgent = userAgent;
    console.log(`窗口 ${id} 设置用户代理: ${userAgent}`);
    
    // 设置会话缓存路径（仅Windows平台支持）
    if (process.platform === 'win32' && profileDir) {
      try {
        const cachePath = path.join(profileDir, 'cache');
        if (!fs.existsSync(cachePath)) {
          fs.mkdirSync(cachePath, { recursive: true });
        }
        
        if (win.webContents && win.webContents.session && 
            typeof win.webContents.session.setCachePath === 'function') {
          win.webContents.session.setCachePath(cachePath);
          console.log(`窗口 ${id} 设置缓存路径: ${cachePath}`);
        }
      } catch (err) {
        console.warn(`设置缓存路径失败: ${err.message}`);
      }
    }
    
    // 修改指纹信息
    win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      // 修改请求头，添加更多随机性
      const headers = details.requestHeaders;
      
      // 保持用户代理一致
      headers['User-Agent'] = userAgent;
      
      // 修改Accept-Language，根据ID生成稳定的值
      const languages = [
        'zh-CN,zh;q=0.9,en;q=0.8',
        'en-US,en;q=0.9,zh;q=0.8',
        'zh-TW,zh;q=0.9,en;q=0.8',
        'en-GB,en;q=0.9',
        'ja-JP,ja;q=0.9,en;q=0.8',
      ];
      headers['Accept-Language'] = languages[hashCode(id) % languages.length];
      
      callback({ requestHeaders: headers });
    });
    
    // 屏蔽WebRTC以防止IP泄露
    win.webContents.on('did-finish-load', () => {
      // 检查窗口是否已销毁
      if (win.isDestroyed()) {
        console.log(`窗口 ${id} 已销毁，无法注入浏览器保护脚本`);
        return;
      }

      // 修改平台信息
      const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];
      const platformIndex = hashCode(id) % platforms.length;
      const selectedPlatform = platforms[platformIndex];
      
      // 使用更简单的方法注入脚本
      const protectionScript = `
        // 修改navigator.platform
        try {
          const originalPlatformGetter = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform').get;
          Object.defineProperty(Navigator.prototype, 'platform', {
            get: function() { return "${selectedPlatform}"; }
          });
          console.log('成功修改navigator.platform为: ${selectedPlatform}');
        } catch (e) {
          console.error('修改navigator.platform失败:', e);
        }
        
        // 禁用WebRTC
        try {
          if (navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia = function() {
              return Promise.reject(new Error('getUserMedia is disabled'));
            };
            console.log('成功禁用WebRTC getUserMedia');
          }
          
          // 禁用RTCPeerConnection
          window.RTCPeerConnection = function() {
            throw new Error('RTCPeerConnection is disabled');
          };
          window.webkitRTCPeerConnection = function() {
            throw new Error('webkitRTCPeerConnection is disabled');
          };
          console.log('成功禁用RTCPeerConnection');
        } catch (e) {
          console.error('禁用WebRTC失败:', e);
        }
      `;
      
      win.webContents.executeJavaScript(protectionScript)
        .then(() => {
          console.log(`窗口 ${id} 成功应用浏览器指纹保护`);
        })
        .catch(err => {
          console.error(`窗口 ${id} 应用浏览器指纹保护失败:`, err);
        });
    });
    
    // 加载URL
    if (url) {
      win.loadURL(url).catch(err => {
        console.error(`加载URL失败: ${url}`, err);
      });
    }
    
    // 设置消息处理程序
    this.setupMessageHandlers(win, id);
    
    // 存储窗口引用
    this.windows.set(id, win);
    
    // 窗口关闭时清理引用和监听器
    win.once('closed', () => {
      console.log(`窗口 ${id} 已关闭，清理资源`);
      
      // 从窗口映射表中移除
      this.windows.delete(id);
      
      // 移除所有特定于此窗口的监听器
      win.removeAllListeners();
      
      // 如果有自定义session，可以考虑清理session
      if (customSession && typeof customSession.clearCache === 'function') {
        try {
          customSession.clearCache().catch(err => {
            console.warn(`清理窗口 ${id} 的session缓存失败:`, err);
          });
        } catch (err) {
          console.warn(`尝试清理窗口 ${id} 的session时出错:`, err);
        }
      }
    });
    
    return win;
  }
  
  /**
   * 设置窗口消息处理程序
   * @param {BrowserWindow} win - 浏览器窗口实例
   * @param {string} windowId - 窗口ID
   */
  setupMessageHandlers(win, windowId) {
    // 从windowId中提取账号信息
    const parts = windowId.split('-');
    let platform = '';
    let username = '';
    
    if (parts.length >= 2) {
      platform = parts[0];
      username = parts[1];
    }
    
    // 创建一个特定于此窗口的消息处理函数
    const messageHandler = (event, message) => {
      try {
        // 确保消息来自此窗口和窗口未被销毁
        if (event.sender !== win.webContents || win.isDestroyed()) {
          return;
        }
        
        // 处理登录状态消息
        if (message && message.type === 'login-status') {
          const data = message.data;
          
          // 更新账号状态
          if (username) {
            this.updateAccountStatus(username, {
              status: data.isLoggedIn ? 'online' : 'offline',
              platform: data.platform || platform,
              url: data.url,
              indicator: data.indicator,
              isLoginPage: data.isLoginPage,
              lastUpdate: Date.now()
            });
            
            // 发送状态更新事件
            this.emitStatusUpdate(username, data.isLoggedIn ? 'online' : 'offline');
          }
        }
      } catch (error) {
        console.error(`处理窗口消息时出错: ${error.message}`);
      }
    };
    
    // 注册消息处理函数
    ipcMain.on('message', messageHandler);
    
    // 窗口关闭时移除监听器，防止内存泄漏和对已销毁对象的引用
    win.once('closed', () => {
      ipcMain.removeListener('message', messageHandler);
      console.log(`窗口 ${windowId} 已关闭，移除消息监听器`);
    });
    
    // 监听页面加载完成事件
    win.webContents.on('did-finish-load', () => {
      try {
        // 检查窗口是否已销毁
        if (win.isDestroyed()) {
          console.log(`窗口 ${windowId} 已销毁，无法注入脚本`);
          return;
        }
        
        // 使用更安全的方式注入窗口ID
        const script = `
          (function() {
            try {
              if (window.accountBrowser) {
                console.log("正在设置窗口ID: \${windowId}");
                if (typeof window.accountBrowser.setWindowId === 'function') {
                  return window.accountBrowser.setWindowId('${windowId}');
                } else {
                  console.error("setWindowId方法不存在");
                  window._windowId = '${windowId}';
                  return false;
                }
              } else {
                console.error("accountBrowser对象不存在");
                return false;
              }
            } catch(e) {
              console.error("设置窗口ID时出错:", e);
              return false;
            }
          })();
        `;
        
        win.webContents.executeJavaScript(script, true)
          .then(result => {
            if (result) {
              console.log(`成功注入窗口ID: ${windowId}`);
            } else {
              console.warn(`注入窗口ID失败: ${windowId} - accountBrowser接口可能不可用`);
            }
          })
          .catch(err => {
            console.error(`注入窗口ID失败: ${windowId} - ${err.message}`);
          });
      } catch (err) {
        console.error(`注入窗口ID时发生异常: ${err.message}`);
      }
    });
  }
  
  /**
   * 更新账号状态
   * @param {string} username - 账号用户名
   * @param {Object} status - 状态对象
   */
  updateAccountStatus(username, status) {
    this.accountStatus.set(username, {
      ...status,
      timestamp: Date.now()
    });
    
    console.log(`更新账号状态: ${username} => ${status.status} (${status.indicator || '无指示器'})`);
  }
  
  /**
   * 发送状态更新事件
   * @param {string} username - 账号用户名
   * @param {string} status - 状态
   */
  emitStatusUpdate(username, status) {
    // 发送给所有窗口
    BrowserWindow.getAllWindows().forEach(win => {
      try {
        if (!win.isDestroyed() && win.webContents) {
          win.webContents.send('account-status-update', {
            username,
            status,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error(`发送状态更新到窗口失败: ${error.message}`);
      }
    });
    
    // 发送全局事件
    app.emit('account-status-update', {
      username,
      status,
      timestamp: Date.now()
    });
  }
  
  /**
   * 显示窗口
   * @param {string} id - 窗口ID
   * @returns {boolean} 是否成功显示窗口
   */
  showWindow(id) {
    const win = this.getWindow(id);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      return true;
    }
    return false;
  }
  
  /**
   * 隐藏窗口
   * @param {string} id - 窗口ID
   * @returns {boolean} 是否成功隐藏窗口
   */
  hideWindow(id) {
    const win = this.getWindow(id);
    if (win) {
      win.hide();
      return true;
    }
    return false;
  }
  
  /**
   * 最小化窗口
   * @param {string} id - 窗口ID
   * @returns {boolean} 是否成功最小化窗口
   */
  minimizeWindow(id) {
    const win = this.getWindow(id);
    if (win) {
      win.minimize();
      return true;
    }
    return false;
  }
  
  /**
   * 关闭窗口
   * @param {string} id - 窗口ID
   * @returns {boolean} 是否成功关闭窗口
   */
  closeWindow(id) {
    const win = this.getWindow(id);
    if (win) {
      win.close();
      return true;
    }
    return false;
  }
  
  /**
   * 关闭所有窗口
   */
  closeAllWindows() {
    this.windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.close();
      }
    });
    this.windows.clear();
  }
  
  /**
   * 获取所有窗口
   * @returns {Map} 窗口映射表
   */
  getAllWindows() {
    // 清理已销毁的窗口
    for (const [id, win] of this.windows.entries()) {
      if (win.isDestroyed()) {
        this.windows.delete(id);
      }
    }
    return this.windows;
  }
  
  /**
   * 获取窗口数量
   * @returns {number} 窗口数量
   */
  getWindowCount() {
    return this.windows.size;
  }
}

module.exports = WindowManager; 