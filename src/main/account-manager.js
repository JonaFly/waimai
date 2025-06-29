const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');
const loginScripts = require('./login-scripts');
const EventEmitter = require('events');

/**
 * 账号管理器类
 * 负责账号的添加、删除、编辑和登录
 */
class AccountManager extends EventEmitter {
  /**
   * 构造函数
   * @param {string} encryptionKey - 用于加密账号信息的密钥
   */
  constructor(encryptionKey) {
    super(); // 初始化EventEmitter
    
    this.encryptionKey = encryptionKey;
    this.accounts = [];
    this.dataPath = path.join(app.getPath('userData'), 'accounts.json');
    
    // 添加profiles目录路径
    this.profilesDir = path.join(app.getPath('userData'), 'profiles');
    
    // 确保profiles目录存在
    if (!fs.existsSync(this.profilesDir)) {
      try {
        fs.mkdirSync(this.profilesDir, { recursive: true });
      } catch (err) {
        console.error('创建profiles目录失败:', err);
      }
    }
    
    this.platformConfigs = {
      'meituan': {
        name: '美团外卖',
        loginUrl: 'https://e.waimai.meituan.com/',
        checkUrl: 'https://e.waimai.meituan.com/v2/index/home'
      },
      'jingdong': {
        name: '京东外卖',
        loginUrl: 'https://store.jddj.com/',
        checkUrl: 'https://store.jddj.com/home'
      },
      'eleme': {
        name: '饿了么',
        loginUrl: 'https://shanghu.ele.me/supervip/login',
        checkUrl: 'https://shanghu.ele.me/supervip/index'
      }
    };
    
    // 保存窗口管理器引用
    this.windowManager = null;
    
    // 会话维护定时器
    this.sessionMaintenanceTimer = null;
    
    // 数据文件路径
    this.dataDir = path.join(process.env.HOME || process.env.USERPROFILE, '.waimai-account-manager');
    this.accountsFile = path.join(this.dataDir, 'accounts.json');
    
    // 确保数据目录存在
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  /**
   * 设置窗口管理器
   * @param {WindowManager} windowManager - 窗口管理器实例
   */
  setWindowManager(windowManager) {
    this.windowManager = windowManager;
    
    // 设置后启动会话维护任务
    this.startSessionMaintenance();
  }

  /**
   * 启动会话维护任务
   * @param {number} interval - 维护间隔（毫秒），默认1小时
   */
  startSessionMaintenance(interval = 1 * 60 * 60 * 1000) {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
    }
    
    this.maintenanceTimer = setInterval(() => {
      this.maintainSessions();
    }, interval);
    
    console.log(`会话维护任务已启动，间隔: ${interval/1000/60/60}小时`);
    
    // 立即执行一次会话维护
    setTimeout(() => {
      this.maintainSessions();
    }, 10000); // 启动10秒后执行
  }

