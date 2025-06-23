const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');

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
        
        // 或者即将过期的在线账号（超过4小时未登录）
        if (account.status === 'online' && account.lastLoginTime) {
          const lastLogin = new Date(account.lastLoginTime);
          const now = new Date();
          const hoursSinceLogin = (now - lastLogin) / (1000 * 60 * 60);
          return hoursSinceLogin > 4; // 超过4小时自动刷新
        }
        
        return false;
      });
      
      console.log(`找到 ${accountsToRefresh.length} 个账号需要刷新会话`);
      
      // 依次处理每个账号，增加重试机制
      for (const account of accountsToRefresh) {
        let retryCount = 0;
        const maxRetries = 3; // 增加最大重试次数
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
            
            // 如果有保存的cookie且不太旧，优先使用它们
            if (hasSavedCookies && hasSavedProfile) {
              const lastSaveTime = new Date(account.lastCookieSaveTime);
              const now = new Date();
              const hoursSinceSave = (now - lastSaveTime) / (1000 * 60 * 60);
              
              if (hoursSinceSave < 24) {
                console.log(`使用保存的profile和cookie登录账号 ${account.username}`);
              }
            }
            
            // 使用静默模式登录账号
            await this.loginAccount(account.id, true);
            
            // 等待登录完成
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 验证登录状态
            await this.refreshAccountStatus(); // 刷新状态以获取最新信息
            const updatedAccount = this.accounts.find(acc => acc.id === account.id);
            
            if (updatedAccount && updatedAccount.status === 'online') {
              console.log(`账号 ${account.username} 会话刷新成功`);
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
          } catch (err) {
            retryCount++;
            console.error(`刷新账号 ${account.username} 会话失败 (尝试 ${retryCount}/${maxRetries + 1}):`, err);
            
            if (retryCount <= maxRetries) {
              // 增加重试间隔时间，避免过于频繁的请求
              const waitTime = retryCount * 8000; // 8秒，16秒，24秒
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
              await win.webContents.executeJavaScript(`
                (function() {
                  try {
                    console.log('正在尝试自动填充登录信息...');
                    const currentPlatform = ${JSON.stringify(account.platform)};
                    
                    // 更全面的选择器，匹配更多可能的输入框
                    const usernameSelectors = [
                      'input[type="text"]', 
                      'input[name="username"]', 
                      'input[name="account"]', 
                      'input[name="mobile"]',
                      'input[placeholder*="账号"]',
                      'input[placeholder*="用户名"]',
                      'input[placeholder*="手机"]',
                      'input.username',
                      '#username',
                      '#account',
                      '#mobile'
                    ];
                    
                    const passwordSelectors = [
                      'input[type="password"]', 
                      'input[name="password"]',
                      'input[placeholder*="密码"]',
                      'input.password',
                      '#password'
                    ];
                    
                    const buttonSelectors = [
                      'button[type="submit"]', 
                      'button.login', 
                      'input[type="submit"]', 
                      '.btn-login', 
                      '.login-btn',
                      'button:contains("登录")',
                      'button[class*="login"]',
                      'button[class*="submit"]',
                      'a.login',
                      'a[class*="login"]'
                    ];

                    // 特殊平台处理
                    if (currentPlatform === 'meituan') {
                      try {
                        console.log('检测到美团平台，使用特殊处理流程');
                        var username = account.username;
                        var password = account.password;
                        
                        // 封装成函数，延迟执行
                        function fillMeituanLoginForm(username, password) {
                          try {
                            // 查找表单元素
                            var usernameInput = document.querySelector('input[placeholder*="账号"]') || 
                                              document.querySelector('input[type="text"]') ||
                                              document.querySelectorAll('input')[0];
                            
                            var passwordInput = document.querySelector('input[type="password"]') ||
                                             document.querySelectorAll('input')[1];
                            
                            var checkbox = document.querySelector('input[type="checkbox"]');
                            
                            var loginButton = document.querySelector('button[class*="login"]');
                            if (!loginButton) {
                              var buttons = Array.from(document.querySelectorAll('button'));
                              for (var i = 0; i < buttons.length; i++) {
                                if (buttons[i].textContent && buttons[i].textContent.includes('登录')) {
                                  loginButton = buttons[i];
                                  break;
                                }
                              }
                            }
                            
                            console.log('美团登录元素检测完成');
                            
                            if (usernameInput && passwordInput) {
                              // 填充用户名和密码
                              usernameInput.value = username;
                              usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
                              usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
                              
                              passwordInput.value = password;
                              passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                              passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                              
                              // 勾选复选框
                              if (checkbox && !checkbox.checked) {
                                checkbox.click();
                              }
                              
                              // 点击登录按钮
                              setTimeout(function() {
                                if (loginButton) {
                                  loginButton.click();
                                }
                              }, 1000);
                            }
                          } catch (err) {
                            console.error('美团登录自动填充失败:', err);
                          }
                        }
                        
                        // 延迟执行填充函数
                        setTimeout(function() {
                          fillMeituanLoginForm(username, password);
                        }, 2000);
                        
                        return true;
                      } catch (e) {
                        console.error('美团登录处理失败:', e);
                        return false;
                      }
                    } else {
                      // 标准登录处理流程
                      // 尝试查找用户名输入框
                      let usernameInput = null;
                      for (const selector of usernameSelectors) {
                        const input = document.querySelector(selector);
                        if (input) {
                          usernameInput = input;
                          console.log('找到用户名输入框:', selector);
                          break;
                        }
                      }
                      
                      // 尝试查找密码输入框
                      let passwordInput = null;
                      for (const selector of passwordSelectors) {
                        const input = document.querySelector(selector);
                        if (input) {
                          passwordInput = input;
                          console.log('找到密码输入框:', selector);
                          break;
                        }
                      }
                      
                      // 尝试查找登录按钮
                      let loginButton = null;
                      for (const selector of buttonSelectors) {
                        try {
                          const button = document.querySelector(selector);
                          if (button) {
                            loginButton = button;
                            console.log('找到登录按钮:', selector);
                            break;
                          }
                        } catch (e) {
                          // 某些选择器可能不被支持，忽略错误
                        }
                      }
                      
                      // 如果没有找到登录按钮，尝试查找包含"登录"文本的按钮
                      if (!loginButton) {
                        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
                        for (const btn of buttons) {
                          if (btn.innerText && btn.innerText.includes('登录')) {
                            loginButton = btn;
                            console.log('通过文本内容找到登录按钮');
                            break;
                          }
                        }
                      }
                      
                      if (usernameInput && passwordInput) {
                        // 清除现有值并聚焦
                        usernameInput.value = '';
                        usernameInput.focus();
                        
                        // 模拟用户输入
                        const username = ${JSON.stringify(account.username)};
                        for (let i = 0; i < username.length; i++) {
                          usernameInput.value += username[i];
                          // 触发输入事件
                          const event = new Event('input', { bubbles: true });
                          usernameInput.dispatchEvent(event);
                        }
                        
                        // 对密码框执行相同操作
                        passwordInput.value = '';
                        passwordInput.focus();
                        
                        const password = ${JSON.stringify(account.password)};
                        for (let i = 0; i < password.length; i++) {
                          passwordInput.value += password[i];
                          // 触发输入事件
                          const event = new Event('input', { bubbles: true });
                          passwordInput.dispatchEvent(event);
                        }
                        
                        // 触发change事件
                        usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
                        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        console.log('已填充用户名和密码');
                        
                        // 检查是否有需要点击的复选框（同意协议等）
                        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                        checkboxes.forEach(checkbox => {
                          if (!checkbox.checked && 
                              (checkbox.id && checkbox.id.toLowerCase().includes('agreement') || 
                               checkbox.name && checkbox.name.toLowerCase().includes('agreement') ||
                               checkbox.closest('label') && checkbox.closest('label').textContent.includes('同意'))) {
                            console.log('点击同意协议复选框');
                            checkbox.click();
                            checkbox.checked = true;
                          }
                        });
                        
                        // 延迟点击登录按钮
                        setTimeout(() => {
                          if (loginButton) {
                            console.log('点击登录按钮');
                            loginButton.click();
                          } else {
                            console.warn('未找到登录按钮');
                          }
                        }, 1500);
                        
                        return true;
                      } else {
                        console.warn('未找到登录表单元素');
                        return false;
                      }
                    }
                    
                    return false;
                  } catch (err) {
                    console.error('自动登录脚本执行出错:', err);
                    return false;
                  }
                })();
              `);
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
   * 刷新账号状态
   * @returns {Promise<Array>} 更新后的账号列表
   */
  async refreshAccountStatus() {
    try {
      // 获取所有会话
      const sessions = this.windowManager ? this.windowManager.getAllWindows() : new Map();
      
      // 为每个账号更新状态
      for (let i = 0; i < this.accounts.length; i++) {
        const account = this.accounts[i];
        const sessionId = `${account.platform}-${account.username}`;
        
        // 检查是否有活跃的浏览器窗口
        const hasActiveWindow = sessions.has(sessionId) && !sessions.get(sessionId).isDestroyed();
        
        if (hasActiveWindow) {
          // 如果有活跃窗口，尝试检查登录状态
          try {
            const win = sessions.get(sessionId);
            // 获取平台配置
            const platformConfig = this.platformConfigs[account.platform];
            
            if (platformConfig && platformConfig.checkUrl) {
              // 检查当前URL是否在平台域内
              const currentUrl = await win.webContents.getURL();
              const isInPlatformDomain = currentUrl.includes(new URL(platformConfig.loginUrl).hostname);
              
              if (isInPlatformDomain) {
                // 尝试判断是否已登录
                const isLoggedIn = !currentUrl.includes('login') && 
                                   (currentUrl.includes('/home') || 
                                    currentUrl.includes('/index') || 
                                    currentUrl.includes('/dashboard'));
                
                this.accounts[i].status = isLoggedIn ? 'online' : 'offline';
                this.accounts[i].lastCheckTime = new Date().toISOString();
                
                // 如果登录状态为在线，保存cookie
                if (isLoggedIn) {
                  await this.saveCookiesForAccount(account.id, win);
                }
                
                continue;
              }
            }
          } catch (err) {
            console.error('检查窗口状态出错:', err);
          }
        }
        
        // 无活跃窗口时，先检查是否有保存的cookie
        if (account.cookies && account.lastCookieSaveTime) {
          const lastSaveTime = new Date(account.lastCookieSaveTime);
          const now = new Date();
          const hoursSinceSave = (now - lastSaveTime) / (1000 * 60 * 60);
          
          // 如果cookie保存时间在24小时内，认为状态是离线但可恢复
          if (hoursSinceSave < 24) {
            this.accounts[i].status = 'offline';
            console.log(`账号 ${account.username} 无活跃窗口但有有效cookie(保存于${hoursSinceSave.toFixed(2)}小时前)`);
            continue;
          } else {
            console.log(`账号 ${account.username} 的cookie已过期(${hoursSinceSave.toFixed(2)}小时前)`);
            // 继续检查登录时间
          }
        }
        
        // 通过上次登录时间判断
        if (account.lastLoginTime) {
          const lastLogin = new Date(account.lastLoginTime);
          const now = new Date();
          const hoursSinceLogin = (now - lastLogin) / (1000 * 60 * 60);
          
          if (hoursSinceLogin < 24) {
            this.accounts[i].status = 'online';
          } else if (hoursSinceLogin < 72) {
            this.accounts[i].status = 'offline';
          } else {
            this.accounts[i].status = 'expired';
          }
        } else {
          this.accounts[i].status = 'unknown';
        }
      }
      
      await this.saveAccounts();
      return this.getAccounts();
    } catch (error) {
      console.error('刷新账号状态失败:', error);
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