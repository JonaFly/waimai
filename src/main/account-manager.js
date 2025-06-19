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
        
        // 或者即将过期的在线账号（超过12小时未登录）
        if (account.status === 'online' && account.lastLoginTime) {
          const lastLogin = new Date(account.lastLoginTime);
          const now = new Date();
          const hoursSinceLogin = (now - lastLogin) / (1000 * 60 * 60);
          return hoursSinceLogin > 12; // 超过12小时自动刷新
        }
        
        return false;
      });
      
      console.log(`找到 ${accountsToRefresh.length} 个账号需要刷新会话`);
      
      // 依次处理每个账号
      for (const account of accountsToRefresh) {
        try {
          console.log(`尝试刷新账号会话: ${account.platform} - ${account.username}`);
          await this.loginAccount(account.id, true); // 静默登录，无需前台显示
          
          // 等待一段时间再处理下一个账号，避免并发问题
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (err) {
          console.error(`刷新账号 ${account.username} 会话失败:`, err);
        }
      }
      
      console.log('会话维护完成');
    } catch (error) {
      console.error('执行会话维护失败:', error);
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
      
      // 使用window-manager创建新窗口并打开登录URL
      const win = this.windowManager.createWindow({
        id: sessionId,
        url: platformConfig.loginUrl,
        title: `${platformConfig.name} - ${account.username}`,
        width: silent ? 800 : 1200,
        height: silent ? 600 : 800,
        show: !silent // 静默模式不显示窗口
      });
      
      // 如果是静默登录，注入自动填充脚本
      if (silent && win) {
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
                    // 查找用户名和密码输入框
                    const usernameInput = document.querySelector('input[type="text"], input[name="username"], input[name="account"], input[name="mobile"]');
                    const passwordInput = document.querySelector('input[type="password"], input[name="password"]');
                    const loginButton = document.querySelector('button[type="submit"], button.login, input[type="submit"], .btn-login, .login-btn');
                    
                    if (usernameInput && passwordInput) {
                      // 自动填充
                      usernameInput.value = ${JSON.stringify(account.username)};
                      passwordInput.value = ${JSON.stringify(account.password)};
                      
                      // 延迟点击登录按钮
                      setTimeout(() => {
                        if (loginButton) {
                          loginButton.click();
                          console.log('自动登录成功');
                        } else {
                          console.warn('未找到登录按钮');
                        }
                      }, 1000);
                      
                      return true;
                    } else {
                      console.warn('未找到登录表单元素');
                      return false;
                    }
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
        
        // 设置超时，一段时间后关闭静默窗口
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.close();
          }
        }, 60000); // 1分钟后关闭
      }

      // 更新登录时间
      const index = this.accounts.findIndex(acc => acc.id === accountId);
      this.accounts[index].lastLoginTime = new Date().toISOString();
      this.accounts[index].status = 'online';
      await this.saveAccounts();

      return true;
    } catch (error) {
      console.error('登录账号失败:', error);
      throw error;
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
                continue;
              }
            }
          } catch (err) {
            console.error('检查窗口状态出错:', err);
          }
        }
        
        // 无活跃窗口时，通过上次登录时间判断
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