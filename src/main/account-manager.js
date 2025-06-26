const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');
const loginScripts = require('./login-scripts');

/**
 * 账号管理器类
 * 负责账号的添加、删除、编辑和登录
 */
class AccountManager {
  /**
   * 构造函数
   * @param {string} encryptionKey - 用于加密账号信息的密钥
   */
  constructor(encryptionKey) {
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
   * @param {number} interval - 检查间隔，默认4小时
   */
  startSessionMaintenance(interval = 4 * 60 * 60 * 1000) {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
    }
    
    this.maintenanceTimer = setInterval(() => {
      this.maintainSessions();
    }, interval);
    
    console.log(`会话维护任务已启动，间隔: ${interval/1000/60/60}小时`);
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
      
      // 确保profile目录存在
      const profileDir = path.join(this.profilesDir, sessionId);
      if (!fs.existsSync(profileDir)) {
        try {
          fs.mkdirSync(profileDir, { recursive: true });
          console.log(`为账号 ${account.username} 创建profile目录: ${profileDir}`);
        } catch (err) {
          console.error(`创建profile目录失败: ${err.message}`);
        }
      }
      
      // 根据平台选择要访问的URL（首页或店铺列表页面）
      let visitUrl;
      switch(account.platform) {
        case 'meituan':
          visitUrl = 'https://waimai.meituan.com/business/v2/index';
          break;
        case 'jd':
          visitUrl = 'https://daojia.jd.com/merchant';
          break;
        default:
          visitUrl = platformConfig.homeUrl || platformConfig.loginUrl;
      }
      
      console.log(`账号 ${account.username} 静默访问页面: ${visitUrl}`);
      
      // 使用window-manager创建新窗口并打开页面，使用账号专属的profile
      const win = this.windowManager.createWindow({
        id: sessionId,
        url: visitUrl,
        title: `${platformConfig.name} - ${account.username} (刷新会话)`,
        width: 800,
        height: 600,
        show: false, // 静默模式不显示窗口
        profileDir: profileDir // 使用账号专属的profile
      });
      
      if (!win) {
        throw new Error('创建窗口失败');
      }
      
      // 等待页面加载完成
      return new Promise((resolve, reject) => {
        // 设置超时
        const timeout = setTimeout(() => {
          if (!win.isDestroyed()) {
            win.close();
          }
          resolve(false);
        }, 30000); // 30秒超时
        
        // 监听页面加载完成事件
        win.webContents.on('did-finish-load', async () => {
          try {
            // 获取当前URL
            const currentUrl = win.webContents.getURL();
            console.log(`账号 ${account.username} 页面加载完成: ${currentUrl}`);
            
            // 检查是否重定向到了登录页面
            if (currentUrl.includes('login') || currentUrl.includes('signin')) {
              console.log(`账号 ${account.username} 被重定向到登录页面，会话可能已失效`);
              if (!win.isDestroyed()) {
                win.close();
              }
              clearTimeout(timeout);
              resolve(false);
              return;
            }
            
            // 等待一段时间，确保页面完全加载和可能的异步操作完成
            await new Promise(r => setTimeout(r, 5000));
            
            // 获取并保存cookie
            const success = await this.saveCookiesForAccount(account.id, win);
            
            // 关闭窗口
            if (!win.isDestroyed()) {
              win.close();
            }
            
            clearTimeout(timeout);
            resolve(success);
          } catch (err) {
            console.error(`账号 ${account.username} 刷新会话失败:`, err);
            if (!win.isDestroyed()) {
              win.close();
            }
            clearTimeout(timeout);
            resolve(false);
          }
        });
        
        // 监听加载失败事件
        win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
          console.error(`账号 ${account.username} 页面加载失败: ${errorDescription} (${errorCode})`);
          if (!win.isDestroyed()) {
            win.close();
          }
          clearTimeout(timeout);
          resolve(false);
        });
      });
    } catch (error) {
      console.error(`账号 ${accountId} 静默访问刷新会话失败:`, error);
      return false;
    }
  }

  /**
   * 维护账号会话
   * 尝试刷新需要维护的账号
   */
  async maintainSessions() {
    try {
      console.log('开始执行会话维护...');
      
      // 先刷新状态
      await this.refreshAccountStatus();
      
      // 找出需要刷新的账号
      const accountsToRefresh = this.accounts.filter(account => {
        // 如果账号状态为离线但未过期，自动登录刷新
        if (account.status === 'offline') {
          return true;
        }
        
        // 检查cookie是否即将过期（超过48小时但小于72小时）
        if (account.status === 'online' && account.lastCookieSaveTime) {
          const lastCookieSave = new Date(account.lastCookieSaveTime);
          const now = new Date();
          const hoursSinceCookieSave = (now - lastCookieSave) / (1000 * 60 * 60);
          
          // 只有当cookie接近过期时（48小时以上）才刷新，避免破坏有效的登录状态
          return hoursSinceCookieSave > 48;
        }
        
        return false;
      });
      
      console.log(`找到 ${accountsToRefresh.length} 个账号需要刷新会话`);
      
      // 依次处理每个账号，增加重试机制
      for (const account of accountsToRefresh) {
        let retryCount = 0;
        const maxRetries = 2; // 最大重试次数
        let success = false;
        
        while (retryCount <= maxRetries && !success) {
          try {
            console.log(`尝试刷新账号会话 (尝试 ${retryCount + 1}/${maxRetries + 1}): ${account.platform} - ${account.username}`);
            
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
            
            // 检查是否有保存的cookie和profile目录
            const hasSavedProfile = account.profileDir && fs.existsSync(account.profileDir);
            const hasSavedCookies = account.cookies && account.lastCookieSaveTime;
            
            // 首先尝试静默访问页面刷新会话（适用于有效cookie的账号）
            if (hasSavedCookies && hasSavedProfile) {
              console.log(`账号 ${account.username} 尝试通过静默访问页面刷新会话`);
              success = await this.refreshSessionBySilentVisit(account.id);
              
              if (success) {
                console.log(`账号 ${account.username} 通过静默访问页面成功刷新会话`);
                
                // 记录成功的刷新时间
                const index = this.accounts.findIndex(acc => acc.id === account.id);
                if (index !== -1) {
                  this.accounts[index].lastRefreshTime = new Date().toISOString();
                  this.accounts[index].status = 'online';
                  await this.saveAccounts();
                }
                
                // 成功刷新，跳出重试循环
                break;
              } else {
                console.log(`账号 ${account.username} 静默访问页面刷新失败，尝试重新登录`);
              }
            }
            
            // 如果静默访问失败或没有有效cookie，尝试重新登录
            if (!success && account.status === 'offline') {
              console.log(`账号 ${account.username} 尝试通过重新登录刷新会话`);
              
              // 使用静默模式登录账号
              await this.loginAccount(account.id, true);
              
              // 等待登录完成
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              // 验证登录状态
              await this.refreshAccountStatus(); // 刷新状态以获取最新信息
              const updatedAccount = this.accounts.find(acc => acc.id === account.id);
              
              if (updatedAccount && updatedAccount.status === 'online') {
                console.log(`账号 ${account.username} 通过重新登录成功刷新会话`);
                success = true;
                
                // 记录成功的刷新时间
                const index = this.accounts.findIndex(acc => acc.id === account.id);
                if (index !== -1) {
                  this.accounts[index].lastRefreshTime = new Date().toISOString();
                  await this.saveAccounts();
                }
              } else {
                throw new Error('登录后状态未变为在线');
              }
            }
          } catch (err) {
            retryCount++;
            console.error(`刷新账号 ${account.username} 会话失败 (尝试 ${retryCount}/${maxRetries + 1}):`, err);
            
            // 如果登录失败但有有效的cookie，不要破坏原有状态
            if (account.cookies && account.lastCookieSaveTime) {
              const lastSaveTime = new Date(account.lastCookieSaveTime);
              const now = new Date();
              const hoursSinceSave = (now - lastSaveTime) / (1000 * 60 * 60);
              
              if (hoursSinceSave < 48) {
                console.log(`账号 ${account.username} 有较新的cookie (${hoursSinceSave.toFixed(2)}小时前)，保留现有状态`);
                // 将状态设置回在线
                const index = this.accounts.findIndex(acc => acc.id === account.id);
                if (index !== -1) {
                  this.accounts[index].status = 'online';
                  await this.saveAccounts();
                }
                success = true; // 视为成功，不再重试
                break;
              }
            }
            
            if (retryCount <= maxRetries) {
              // 增加重试间隔时间，避免过于频繁的请求
              const waitTime = retryCount * 8000; // 8秒，16秒
              console.log(`等待 ${waitTime/1000} 秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
        
        // 即使成功也等待一段时间再处理下一个账号，避免并发问题
        const waitBetweenAccounts = 10000; // 10秒
        console.log(`等待 ${waitBetweenAccounts/1000} 秒后处理下一个账号...`);
        await new Promise(resolve => setTimeout(resolve, waitBetweenAccounts));
      }
      
      console.log('会话维护完成');
      
      // 返回维护结果统计
      return {
        total: accountsToRefresh.length,
        refreshed: accountsToRefresh.filter(acc => {
          const account = this.accounts.find(a => a.id === acc.id);
          return account && account.status === 'online';
        }).length
      };
    } catch (error) {
      console.error('执行会话维护失败:', error);
      return { total: 0, refreshed: 0, error: error.message };
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
      if (!win || win.isDestroyed()) {
        throw new Error('窗口已关闭或不存在');
      }
      
      // 获取当前窗口的所有cookie
      const cookies = await win.webContents.session.cookies.get({});
      
      if (!cookies || cookies.length === 0) {
        console.warn('没有找到可保存的cookie');
        return false;
      }
      
      // 查找账号
      const index = this.accounts.findIndex(acc => acc.id === accountId);
      if (index === -1) {
        throw new Error(`未找到ID为 ${accountId} 的账号`);
      }
      
      // 保存cookie到账号信息中
      this.accounts[index].cookies = cookies;
      this.accounts[index].lastCookieSaveTime = new Date().toISOString();
      
      // 保存cookie到本地文件
      const account = this.accounts[index];
      const cookieFilePath = path.join(
        this.profilesDir, 
        `${account.platform}-${account.username}`, 
        'cookies.json'
      );
      
      // 加密保存cookie
      const encryptedCookies = this.encryptData(cookies);
      fs.writeFileSync(cookieFilePath, encryptedCookies, 'utf8');
      
      console.log(`成功保存账号 ${account.username} 的cookie，共 ${cookies.length} 个`);
      
      // 保存更新后的账号信息
      await this.saveAccounts();
      
      return true;
    } catch (error) {
      console.error('保存cookie失败:', error);
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
            account.status = 'online'; // 修改：有cookie就视为在线状态
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
}

module.exports = AccountManager; 