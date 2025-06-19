const { BrowserWindow } = require('electron');
const path = require('path');

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
   * 创建窗口
   * @param {Object} options - 窗口选项
   * @param {string} options.id - 窗口ID
   * @param {string} options.url - 加载的URL
   * @param {string} options.title - 窗口标题
   * @returns {BrowserWindow} 浏览器窗口
   */
  createWindow(options) {
    // 确保选项存在
    options = options || {};
    
    // 确保必要的选项
    if (!options.id || !options.url) {
      throw new Error('创建窗口失败: 窗口ID和URL为必填项');
    }
    
    // 如果窗口已存在，则返回
    if (this.hasWindow(options.id)) {
      const win = this.windows.get(options.id);
      win.show();
      win.focus();
      return win;
    }
    
    // 创建新窗口
    const win = new BrowserWindow({
      width: options.width || 1200,
      height: options.height || 800,
      title: options.title ? `${options.title} - 外卖平台账号管理器` : '外卖平台账号管理器',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:${options.id}`, // 使用持久化的session
        preload: path.join(__dirname, 'browser-preload.js')
      },
      icon: path.resolve(__dirname, '../../public/default-icon.png')
    });
    
    // 加载URL
    win.loadURL(options.url);
    
    // 窗口关闭时从管理器中移除
    win.on('closed', () => {
      this.windows.delete(options.id);
    });
    
    // 存储窗口引用
    this.windows.set(options.id, win);
    
    // 开发环境打开开发者工具
    if (process.env.NODE_ENV === 'development') {
      win.webContents.openDevTools();
    }
    
    return win;
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