  /**
   * 停止会话维护任务
   */
  stopSessionMaintenance() {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
      console.log('会话维护任务已停止');
    }
  }

  /**
   * 通过静默访问页面刷新会话
   * @param {string} accountId - 账号ID
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async refreshSessionBySilentVisit(accountId) {
    let win = null;
    try {
      const account = this.accounts.find(acc => acc.id === accountId);
      if (!account) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }
      
      // 获取平台配置
      const platformConfig = this.platformConfigs[account.platform];
      if (!platformConfig) {
        throw new Error(`未知平台: ${account.platform}`);
      }
      
      if (!this.windowManager) {
        throw new Error('窗口管理器未初始化');
      }
      
      console.log(`开始为账号 ${account.username} (${account.platform}) 静默刷新会话...`);
      
      // 创建唯一的会话ID
      const sessionId = `${account.platform}-${account.username}-silent`;
      
      // 创建账号专属的profile目录
      const profileDir = path.join(this.profilesDir, `${account.platform}-${account.username}`);
      if (!fs.existsSync(profileDir)) {
        try {
          fs.mkdirSync(profileDir, { recursive: true });
          console.log(`为账号 ${account.username} 创建profile目录: ${profileDir}`);
          
          // 在Windows上确保目录有正确的权限
          if (process.platform === 'win32') {
            try {
              // 尝试在目录中创建一个测试文件以验证权限
              const testFilePath = path.join(profileDir, '.permission-test');
              fs.writeFileSync(testFilePath, 'test', 'utf8');
              fs.unlinkSync(testFilePath);
              console.log(`验证Windows目录权限成功: ${profileDir}`);
            } catch (permErr) {
              console.error(`Windows目录权限验证失败: ${profileDir}`, permErr);
              
              // 尝试使用更宽松的权限重新创建目录
              try {
                const { execSync } = require('child_process');
                execSync(`icacls "${profileDir}" /grant:r "*S-1-1-0:(OI)(CI)F" /T`);
                console.log(`已尝试修复Windows目录权限: ${profileDir}`);
              } catch (fixErr) {
                console.error(`修复Windows目录权限失败: ${fixErr.message}`);
              }
            }
          }
        } catch (err) {
          console.error(`创建profile目录失败: ${err.message}`);
        }
      }
      
      // 使用window-manager创建新窗口并打开检查URL，指定使用账号专属的profile
      win = this.windowManager.createWindow({
        id: sessionId,
        url: platformConfig.checkUrl,
        title: `${platformConfig.name} - ${account.username} (静默刷新)`,
        width: 800,
        height: 600,
        show: false, // 静默模式不显示窗口
        profileDir: profileDir // 添加profile目录参数
      });
      
      // 尝试加载cookie到session，添加重试机制
      let cookieLoadSuccess = false;
      let cookieLoadAttempts = 0;
      const maxCookieLoadAttempts = 3;
      
      while (!cookieLoadSuccess && cookieLoadAttempts < maxCookieLoadAttempts) {
        try {
          cookieLoadAttempts++;
          console.log(`尝试加载账号 ${account.username} 的cookie (尝试 ${cookieLoadAttempts}/${maxCookieLoadAttempts})...`);
          
          cookieLoadSuccess = await this.loadCookiesForAccount(accountId, win);
          
          if (cookieLoadSuccess) {
            console.log(`账号 ${account.username} 的cookie已成功加载到静默刷新窗口`);
          } else {
            console.warn(`账号 ${account.username} 的cookie加载失败，可能没有保存的cookie`);
            // 如果没有cookie，可能需要重新登录，但我们仍然继续尝试访问检查URL
          }
        } catch (err) {
          console.error(`加载账号 ${account.username} 的cookie失败 (尝试 ${cookieLoadAttempts}/${maxCookieLoadAttempts}):`, err);
          
          // 如果不是最后一次尝试，等待后重试
          if (cookieLoadAttempts < maxCookieLoadAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      // 等待页面加载完成
      return new Promise((resolve, reject) => {
        // 设置超时
        const timeout = setTimeout(() => {
          try {
            if (win && !win.isDestroyed()) {
              console.log(`账号 ${account.username} 静默刷新超时，关闭窗口`);
              win.close();
            }
          } catch (err) {
            console.error(`关闭窗口失败: ${err.message}`);
          }
          resolve(false);
        }, 90000); // 90秒超时，增加等待时间
        
        // 监听页面加载完成事件
        win.webContents.on('did-finish-load', async () => {
          try {
            // 检查窗口是否已销毁
            if (!win || win.isDestroyed()) {
              clearTimeout(timeout);
              resolve(false);
              return;
            }
            
            // 获取当前URL
            const currentUrl = win.webContents.getURL();
            console.log(`账号 ${account.username} 页面加载完成: ${currentUrl}`);
            
            // 检查是否重定向到了登录页面
            if (currentUrl.includes('login') || currentUrl.includes('signin')) {
              console.log(`账号 ${account.username} 被重定向到登录页面，会话可能已失效`);
              try {
                if (win && !win.isDestroyed()) {
                  win.close();
                }
              } catch (err) {
                console.error(`关闭窗口失败: ${err.message}`);
              }
              clearTimeout(timeout);
              resolve(false);
              return;
            }
            
            // 等待一段时间，确保页面完全加载和可能的异步操作完成
            await new Promise(r => setTimeout(r, 15000)); // 增加等待时间到15秒
            
            // 再次检查窗口是否已销毁
            if (!win || win.isDestroyed()) {
              clearTimeout(timeout);
              resolve(false);
              return;
            }
            
            // 注入脚本检查登录状态
            try {
              const isLoggedIn = await win.webContents.executeJavaScript(`
                (function() {
                  try {
                    // 检查是否有登录状态指示元素
                    const hasLoginIndicator = [
                      document.querySelector('.mt-component-nav'),
                      document.querySelector('.mt-component-layout'),
                      document.querySelector('.header-user-info'),
                      document.querySelector('.merchant-dashboard'),
                      document.querySelector('.admin-panel'),
                      document.querySelector('.jddj-header'),
                      document.querySelector('.navbar-right'),
                      document.querySelector('.user-dropdown')
                    ].some(el => !!el);
                    
                    // 检查URL特征
                    const hasUrlIndicator = 
                      window.location.href.includes('/merchant/') || 
                      window.location.href.includes('/business/') ||
                      window.location.href.includes('/admin/') ||
                      window.location.href.includes('/dashboard') ||
                      window.location.href.includes('/home') ||
                      window.location.href.includes('/index');
                    
                    // 检查页面文本内容
                    const bodyText = document.body.innerText || '';
                    const hasTextIndicator = 
                      bodyText.includes('全部门店') || 
                      bodyText.includes('商家中心') ||
                      bodyText.includes('订单管理') ||
                      bodyText.includes('商品管理') ||
                      bodyText.includes('账户管理') ||
                      bodyText.includes('数据分析') ||
                      bodyText.includes('退出') ||
                      bodyText.includes('登出');
                    
                    // 检查特定元素的文本内容
                    const headerTexts = Array.from(document.querySelectorAll('header, .header, .nav, .navbar, .navigation'))
                      .map(el => el.innerText || '')
                      .join(' ');
                    
                    const hasHeaderIndicator = 
                      headerTexts.includes('退出') || 
                      headerTexts.includes('登出') ||
                      headerTexts.includes('账户') ||
                      headerTexts.includes('设置');
                    
                    // 检查是否有登录失败或过期的提示
                    const hasLoginFailure = 
                      bodyText.includes('登录已过期') ||
                      bodyText.includes('请重新登录') ||
                      bodyText.includes('登录超时') ||
                      bodyText.includes('会话已过期');
                    
                    // 如果有登录失败提示，则认为未登录
                    if (hasLoginFailure) {
                      return false;
                    }
                    
                    return hasLoginIndicator || hasUrlIndicator || hasTextIndicator || hasHeaderIndicator;
                  } catch (e) {
                    console.error('检查登录状态出错:', e);
                    return false;
                  }
                })();
              `);
              
              console.log(`账号 ${account.username} 登录状态检查结果: ${isLoggedIn ? '已登录' : '未登录'}`);
              
              if (!isLoggedIn) {
                console.log(`账号 ${account.username} 未检测到登录状态，可能需要重新登录`);
                try {
                  if (win && !win.isDestroyed()) {
                    win.close();
                  }
                } catch (err) {
                  console.error(`关闭窗口失败: ${err.message}`);
                }
                clearTimeout(timeout);
                resolve(false);
                return;
              }
            } catch (err) {
              console.error(`执行登录状态检查脚本失败:`, err);
              // 继续执行，不要因为脚本执行失败而中断流程
            }
            
            // 获取并保存cookie，添加重试机制
            let cookieSaveSuccess = false;
            let cookieSaveAttempts = 0;
            const maxCookieSaveAttempts = 3;
            
            while (!cookieSaveSuccess && cookieSaveAttempts < maxCookieSaveAttempts) {
              try {
                cookieSaveAttempts++;
                console.log(`尝试保存账号 ${account.username} 的cookie (尝试 ${cookieSaveAttempts}/${maxCookieSaveAttempts})...`);
                
                cookieSaveSuccess = await this.saveCookiesForAccount(account.id, win);
                
                if (cookieSaveSuccess) {
                  console.log(`账号 ${account.username} 的cookie已成功保存`);
                } else {
                  console.warn(`账号 ${account.username} 的cookie保存失败`);
                  
                  // 如果不是最后一次尝试，等待后重试
                  if (cookieSaveAttempts < maxCookieSaveAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                }
              } catch (err) {
                console.error(`保存账号 ${account.username} 的cookie失败 (尝试 ${cookieSaveAttempts}/${maxCookieSaveAttempts}):`, err);
                
                // 如果不是最后一次尝试，等待后重试
                if (cookieSaveAttempts < maxCookieSaveAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            }
            
            // 清理资源
            try {
              if (win && !win.isDestroyed()) {
                win.close();
              }
            } catch (err) {
              console.error(`关闭窗口失败: ${err.message}`);
            }
            
            clearTimeout(timeout);
            resolve(cookieSaveSuccess);
          } catch (err) {
            console.error(`处理页面加载完成事件失败:`, err);
            try {
              if (win && !win.isDestroyed()) {
                win.close();
              }
            } catch (closeErr) {
              console.error(`关闭窗口失败: ${closeErr.message}`);
            }
            clearTimeout(timeout);
            resolve(false);
          }
        });
        
        // 监听加载失败事件
        win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
          console.error(`账号 ${account.username} 页面加载失败: ${errorDescription} (${errorCode})`);
          try {
            if (win && !win.isDestroyed()) {
              win.close();
            }
          } catch (err) {
            console.error(`关闭窗口失败: ${err.message}`);
          }
          clearTimeout(timeout);
          resolve(false);
        });
      });
    } catch (error) {
      console.error(`刷新账号 ${accountId} 会话失败:`, error);
      // 确保窗口被关闭
      try {
        if (win && !win.isDestroyed()) {
          win.close();
        }
      } catch (err) {
        console.error(`关闭窗口失败: ${err.message}`);
      }
      return false;
    }
  }

  /**
   * 维护所有在线账号的会话
   * @returns {Promise<{total: number, success: number, failed: number, results: Array}>} 维护结果统计
   */
  async maintainSessions() {
    try {
      // 筛选出在线账号
      const onlineAccounts = this.accounts.filter(acc => acc.status === 'online');
      console.log(`开始维护会话，共有 ${onlineAccounts.length} 个在线账号`);
      
      if (onlineAccounts.length === 0) {
        console.log('没有在线账号，跳过会话维护');
        return { total: 0, success: 0, failed: 0, results: [] };
      }
      
      const results = [];
      let successCount = 0;
      let failedCount = 0;
      
      // 使用Promise.all并发处理多个账号，但限制并发数量
      const concurrentLimit = 3; // 限制并发数量为3
      const chunks = [];
      
      // 将账号分组，每组不超过并发限制
      for (let i = 0; i < onlineAccounts.length; i += concurrentLimit) {
        chunks.push(onlineAccounts.slice(i, i + concurrentLimit));
      }
      
      // 按组顺序处理账号
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (account) => {
          const startTime = Date.now();
          console.log(`开始为账号 ${account.username} (${account.platform}) 维护会话...`);
          
          try {
            // 使用静默方式刷新会话
            const success = await this.refreshSessionBySilentVisit(account.id);
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            if (success) {
              console.log(`账号 ${account.username} (${account.platform}) 会话维护成功，耗时 ${duration} 秒`);
              successCount++;
              results.push({
                accountId: account.id,
                username: account.username,
                platform: account.platform,
                success: true,
                message: `会话维护成功，耗时 ${duration} 秒`,
                timestamp: new Date().toISOString()
              });
              
              // 更新账号最后活动时间
              this.updateAccountLastActiveTime(account.id);
            } else {
              console.warn(`账号 ${account.username} (${account.platform}) 会话维护失败，耗时 ${duration} 秒`);
              failedCount++;
              results.push({
                accountId: account.id,
                username: account.username,
                platform: account.platform,
                success: false,
                message: `会话维护失败，耗时 ${duration} 秒`,
                timestamp: new Date().toISOString()
              });
              
              // 标记账号可能离线
              this.updateAccountStatus(account.id, 'unknown');
            }
          } catch (error) {
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            console.error(`账号 ${account.username} (${account.platform}) 会话维护出错: ${error.message}，耗时 ${duration} 秒`);
            failedCount++;
            results.push({
              accountId: account.id,
              username: account.username,
              platform: account.platform,
              success: false,
              message: `会话维护出错: ${error.message}，耗时 ${duration} 秒`,
              timestamp: new Date().toISOString()
            });
            
            // 标记账号可能离线
            this.updateAccountStatus(account.id, 'unknown');
          }
        });
        
        // 等待当前组的所有账号处理完成
        await Promise.all(chunkPromises);
        
        // 添加一些延迟，避免过快请求导致被平台限制
        if (chunks.indexOf(chunk) < chunks.length - 1) {
          console.log(`等待 5 秒后处理下一批账号...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      const totalTime = new Date().toLocaleTimeString();
      console.log(`会话维护完成 (${totalTime})，共 ${onlineAccounts.length} 个账号，成功: ${successCount}，失败: ${failedCount}`);
      
      // 如果有账号维护失败，记录警告日志
      if (failedCount > 0) {
        console.warn(`有 ${failedCount} 个账号会话维护失败，可能需要手动重新登录`);
      }
      
      // 保存账号列表，确保状态更新被持久化
      await this.saveAccounts();
      
      return {
        total: onlineAccounts.length,
        success: successCount,
        failed: failedCount,
        results: results
      };
    } catch (error) {
      console.error('会话维护过程中发生错误:', error);
      return {
        total: 0,
        success: 0,
        failed: 0,
        error: error.message,
        results: []
      };
    }
  }

  /**
   * 加载账号列表
   * @returns {Promise<Array>} 账号列表
   */
  async loadAccounts() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf8');
        this.accounts = this.decryptData(data);
      } else {
        // 如果文件不存在，创建空文件
        this.accounts = [];
        this.saveAccounts();
      }
      return this.accounts;
    } catch (error) {
      console.error('加载账号失败:', error);
      this.accounts = [];
      return [];
    }
  }

  /**
   * 保存账号列表
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveAccounts() {
    try {
      const data = this.encryptData(this.accounts);
      fs.writeFileSync(this.dataPath, data, 'utf8');
      return true;
    } catch (error) {
      console.error('保存账号失败:', error);
      return false;
    }
  }

  /**
   * 获取账号列表
   * @returns {Array} 账号列表
   */
  getAccounts() {
    return this.accounts.map(account => {
      // 返回不含密码的账号信息
      const { password, ...safeAccount } = account;
      return safeAccount;
    });
  }

  /**
   * 获取平台列表
   * @returns {Array} 平台列表
   */
  getPlatformList() {
    return Object.keys(this.platformConfigs).map(id => ({
      id,
      name: this.platformConfigs[id].name
    }));
  }

  /**
   * 添加账号
   * @param {Object} accountData - 账号数据
   * @returns {Promise<Object>} 添加结果
   */
  async addAccount(accountData) {
    try {
      if (!accountData.platform || !accountData.username || !accountData.password) {
        throw new Error('平台、用户名和密码不能为空');
      }

      // 检查是否已存在相同平台和用户名的账号
      const existingAccount = this.accounts.find(
        acc => acc.platform === accountData.platform && acc.username === accountData.username
      );

      if (existingAccount) {
        throw new Error(`该平台已存在相同用户名的账号: ${accountData.username}`);
      }

      // 生成唯一ID
      const newAccount = {
        id: Date.now().toString(),
        platform: accountData.platform,
        username: accountData.username,
        password: accountData.password,
        nickname: accountData.nickname || '',
        status: 'unknown',
        lastLoginTime: null,
        createdAt: new Date().toISOString()
      };

      this.accounts.push(newAccount);
      await this.saveAccounts();

      // 返回不含密码的账号信息
      const { password, ...safeAccount } = newAccount;
      return safeAccount;
    } catch (error) {
      console.error('添加账号失败:', error);
      throw error;
    }
  }

  /**
   * 删除账号
   * @param {string} accountId - 账号ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteAccount(accountId) {
    try {
      const index = this.accounts.findIndex(acc => acc.id === accountId);
      if (index === -1) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }

      this.accounts.splice(index, 1);
      await this.saveAccounts();
      return true;
    } catch (error) {
      console.error('删除账号失败:', error);
      throw error;
    }
  }

  /**
   * 编辑账号
   * @param {string} accountId - 账号ID
   * @param {Object} accountData - 账号数据
   * @returns {Promise<Object>} 编辑结果
   */
  async editAccount(accountId, accountData) {
    try {
      const index = this.accounts.findIndex(acc => acc.id === accountId);
      if (index === -1) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }

      // 检查是否与其他账号重复（除了自己）
      const isDuplicate = this.accounts.some(
        acc => acc.id !== accountId && 
        acc.platform === accountData.platform && 
        acc.username === accountData.username
      );

      if (isDuplicate) {
        throw new Error(`该平台已存在相同用户名的账号: ${accountData.username}`);
      }

      // 更新账号信息
      this.accounts[index] = {
        ...this.accounts[index],
        platform: accountData.platform || this.accounts[index].platform,
        username: accountData.username || this.accounts[index].username,
        nickname: accountData.nickname || this.accounts[index].nickname,
        updatedAt: new Date().toISOString()
      };

      // 如果提供了新密码，则更新密码
      if (accountData.password) {
        this.accounts[index].password = accountData.password;
      }

      await this.saveAccounts();

      // 返回不含密码的账号信息
      const { password, ...safeAccount } = this.accounts[index];
      return safeAccount;
    } catch (error) {
      console.error('编辑账号失败:', error);
      throw error;
    }
  }

  /**
   * 登录账号
   * @param {string} accountId - 账号ID
   * @param {boolean} silent - 是否静默登录（后台运行）
   * @returns {Promise<boolean>} 是否登录成功
   */
  async loginAccount(accountId, silent = false) {
    try {
      const account = this.accounts.find(acc => acc.id === accountId);
      if (!account) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }

      // 获取平台配置
      const platformConfig = this.platformConfigs[account.platform];
      if (!platformConfig) {
        throw new Error(`未知平台: ${account.platform}`);
      }

      if (!this.windowManager) {
        throw new Error('窗口管理器未初始化');
      }

      // 创建唯一的会话ID
      const sessionId = `${account.platform}-${account.username}`;
      
      // 创建账号专属的profile目录
      const profileDir = path.join(this.profilesDir, sessionId);
      if (!fs.existsSync(profileDir)) {
        try {
          fs.mkdirSync(profileDir, { recursive: true });
          console.log(`为账号 ${account.username} 创建profile目录: ${profileDir}`);
        } catch (err) {
          console.error(`创建profile目录失败: ${err.message}`);
        }
      }
      
      // 使用window-manager创建新窗口并打开登录URL，指定使用账号专属的profile
      const win = this.windowManager.createWindow({
        id: sessionId,
        url: platformConfig.loginUrl,
        title: `${platformConfig.name} - ${account.username}`,
        width: silent ? 800 : 1200,
        height: silent ? 600 : 800,
        show: !silent, // 静默模式不显示窗口
        profileDir: profileDir // 添加profile目录参数
      });
      
      // 尝试加载cookie到session
      try {
        await this.loadCookiesForAccount(accountId, win);
      } catch (err) {
        console.error(`加载账号 ${account.username} 的cookie失败:`, err);
        // 继续执行，即使cookie加载失败
      }
      
      // 为所有窗口注入自动填充脚本，不只是静默模式
      if (win) {
        win.webContents.on('did-finish-load', async () => {
          try {
            const url = win.webContents.getURL();
            
            // 检查是否在登录页面
            if (url.includes('login') || url.includes('signin')) {
              // 等待页面完全加载
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // 注入自动填充脚本（根据不同平台可能需要调整）
              await win.webContents.executeJavaScript(loginScripts.createLoginScript(account.platform, account.username, account.password));
            }
          } catch (err) {
            console.error('执行自动登录脚本失败:', err);
          }
        });
        
        // 监听导航完成事件，用于保存cookie
        win.webContents.on('did-navigate', async () => {
          try {
            // 获取当前URL
            const currentUrl = win.webContents.getURL();
            
            // 检查是否已经登录成功（在非登录页面）
            if (!currentUrl.includes('login') && !currentUrl.includes('signin')) {
              // 获取并保存cookie
              await this.saveCookiesForAccount(account.id, win);
            }
          } catch (err) {
            console.error('保存cookie失败:', err);
          }
        });
        
        // 只有在静默模式下才设置自动关闭
        if (silent) {
          // 设置超时，一段时间后关闭静默窗口
          setTimeout(() => {
            if (!win.isDestroyed()) {
              win.close();
            }
          }, 60000); // 1分钟后关闭
        }
      }

      // 更新登录时间
      const index = this.accounts.findIndex(acc => acc.id === accountId);
      this.accounts[index].lastLoginTime = new Date().toISOString();
      this.accounts[index].status = 'online';
      
      // 记录profile路径
      this.accounts[index].profileDir = profileDir;
      
      await this.saveAccounts();

      return true;
    } catch (error) {
      console.error('登录账号失败:', error);
      throw error;
    }
  }
  
  /**
   * 为指定账号保存cookie
   * @param {string} accountId - 账号ID
   * @param {BrowserWindow} win - 浏览器窗口实例
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveCookiesForAccount(accountId, win) {
    try {
      if (!win) {
        throw new Error('窗口参数为空');
      }
      
      if (win.isDestroyed()) {
        throw new Error('窗口已关闭或不存在');
      }
      
      // 查找账号
      const index = this.accounts.findIndex(acc => acc.id === accountId);
      if (index === -1) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }
      
      const account = this.accounts[index];
      console.log(`开始为账号 ${account.username} (${account.platform}) 保存cookie...`);
      
      // 获取当前窗口的所有cookie
      let cookies;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          cookies = await win.webContents.session.cookies.get({});
          break; // 成功获取，跳出循环
        } catch (err) {
          retries++;
          console.error(`获取cookie失败(尝试 ${retries}/${maxRetries}): ${err.message}`);
          
          if (retries >= maxRetries) {
            throw new Error(`多次尝试获取cookie均失败: ${err.message}`);
          }
          
          // 等待一段时间再重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (!cookies || cookies.length === 0) {
        console.warn('没有找到可保存的cookie');
        return false;
      }
      
      console.log(`获取到账号 ${account.username} 的cookie，共 ${cookies.length} 个`);
      
      // 过滤掉可能导致问题的cookie
      const filteredCookies = cookies.filter(cookie => {
        // 确保cookie有必要的字段
        if (!cookie.name || cookie.name.trim() === '') {
          console.warn('过滤掉无效的cookie: 名称为空');
          return false;
        }
        
        // 过滤掉可能导致问题的cookie (例如某些特殊的会话cookie)
        const problematicNames = ['__Secure-', '__Host-', 'XSRF-TOKEN'];
        if (problematicNames.some(prefix => cookie.name.startsWith(prefix))) {
          console.warn(`过滤掉可能导致问题的cookie: ${cookie.name}`);
          return false;
        }
        
        return true;
      });
      
      if (filteredCookies.length < cookies.length) {
        console.log(`过滤后的cookie数量: ${filteredCookies.length} (原始: ${cookies.length})`);
      }
      
      // 保存cookie到账号信息中
      this.accounts[index].cookies = filteredCookies;
      this.accounts[index].lastCookieSaveTime = new Date().toISOString();
      
      // 保存cookie到本地文件
      const cookieFilePath = path.join(
        this.profilesDir, 
        `${account.platform}-${account.username}`, 
        'cookies.json'
      );
      
      // 在Windows上检查路径是否过长
      let finalCookiePath = cookieFilePath;
      if (process.platform === 'win32' && cookieFilePath.length > 260) {
        console.warn(`Windows路径过长可能导致问题: ${cookieFilePath.length} 字符`);
        
        // 使用短路径
        finalCookiePath = path.join(
          this.profilesDir,
          Buffer.from(`${account.platform}-${account.username}`).toString('base64').substring(0, 10),
          'cookies.json'
        );
        console.log(`使用短路径保存cookie: ${finalCookiePath}`);
      }
      
      // 确保目录存在
      try {
        const cookieDir = path.dirname(finalCookiePath);
        if (!fs.existsSync(cookieDir)) {
          fs.mkdirSync(cookieDir, { recursive: true });
          console.log(`为账号 ${account.username} 创建cookie目录: ${cookieDir}`);
          
          // 在Windows上确保目录有正确的权限
          if (process.platform === 'win32') {
            try {
              // 尝试在目录中创建一个测试文件以验证权限
              const testFilePath = path.join(cookieDir, '.permission-test');
              fs.writeFileSync(testFilePath, 'test', 'utf8');
              fs.unlinkSync(testFilePath);
              console.log(`验证Windows目录权限成功: ${cookieDir}`);
            } catch (permErr) {
              console.error(`Windows目录权限验证失败: ${cookieDir}`, permErr);
              
              // 尝试使用更宽松的权限重新创建目录
              try {
                const { execSync } = require('child_process');
                execSync(`icacls "${cookieDir}" /grant:r "*S-1-1-0:(OI)(CI)F" /T`);
                console.log(`已尝试修复Windows目录权限: ${cookieDir}`);
              } catch (fixErr) {
                console.error(`修复Windows目录权限失败: ${fixErr.message}`);
              }
            }
          }
        }
        
        // 加密保存cookie
        const encryptedCookies = this.encryptData(filteredCookies);
        
        // 在Windows上使用安全的文件写入方式
        if (process.platform === 'win32') {
          // 先写入临时文件，然后重命名
          const tempFilePath = `${finalCookiePath}.tmp`;
          fs.writeFileSync(tempFilePath, encryptedCookies, 'utf8');
          
          // 如果目标文件已存在，先删除
          if (fs.existsSync(finalCookiePath)) {
            fs.unlinkSync(finalCookiePath);
          }
          
          // 重命名临时文件
          fs.renameSync(tempFilePath, finalCookiePath);
        } else {
          // 非Windows平台直接写入
          fs.writeFileSync(finalCookiePath, encryptedCookies, 'utf8');
        }
        
        console.log(`成功保存账号 ${account.username} 的cookie到文件，共 ${filteredCookies.length} 个`);
      } catch (err) {
        console.error(`保存cookie文件失败: ${err.message}`);
        // 即使文件保存失败，我们仍然在内存中保存了cookie
      }
      
      // 保存更新后的账号信息
      try {
        await this.saveAccounts();
      } catch (err) {
        console.error(`保存账号信息失败: ${err.message}`);
        // 继续执行，因为cookie已经保存
      }
      
      // 更新账号状态为在线
      this.accounts[index].status = 'online';
      
      return true;
    } catch (error) {
      console.error('保存cookie失败:', error);
      return false;
    }
  }

  /**
   * 加载账号的cookie到session中
   * @param {string} accountId - 账号ID
   * @param {BrowserWindow} win - 浏览器窗口实例
   * @returns {Promise<boolean>} 是否加载成功
   */
  async loadCookiesForAccount(accountId, win) {
    try {
      if (!win) {
        throw new Error('窗口参数为空');
      }
      
      if (win.isDestroyed()) {
        throw new Error('窗口已关闭或不存在');
      }
      
      // 查找账号
      const account = this.accounts.find(acc => acc.id === accountId);
      if (!account) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }
      
      console.log(`开始为账号 ${account.username} (${account.platform}) 加载cookie...`);
      
      // 尝试从账号对象中加载cookie
      if (account.cookies && Array.isArray(account.cookies) && account.cookies.length > 0) {
        console.log(`从内存中加载账号 ${account.username} 的cookie，共 ${account.cookies.length} 个`);
        
        // 设置cookie到session
        let successCount = 0;
        let failCount = 0;
        
        for (const cookie of account.cookies) {
          try {
            // 构建cookie对象，确保所有必要字段都存在
            const cookieObj = {
              url: cookie.domain ? 
                (cookie.secure ? 'https://' : 'http://') + cookie.domain : 
                'https://example.com',
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path || '/',
              secure: !!cookie.secure,
              httpOnly: !!cookie.httpOnly,
              expirationDate: cookie.expirationDate || (Date.now() / 1000 + 365 * 24 * 60 * 60) // 默认一年
            };
            
            // 在Windows上，某些cookie可能需要特殊处理
            if (process.platform === 'win32') {
              // 确保domain不以点开头（Windows上可能有问题）
              if (cookieObj.domain && cookieObj.domain.startsWith('.')) {
                cookieObj.domain = cookieObj.domain.substring(1);
              }
              
              // 确保URL格式正确
              if (!cookieObj.url.includes('://')) {
                cookieObj.url = 'https://' + cookieObj.domain;
              }
            }
            
            await win.webContents.session.cookies.set(cookieObj);
            successCount++;
          } catch (err) {
            failCount++;
            console.error(`设置cookie失败: ${cookie.name}=${cookie.value}, 错误: ${err.message}`);
            
            // 尝试使用简化的cookie对象重试一次
            try {
              const simpleCookie = {
                url: 'https://' + (cookie.domain || 'example.com'),
                name: cookie.name,
                value: cookie.value
              };
              await win.webContents.session.cookies.set(simpleCookie);
              console.log(`使用简化参数重试设置cookie成功: ${cookie.name}`);
              successCount++; // 重试成功
              failCount--; // 减去之前计数的失败
            } catch (retryErr) {
              console.error(`重试设置cookie仍然失败: ${cookie.name}, 错误: ${retryErr.message}`);
              // 继续处理其他cookie
            }
          }
        }
        
        console.log(`成功加载账号 ${account.username} 的cookie到session，成功: ${successCount}，失败: ${failCount}`);
        
        // 即使有部分失败，只要有成功的就返回true
        if (successCount > 0) {
          return true;
        }
      }
      
      // 如果内存中没有cookie或全部设置失败，尝试从文件加载
      const cookieFilePath = path.join(
        this.profilesDir, 
        `${account.platform}-${account.username}`, 
        'cookies.json'
      );
      
      console.log(`尝试从文件加载cookie: ${cookieFilePath}`);
      
      // 检查文件是否存在
      if (!fs.existsSync(cookieFilePath)) {
        console.log(`账号 ${account.username} 没有保存的cookie文件: ${cookieFilePath}`);
        
        // 在Windows上检查路径是否过长
        if (process.platform === 'win32' && cookieFilePath.length > 260) {
          console.warn(`Windows路径过长可能导致问题: ${cookieFilePath.length} 字符`);
          
          // 尝试使用短路径
          try {
            const shortPath = path.join(
              this.profilesDir,
              Buffer.from(`${account.platform}-${account.username}`).toString('base64').substring(0, 10),
              'cookies.json'
            );
            
            if (fs.existsSync(shortPath)) {
              console.log(`找到备用短路径cookie文件: ${shortPath}`);
              return await this.loadCookiesFromFile(shortPath, win, account);
            }
          } catch (err) {
            console.error(`尝试使用短路径失败: ${err.message}`);
          }
        }
        
        return false;
      }
      
      return await this.loadCookiesFromFile(cookieFilePath, win, account);
    } catch (error) {
      console.error('加载cookie失败:', error);
      return false;
    }
  }
  
  /**
   * 从文件加载cookie到session
   * @private
   * @param {string} filePath - cookie文件路径
   * @param {BrowserWindow} win - 浏览器窗口实例
   * @param {Object} account - 账号对象
   * @returns {Promise<boolean>} 是否加载成功
   */
  async loadCookiesFromFile(filePath, win, account) {
    try {
      // 读取并解密cookie文件
      const encryptedData = fs.readFileSync(filePath, 'utf8');
      const cookies = this.decryptData(encryptedData);
      
      if (!Array.isArray(cookies) || cookies.length === 0) {
        console.warn(`账号 ${account.username} 的cookie文件格式无效或为空`);
        return false;
      }
      
      console.log(`从文件加载账号 ${account.username} 的cookie，共 ${cookies.length} 个`);
      
      // 设置cookie到session
      let successCount = 0;
      let failCount = 0;
      
      for (const cookie of cookies) {
        try {
          // 构建cookie对象，确保所有必要字段都存在
          const cookieObj = {
            url: cookie.domain ? 
              (cookie.secure ? 'https://' : 'http://') + cookie.domain : 
              'https://example.com',
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: !!cookie.secure,
            httpOnly: !!cookie.httpOnly,
            expirationDate: cookie.expirationDate || (Date.now() / 1000 + 365 * 24 * 60 * 60) // 默认一年
          };
          
          // 在Windows上，某些cookie可能需要特殊处理
          if (process.platform === 'win32') {
            // 确保domain不以点开头（Windows上可能有问题）
            if (cookieObj.domain && cookieObj.domain.startsWith('.')) {
              cookieObj.domain = cookieObj.domain.substring(1);
            }
            
            // 确保URL格式正确
            if (!cookieObj.url.includes('://')) {
              cookieObj.url = 'https://' + cookieObj.domain;
            }
          }
          
          await win.webContents.session.cookies.set(cookieObj);
          successCount++;
        } catch (err) {
          failCount++;
          console.error(`设置cookie失败: ${cookie.name}=${cookie.value}, 错误: ${err.message}`);
          
          // 尝试使用简化的cookie对象重试一次
          try {
            const simpleCookie = {
              url: 'https://' + (cookie.domain || 'example.com'),
              name: cookie.name,
              value: cookie.value
            };
            await win.webContents.session.cookies.set(simpleCookie);
            console.log(`使用简化参数重试设置cookie成功: ${cookie.name}`);
            successCount++; // 重试成功
            failCount--; // 减去之前计数的失败
          } catch (retryErr) {
            console.error(`重试设置cookie仍然失败: ${cookie.name}, 错误: ${retryErr.message}`);
            // 继续处理其他cookie
          }
        }
      }
      
      console.log(`从文件加载账号 ${account.username} 的cookie，成功: ${successCount}，失败: ${failCount}`);
      
      // 更新账号对象中的cookie
      const index = this.accounts.findIndex(acc => acc.id === account.id);
      if (index !== -1) {
        this.accounts[index].cookies = cookies;
        this.accounts[index].lastCookieSaveTime = new Date().toISOString();
        
        // 保存更新后的账号信息
        try {
          await this.saveAccounts();
        } catch (err) {
          console.error(`更新账号cookie信息失败: ${err.message}`);
        }
      }
      
      return successCount > 0;
    } catch (err) {
      console.error(`从文件加载cookie失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 刷新所有账号状态
   * @returns {Promise<Array>} 更新后的账号列表
   */
  async refreshAccountStatus() {
    try {
      // 遍历所有账号
      for (const account of this.accounts) {
        try {
          // 检查是否有活跃窗口
          const sessionId = `${account.platform}-${account.username}`;
          let isActive = false;
          let hasValidCookie = false;
          
          // 检查是否有窗口管理器
          if (this.windowManager) {
            isActive = this.windowManager.hasWindow(sessionId);
            
            // 检查窗口管理器中的账号状态
            const accountStatus = this.windowManager.getAccountStatus(account.username);
            if (accountStatus && accountStatus.status === 'online' && 
                accountStatus.lastUpdate && 
                (Date.now() - accountStatus.lastUpdate) < 30 * 60 * 1000) { // 30分钟内的状态更新
              console.log(`账号 ${account.username} 通过窗口管理器检测为在线状态`);
              account.status = 'online';
              account.lastStatusCheck = new Date().toISOString();
              continue; // 跳过其他检查
            }
          }
          
          // 检查是否有保存的cookie
          if (account.cookies && account.lastCookieSaveTime) {
            const lastSaveTime = new Date(account.lastCookieSaveTime);
            const now = new Date();
            const hoursSinceSave = (now - lastSaveTime) / (1000 * 60 * 60);
            
            // 如果cookie保存时间在72小时内，认为是有效的
            if (hoursSinceSave < 72) {
              hasValidCookie = true;
              console.log(`账号 ${account.username} 的cookie有效(保存于${hoursSinceSave.toFixed(2)}小时前)`);
            } else {
              console.log(`账号 ${account.username} 的cookie已过期(${hoursSinceSave.toFixed(2)}小时前)`);
            }
          }
          
          // 更新账号状态
          if (isActive) {
            account.status = 'online';
            account.lastStatusCheck = new Date().toISOString();
            console.log(`账号 ${account.username} 有活跃窗口，状态设置为在线`);
          } else if (hasValidCookie) {
            account.status = 'online'; // 有cookie就视为在线状态
            account.lastStatusCheck = new Date().toISOString();
            console.log(`账号 ${account.username} 无活跃窗口但有有效cookie，状态设置为在线`);
          } else {
            account.status = 'offline';
            account.lastStatusCheck = new Date().toISOString();
            console.log(`账号 ${account.username} 无活跃窗口且无有效cookie，状态设置为离线`);
          }
        } catch (err) {
          console.error(`刷新账号 ${account.username} 状态时出错:`, err);
          account.status = 'error';
          account.lastStatusCheck = new Date().toISOString();
        }
      }
      
      // 保存更新后的账号列表
      await this.saveAccounts();
      
      return this.accounts;
    } catch (error) {
      console.error('刷新账号状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 检查账号登录状态
   * @param {string} accountId - 账号ID
   * @returns {Promise<Object>} 登录状态信息
   */
  async checkLoginStatus(accountId) {
    try {
      // 查找账号
      const account = this.accounts.find(acc => acc.id === accountId);
      if (!account) {
        throw new Error(`账号ID不存在: ${accountId}`);
      }
      
      // 检查窗口管理器中的状态
      if (this.windowManager) {
        const accountStatus = this.windowManager.getAccountStatus(account.username);
        if (accountStatus && accountStatus.status) {
          return {
            status: accountStatus.status,
            lastUpdate: accountStatus.lastUpdate,
            platform: account.platform
          };
        }
      }
      
      // 如果没有窗口管理器状态，检查是否有活跃窗口
      const sessionId = `${account.platform}-${account.username}`;
      const isActive = this.windowManager && this.windowManager.hasWindow(sessionId);
      
      // 检查是否有保存的cookie
      let hasValidCookie = false;
      if (account.cookies && account.lastCookieSaveTime) {
        const lastSaveTime = new Date(account.lastCookieSaveTime);
        const now = new Date();
        const hoursSinceSave = (now - lastSaveTime) / (1000 * 60 * 60);
        
        // 如果cookie保存时间在72小时内，认为是有效的
        if (hoursSinceSave < 72) {
          hasValidCookie = true;
        }
      }
      
      // 返回状态信息 - 修改这里：有有效cookie就设置为online
      return {
        status: isActive || hasValidCookie ? 'online' : 'unknown', // 修改：有cookie也视为在线
        lastUpdate: Date.now(),
        platform: account.platform
      };
    } catch (error) {
      console.error(`检查账号 ${accountId} 登录状态失败:`, error);
      return {
        status: 'error',
        lastUpdate: Date.now(),
        error: error.message
      };
    }
  }
  
  /**
   * 更新账号登录状态
   * @param {string} accountId - 账号ID
   * @param {string} status - 状态（online/offline）
   * @returns {Promise<Object>} 更新后的账号
   */
  async updateAccountStatus(accountId, status) {
    try {
      // 查找账号
      const index = this.accounts.findIndex(acc => acc.id === accountId);
      if (index === -1) {
        throw new Error(`账号ID不存在: ${accountId}`);
      }
      
      // 更新状态
      this.accounts[index].status = status;
      this.accounts[index].lastStatusCheck = new Date().toISOString();
      
      if (status === 'online') {
        this.accounts[index].lastLoginTime = new Date().toISOString();
      }
      
      // 保存更新后的账号列表
      await this.saveAccounts();
      
      return this.accounts[index];
    } catch (error) {
      console.error(`更新账号 ${accountId} 状态失败:`, error);
      throw error;
    }
  }

  /**
   * 强制刷新指定账号的会话
   * @param {string} accountId - 账号ID
   * @returns {Promise<Object>} 刷新结果
   */
  async forceRefreshSession(accountId) {
    try {
      console.log(`开始强制刷新账号会话: ${accountId}`);
      
      // 查找账号
      const account = this.accounts.find(acc => acc.id === accountId);
      if (!account) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }
      
      // 登录前先检查是否已经有活跃窗口，如果有则关闭
      if (this.windowManager) {
        const sessionId = `${account.platform}-${account.username}`;
        const sessions = this.windowManager.getAllWindows();
        if (sessions.has(sessionId) && !sessions.get(sessionId).isDestroyed()) {
          console.log(`关闭账号 ${account.username} 的现有窗口`);
          try {
            sessions.get(sessionId).close();
            // 等待窗口完全关闭
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (err) {
            console.error('关闭窗口失败:', err);
          }
        }
      }
      
      // 使用静默模式登录账号
      await this.loginAccount(account.id, true);
      
      // 等待登录完成
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 验证登录状态
      await this.refreshAccountStatus();
      const updatedAccount = this.accounts.find(acc => acc.id === account.id);
      
      if (updatedAccount && updatedAccount.status === 'online') {
        console.log(`账号 ${account.username} 会话刷新成功`);
        
        // 记录成功的刷新时间
        const index = this.accounts.findIndex(acc => acc.id === account.id);
        if (index !== -1) {
          this.accounts[index].lastRefreshTime = new Date().toISOString();
          await this.saveAccounts();
        }
        
        return {
          success: true,
          message: `账号 ${account.username} 会话刷新成功`,
          account: {
            id: updatedAccount.id,
            username: updatedAccount.username,
            platform: updatedAccount.platform,
            status: updatedAccount.status,
            lastLoginTime: updatedAccount.lastLoginTime
          }
        };
      } else {
        throw new Error('登录后状态未变为在线');
      }
    } catch (error) {
      console.error('强制刷新账号会话失败:', error);
      return {
        success: false,
        message: `刷新失败: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * 加密数据
   * @param {Object} data - 需要加密的数据
   * @returns {string} 加密后的数据
   */
  encryptData(data) {
    try {
      // 确保密钥长度为32字节
      const key = Buffer.from(this.encryptionKey.padEnd(32).slice(0, 32));
      
      // 生成随机IV
      const iv = crypto.randomBytes(16);
      
      // 创建加密算法
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      // 加密数据
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 返回IV + 加密数据
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('加密数据失败:', error);
      throw error;
    }
  }

  /**
   * 解密数据
   * @param {string} encryptedData - 加密的数据
   * @returns {Object} 解密后的数据
   */
  decryptData(encryptedData) {
    try {
      // 确保密钥长度为32字节
      const key = Buffer.from(this.encryptionKey.padEnd(32).slice(0, 32));
      
      // 分离IV和加密数据
      const parts = encryptedData.split(':');
      
      // 安全检查
      if (parts.length !== 2) {
        console.warn('无效的加密数据格式');
        return [];
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      // 创建解密算法
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      // 解密数据
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // 解析JSON数据
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('解密数据失败:', error);
      // 解密失败时返回空数组，而不是抛出异常
      return [];
    }
  }

  /**
   * 批量登录账号
   * @param {Array<string>} accountIds - 要登录的账号ID列表
   * @param {boolean} silent - 是否静默登录（不显示浏览器窗口）
   * @param {number} concurrentLimit - 并发登录的最大数量
   * @returns {Promise<Object>} 登录结果
   */
  async batchLoginAccounts(accountIds, silent = true, concurrentLimit = 3) {
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      throw new Error('账号ID列表不能为空');
    }
    
    console.log(`开始批量登录 ${accountIds.length} 个账号，并发数: ${concurrentLimit}`);
    
    // 结果统计
    const results = {
      total: accountIds.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    
    // 创建任务队列
    const queue = [...accountIds];
    const inProgress = new Set();
    const completed = new Set();
    
    // 定义处理单个账号的函数
    const processAccount = async (accountId) => {
      try {
        if (completed.has(accountId)) return;
        
        inProgress.add(accountId);
        
        // 查找账号
        const account = this.accounts.find(acc => acc.id === accountId);
        if (!account) {
          results.skipped++;
          results.details.push({
            id: accountId,
            status: 'skipped',
            message: '账号不存在'
          });
          return;
        }
        
        console.log(`正在登录账号: ${account.username} (${account.platform})`);
        
        // 执行登录
        const loginResult = await this.loginAccount(accountId, silent);
        
        if (loginResult.success) {
          results.success++;
          results.details.push({
            id: accountId,
            username: account.username,
            platform: account.platform,
            status: 'success',
            message: '登录成功'
          });
        } else {
          results.failed++;
          results.details.push({
            id: accountId,
            username: account.username,
            platform: account.platform,
            status: 'failed',
            message: loginResult.message || '登录失败'
          });
        }
      } catch (error) {
        console.error(`账号 ${accountId} 登录失败:`, error);
        results.failed++;
        results.details.push({
          id: accountId,
          status: 'error',
          message: error.message
        });
      } finally {
        inProgress.delete(accountId);
        completed.add(accountId);
      }
    };
    
    // 并发执行登录任务
    return new Promise((resolve) => {
      const checkQueue = async () => {
        // 如果队列为空且没有正在进行的任务，则完成
        if (queue.length === 0 && inProgress.size === 0) {
          console.log(`批量登录完成，成功: ${results.success}, 失败: ${results.failed}, 跳过: ${results.skipped}`);
          resolve(results);
          return;
        }
        
        // 如果有空闲槽位且队列不为空，则启动新任务
        while (inProgress.size < concurrentLimit && queue.length > 0) {
          const accountId = queue.shift();
          processAccount(accountId).catch(console.error);
        }
        
        // 继续检查队列
        setTimeout(checkQueue, 1000);
      };
      
      // 开始处理队列
      checkQueue();
    });
  }

  /**
   * 设置自动会话维护
   * @param {boolean} enable - 是否启用自动会话维护
   * @param {number} [intervalMinutes=60] - 会话维护间隔（分钟）
   * @param {boolean} [runImmediately=true] - 是否立即执行一次会话维护
   * @returns {boolean} 设置是否成功
   */
  setAutoSessionMaintenance(enable, intervalMinutes = 60, runImmediately = true) {
    try {
      // 清除现有的定时器
      if (this.sessionMaintenanceTimer) {
        clearInterval(this.sessionMaintenanceTimer);
        this.sessionMaintenanceTimer = null;
        console.log('已清除现有的会话维护定时器');
      }
      
      if (enable) {
        // 验证并调整间隔时间
        let interval = parseInt(intervalMinutes, 10);
        
        if (isNaN(interval) || interval < 30) {
          console.warn(`会话维护间隔时间 ${intervalMinutes} 分钟过短，已调整为最小值 30 分钟`);
          interval = 30; // 最小间隔30分钟
        } else if (interval > 1440) {
          console.warn(`会话维护间隔时间 ${intervalMinutes} 分钟过长，已调整为最大值 1440 分钟（24小时）`);
          interval = 1440; // 最大间隔24小时
        }
        
        const intervalMs = interval * 60 * 1000; // 转换为毫秒
        const nextMaintenanceTime = new Date(Date.now() + intervalMs);
        const formattedTime = nextMaintenanceTime.toLocaleTimeString();
        const formattedDate = nextMaintenanceTime.toLocaleDateString();
        
        console.log(`启用自动会话维护，间隔: ${interval} 分钟`);
        console.log(`下次会话维护时间: ${formattedDate} ${formattedTime}`);
        
        // 设置定时器
        this.sessionMaintenanceTimer = setInterval(async () => {
          try {
            console.log(`定时会话维护开始执行，当前时间: ${new Date().toLocaleString()}`);
            const result = await this.maintainSessions();
            
            // 记录详细的维护结果
            console.log(`定时会话维护完成: 共 ${result.total} 个账号，成功: ${result.success}，失败: ${result.failed}`);
            
            // 计算下次维护时间
            const nextTime = new Date(Date.now() + intervalMs);
            console.log(`下次会话维护时间: ${nextTime.toLocaleDateString()} ${nextTime.toLocaleTimeString()}`);
            
            // 如果有失败的账号，发送通知
            if (result.failed > 0) {
              this.emitEvent('session-maintenance-warning', {
                message: `会话维护警告: ${result.failed} 个账号维护失败`,
                result: result
              });
            }
            
            // 发送会话维护完成事件
            this.emitEvent('session-maintenance-complete', result);
          } catch (error) {
            console.error('执行定时会话维护时出错:', error);
            this.emitEvent('session-maintenance-error', {
              message: '执行定时会话维护时出错',
              error: error.message
            });
          }
        }, intervalMs);
        
        // 是否立即执行一次
        if (runImmediately) {
          console.log('立即执行一次会话维护...');
          
          // 使用setTimeout确保异步执行不阻塞主流程
          setTimeout(async () => {
            try {
              const result = await this.maintainSessions();
              console.log(`立即会话维护完成: 共 ${result.total} 个账号，成功: ${result.success}，失败: ${result.failed}`);
              
              // 发送会话维护完成事件
              this.emitEvent('session-maintenance-complete', result);
            } catch (error) {
              console.error('执行立即会话维护时出错:', error);
              this.emitEvent('session-maintenance-error', {
                message: '执行立即会话维护时出错',
                error: error.message
              });
            }
          }, 5000); // 延迟5秒执行，避免与其他初始化操作冲突
        }
        
        return true;
      } else {
        console.log('已禁用自动会话维护');
        return true;
      }
    } catch (error) {
      console.error('设置自动会话维护时出错:', error);
      return false;
    }
  }

  /**
   * 发送事件
   * @param {string} eventName - 事件名称
   * @param {any} data - 事件数据
   */
  emitEvent(eventName, data) {
    try {
      this.emit(eventName, data);
    } catch (error) {
      console.error(`发送事件 ${eventName} 失败:`, error);
    }
  }
}

module.exports = AccountManager; 